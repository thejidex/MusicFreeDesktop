"use strict";

// Exercises the actual temporary HTTP server with generated, non-personal data.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const ts = require("typescript");

const repo = path.resolve(__dirname, "../..");
const sourceDir = path.join(repo, "src/shared/playlist-exchange");
const compile = filename => ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
function load(filename, dependencies = {}) {
    const loaded = { exports: {} };
    const resolve = name => Object.prototype.hasOwnProperty.call(dependencies, name) ? dependencies[name] : require(name);
    new Function("module", "exports", "require", compile(filename))(loaded, loaded.exports, resolve);
    return loaded.exports;
}

const schema = load(path.join(sourceDir, "index.ts"));
const handlers = new Map();
const electron = {
    ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
    app: { on() {} },
};
const transport = load(path.join(sourceDir, "main.ts"), {
    electron,
    "./index": schema,
    os: { ...os, networkInterfaces: () => ({ "test-ethernet": [{ address: "127.0.0.1", family: "IPv4", internal: false }] }) },
}).default;
transport.setup();

const track = id => ({
    source: { platform: "fixture-plugin", id: String(id), pluginData: { cid: id, url: "https://expired.invalid/audio", cookie: "secret" } },
    metadata: { title: `Song ${id}`, artist: "Artist", album: "Album", editedFields: [] },
});
const localTrack = {
    source: { platform: "本地", id: "C:\\Users\\private\\selected.wav", pluginData: {} },
    metadata: { title: "Local", artist: "", album: "", editedFields: [] },
    localAudio: { needsFile: true },
};
const document = {
    format: schema.EXCHANGE_FORMAT,
    formatVersion: schema.EXCHANGE_VERSION,
    exportId: "test-export",
    sourceDevice: { id: "test-device", platform: "desktop", appVersion: "1.5" },
    createdAt: "2026-11-11T00:00:00.000Z",
    plugins: [{ id: "fixture-plugin", installSources: ["https://example.invalid/plugin.js?token=secret"] }],
    attachments: [],
    playlists: [{ sourceSheetId: "selected-sheet", title: "千首测试歌单", order: 0, isFavorite: false, isStarred: false,
        tracks: [...Array.from({ length: 1000 }, (_, index) => track(index)), localTrack] }],
};

const digest = data => crypto.createHash("sha256").update(data).digest("hex");
const request = url => fetch(url, { signal: AbortSignal.timeout(10000) });
function abortDownload(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, response => {
            assert.equal(response.statusCode, 200);
            response.once("data", chunk => { response.destroy(); resolve(chunk.length); });
            response.once("error", error => { if (error.code !== "ECONNRESET") reject(error); });
        });
        req.once("error", error => { if (error.code !== "ECONNRESET") reject(error); });
        req.setTimeout(10000, () => req.destroy(new Error("cancel test timed out")));
    });
}

async function main() {
    const outputRoot = path.join(repo, "out");
    fs.mkdirSync(outputRoot, { recursive: true });
    const fixtureDir = fs.mkdtempSync(path.join(outputRoot, "playlist-transport-test-"));
    const selected = path.join(fixtureDir, "selected.wav");
    const unselected = path.join(fixtureDir, "unselected.txt");
    const bytes = crypto.randomBytes(2 * 1024 * 1024);
    fs.writeFileSync(selected, bytes);
    fs.writeFileSync(unselected, "unselected private fixture");
    try {
        const start = handlers.get("@shared/playlist-exchange/start");
        const stop = handlers.get("@shared/playlist-exchange/stop");
        assert(start && stop, "expected IPC handlers");
        await assert.rejects(start(null, { document, files: [{ playlistId: "selected-sheet", trackIndex: 0, path: selected }] }), /不匹配/);
        const session = await start(null, { document, files: [{ playlistId: "selected-sheet", trackIndex: 1000, path: selected }] });
        assert.equal(session.urls.length, 1);
        assert.equal(session.totalBytes, bytes.length);
        assert(session.expiresAt > Date.now());
        const base = session.urls[0];
        const invalidToken = new URL(base);
        invalidToken.pathname = `/v1/${"0".repeat(64)}`;
        assert.equal((await request(invalidToken)).status, 404);
        assert.equal((await request(`${base}/attachments/${"0".repeat(32)}`)).status, 404);
        const response = await request(base);
        assert.equal(response.status, 200);
        const body = await response.text();
        const received = schema.parseExchangeInput(body).document;
        assert.equal(received.playlists.length, 1);
        assert.equal(received.playlists[0].tracks.length, 1001);
        assert.deepEqual(received.playlists[0].tracks.slice(0, 1000).map(item => item.source.id), Array.from({ length: 1000 }, (_, index) => String(index)));
        assert(!body.includes("C:\\\\Users") && !body.includes("secret") && !body.includes("unselected"));
        assert.equal(received.plugins[0].installSources[0], "https://example.invalid/plugin.js");
        assert.equal(received.playlists[0].tracks[0].source.pluginData.cid, 0);
        assert.equal(received.attachments.length, 1);
        const attachment = received.attachments[0];
        assert.equal(attachment.sha256, digest(bytes));
        assert.equal(received.playlists[0].tracks[1000].localAudio.attachmentId, attachment.id);
        const attachmentUrl = `${base}/attachments/${attachment.id}`;
        assert((await abortDownload(attachmentUrl)) > 0);
        const retry = await request(attachmentUrl);
        assert.equal(retry.status, 200);
        assert.equal(retry.headers.get("x-content-sha256"), digest(bytes));
        assert.equal(digest(Buffer.from(await retry.arrayBuffer())), digest(bytes));

        const modified = Buffer.from(bytes);
        modified[0] ^= 0xff;
        fs.writeFileSync(selected, modified);
        const altered = Buffer.from(await (await request(attachmentUrl)).arrayBuffer());
        assert.notEqual(digest(altered), attachment.sha256, "receiver can detect a changed file");
        fs.writeFileSync(selected, bytes);
        assert.equal((await request(base)).status, 200, "retry keeps the session alive");
        assert.equal(await stop(null, "different-session"), false);
        assert.equal((await fetch(`${base}/complete`, { method: "POST", signal: AbortSignal.timeout(10000) })).status, 204);
        await new Promise(resolve => setTimeout(resolve, 250));
        await assert.rejects(request(base), /fetch failed/i);

        const expires = await start(null, { document, files: [] });
        transport.session.expiresAt = Date.now() - 1;
        assert.equal((await request(expires.urls[0])).status, 410);
        await stop(null, expires.id);
        console.log("PASS: real HTTP session, 1,000-track order, token and attachment scope, cancellation/retry, hash mismatch detection, completion and expiry");
    } finally {
        await transport.stop("");
        fs.unlinkSync(selected);
        fs.unlinkSync(unselected);
        fs.rmdirSync(fixtureDir);
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
