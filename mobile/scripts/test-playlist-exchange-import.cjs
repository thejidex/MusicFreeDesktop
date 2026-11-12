"use strict";

// Exercises the mobile import orchestration with in-memory storage and plugin adapters.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const repo = path.resolve(__dirname, "../..");
function load(filename, dependencies = {}) {
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
    const loaded = { exports: {} };
    new Function("module", "exports", "require", code)(loaded, loaded.exports, name =>
        Object.prototype.hasOwnProperty.call(dependencies, name) ? dependencies[name] : require(name));
    return loaded.exports;
}

const schema = load(path.join(repo, "src/shared/playlist-exchange/index.ts"));
const { LibraryData } = load(path.join(repo, "mobile/src/core/library-data.ts"));
const storage = new Map();
const library = new LibraryData({
    getString: key => storage.get(key), set: (key, value) => storage.set(key, value),
    delete: key => storage.delete(key), getAllKeys: () => [...storage.keys()],
});
const clone = value => structuredClone(value);
let sheets = [
    { id: "favorite", platform: "本地", title: "我喜欢", musicList: [] },
    { id: "other-source-sheet", platform: "本地", title: "同名歌单", exchangeSourceDeviceId: "other-device", exchangeSourceSheetId: "sheet-1", musicList: [] },
];
let starred = [];
let generatedId = 0;
let failLibraryCommit = false;
const replaceSnapshot = library.replaceSnapshotExact.bind(library);
library.replaceSnapshotExact = snapshot => {
    replaceSnapshot(snapshot);
    if (failLibraryCommit) { failLibraryCommit = false; throw new Error("injected library write failure"); }
};
const musicSheet = {
    defaultSheet: { id: "favorite" },
    backupSheets: () => clone(sheets),
    getStarredSheets: () => clone(starred),
    applyExchangeState: async (nextSheets, nextStarred) => { sheets = clone(nextSheets); starred = clone(nextStarred); },
};
const pluginManager = {
    getByName: () => undefined,
    isPluginEnabled: () => false,
    getEnabledPlugins: () => [],
    installPluginFromUrl: async () => { throw new Error("injected plugin install failure"); },
};
const mobile = load(path.join(repo, "mobile/src/core/playlistExchange/index.ts"), {
    nanoid: { nanoid: () => `generated-${++generatedId}` },
    "react-native": { Platform: { OS: "android" } },
    "react-native-device-info": { getVersion: () => "1.5" },
    "@/utils/getOrCreateMMKV": () => ({ getString: () => undefined, set() {} }),
    "@/core/musicSheet": musicSheet,
    "@/core/pluginManager": pluginManager,
    "@/core/library": { library },
    "@/constants/commonConst": { internalSerializeKey: "$" },
    "@/utils/mediaUtils": { getLocalPath: item => item.$?.localPath },
    "./attachments": {
        downloadExchangeAttachments: async attachments => new Map(attachments.map(item => [item.id, "/phone/audio.wav"])),
        cancelExchangeAttachmentDownloads() {},
    },
    "../../../../src/shared/playlist-exchange": schema,
});
const online = (id, title = `Song ${id}`) => ({
    source: { platform: "fixture-plugin", id, pluginData: {} },
    metadata: { title, artist: "Artist", album: "Album", editedFields: ["title"] },
    playCount: 40,
});
const local = attachmentId => ({
    source: { platform: "本地", id: "local-1", pluginData: {} },
    metadata: { title: "Local", artist: "", album: "", editedFields: [] },
    localAudio: { needsFile: true, ...(attachmentId ? { attachmentId } : {}) },
});
const doc = (tracks, attachments = []) => ({
    format: schema.EXCHANGE_FORMAT, formatVersion: schema.EXCHANGE_VERSION, exportId: "export-1",
    sourceDevice: { id: "device-1", platform: "desktop", appVersion: "1.5" },
    createdAt: "2026-11-11T00:00:00.000Z",
    plugins: [{ id: "fixture-plugin", installSources: ["https://example.invalid/plugin.js"] }], attachments,
    playlists: [
        { sourceSheetId: "sheet-1", title: "同名歌单", order: 0, isFavorite: false, isStarred: false, tracks },
        { sourceSheetId: "favorite", title: "我喜欢", order: 1, isFavorite: true, isStarred: false, tracks: [online("fav")] },
    ],
});

async function main() {
    const originalFetch = global.fetch;
    global.fetch = async () => new Response(null, { status: 204 });
    try {
        const phoneTrack = { platform: "fixture-plugin", id: "1" };
        library.edit(phoneTrack, { title: "手机编辑" });
        library.setCount(phoneTrack, 12);
        const initial = mobile.previewMobileExchange(doc([online("1", "电脑编辑"), local()]));
        assert.equal(initial.missingPlugins.length, 1);
        assert.equal(initial.matchedPlaylists.length, 1, "only the favorite should match initially");
        const first = await mobile.importMobileExchange(initial, { installMissingPlugins: true });
        assert(first.warnings.some(item => item.includes("安装失败")));
        assert.equal(sheets.filter(item => item.title === "同名歌单").length, 2, "same-name different-source playlists coexist");
        const target = sheets.find(item => item.exchangeSourceDeviceId === "device-1");
        assert(target);
        assert.equal(target.musicList.length, 2);
        assert(target.musicList.find(item => item.id === "local-1").$$exchangeNeedsLocalFile);
        assert.equal(sheets.find(item => item.id === "favorite").musicList.length, 1);
        assert.equal(library.edits(phoneTrack).title, "手机编辑");
        assert.equal(library.count(phoneTrack), 12);

        const attachment = { id: "attachment-1", filename: "audio.wav", mimeType: "audio/wav", size: 4, sha256: "a".repeat(64) };
        const incoming = doc([online("1", "电脑编辑"), local(attachment.id), online("2")], [attachment]);
        const second = mobile.previewMobileExchange(incoming);
        second.remoteBaseUrl = "http://127.0.0.1/v1/test";
        await mobile.importMobileExchange(second);
        const merged = sheets.find(item => item.id === target.id);
        assert.equal(merged.musicList.length, 3);
        const localItem = merged.musicList.find(item => item.id === "local-1");
        assert.equal(localItem.$.localPath, "/phone/audio.wav", "a second import must attach missing audio");
        assert(!localItem.$$exchangeNeedsLocalFile);
        assert.equal(library.edits(phoneTrack).title, "手机编辑");
        assert.equal(library.count(phoneTrack), 12);

        const repeat = mobile.previewMobileExchange(incoming);
        repeat.remoteBaseUrl = "http://127.0.0.1/v1/test";
        await mobile.importMobileExchange(repeat, { metadataConflict: "use-source", playCount: "use-source" });
        assert.equal(sheets.find(item => item.id === target.id).musicList.length, 3);
        assert.equal(library.edits(phoneTrack).title, "电脑编辑");
        assert.equal(library.count(phoneTrack), 40);

        const beforeSheets = clone(sheets);
        const beforeStarred = clone(starred);
        const beforeLibrary = library.snapshot();
        failLibraryCommit = true;
        await assert.rejects(mobile.importMobileExchange(mobile.previewMobileExchange(doc([online("new")]))), /injected library write failure/);
        assert.deepEqual(sheets, beforeSheets);
        assert.deepEqual(starred, beforeStarred);
        assert.deepEqual(library.snapshot(), beforeLibrary);

        const duplicate = doc([online("1"), online("1"), online("2")]);
        const replace = mobile.previewMobileExchange(duplicate);
        await mobile.importMobileExchange(replace, { decisions: { "sheet-1": { action: "replace", targetSheetId: target.id } } });
        assert.deepEqual(sheets.find(item => item.id === target.id).musicList.map(item => item.id), ["1", "2"], "replace must deduplicate source songs");

        const large = doc(Array.from({ length: 1000 }, (_, index) => online(`large-${index}`)));
        large.sourceDevice.id = "large-source";
        large.playlists = [{ ...large.playlists[0], sourceSheetId: "large-sheet", title: "千首歌单" }];
        await mobile.importMobileExchange(mobile.previewMobileExchange(large));
        const largeTarget = sheets.find(item => item.exchangeSourceDeviceId === "large-source");
        assert.equal(largeTarget.musicList.length, 1000);
        assert.deepEqual(largeTarget.musicList.map(item => item.id), Array.from({ length: 1000 }, (_, index) => `large-${index}`));
        await mobile.importMobileExchange(mobile.previewMobileExchange(large));
        assert.equal(sheets.find(item => item.id === largeTarget.id).musicList.length, 1000);
        console.log("PASS: missing plugin, source identity, favorite mapping, local audio re-import, edit/count conflicts, idempotence, rollback, replace deduplication and 1,000-track import");
    } finally { global.fetch = originalFetch; }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
