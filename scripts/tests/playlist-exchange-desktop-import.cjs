"use strict";

// Exercises the desktop import orchestration against an in-memory sheet adapter.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const repo = path.resolve(__dirname, "../..");
function load(filename, dependencies = {}) {
    const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
    const loaded = { exports: {} };
    new Function("module", "exports", "require", compiled)(loaded, loaded.exports, name =>
        Object.prototype.hasOwnProperty.call(dependencies, name) ? dependencies[name] : require(name));
    return loaded.exports;
}
const schema = load(path.join(repo, "src/shared/playlist-exchange/index.ts"));
const clone = value => structuredClone(value);
let sheets = [
    { id: "favorite", platform: "本地", title: "我喜欢", musicList: [] },
    { id: "other", platform: "本地", title: "同名歌单", exchangeSourceDeviceId: "other-device", exchangeSourceSheetId: "sheet-1", musicList: [] },
];
let stars = [];
let counts = {};
let nextId = 0;
let failWrite = false;
const findSheet = id => sheets.find(item => item.id === id);
const frontend = {
    exportAllSheetDetails: async () => clone(sheets),
    getAllSheets: () => clone(sheets),
    getAllStarredSheets: () => clone(stars),
    setStarredMusicSheets: async value => { stars = clone(value); },
    addSheet: async title => {
        const sheet = { id: `created-${++nextId}`, platform: "本地", title, musicList: [] };
        sheets.push(sheet);
        return clone(sheet);
    },
    removeSheet: async id => { sheets = sheets.filter(item => item.id !== id); },
    clearSheet: async id => { findSheet(id).musicList = []; },
    addMusicToSheet: async (items, id) => {
        findSheet(id).musicList.push(...clone(items));
        if (failWrite) { failWrite = false; throw new Error("injected sheet write failure"); }
    },
    updateSheet: async (id, value) => { Object.assign(findSheet(id), clone(value)); },
};
const playCounts = {
    snapshot: async () => clone(counts),
    setCount: async (item, value) => { counts[`${item.platform}:${item.id}`] = value; },
    restoreExact: async value => { counts = clone(value); },
};
const toTrack = item => ({
    source: { platform: item.platform, id: String(item.id), pluginData: {} },
    metadata: { title: item.title || "", artist: item.artist || "", album: item.album || "", editedFields: [] },
});
const desktop = load(path.join(repo, "src/renderer/core/playlist-exchange/import.ts"), {
    "@/renderer/core/music-sheet": { __esModule: true, default: { frontend }, defaultSheet: { id: "favorite" } },
    "@/renderer/core/play-counts": playCounts,
    "@shared/playlist-exchange": schema,
    "./index": { trackToExchange: toTrack },
});
const track = id => ({ source: { platform: "fixture", id, pluginData: {} }, metadata: { title: `Song ${id}`, artist: "", album: "", editedFields: [] } });
const doc = tracks => ({
    format: schema.EXCHANGE_FORMAT, formatVersion: schema.EXCHANGE_VERSION, exportId: "desktop-test",
    sourceDevice: { id: "desktop-source", platform: "desktop", appVersion: "1.5" },
    createdAt: "2026-11-11T00:00:00.000Z", plugins: [], attachments: [],
    playlists: [
        { sourceSheetId: "sheet-1", title: "同名歌单", order: 0, isFavorite: false, isStarred: false, tracks },
        { sourceSheetId: "favorite", title: "我喜欢", order: 1, isFavorite: true, isStarred: false, tracks: [track("favorite-track")] },
    ],
});
async function main() {
    const initial = doc([track("1"), track("1"), track("2")]);
    await desktop.importDesktopExchange(initial);
    const created = sheets.find(item => item.exchangeSourceDeviceId === "desktop-source");
    assert(created);
    assert.equal(sheets.filter(item => item.title === "同名歌单").length, 2);
    assert.deepEqual(created.musicList.map(item => item.id), ["1", "2"]);
    assert.equal(findSheet("favorite").musicList.length, 1);
    await desktop.importDesktopExchange(initial);
    assert.deepEqual(findSheet(created.id).musicList.map(item => item.id), ["1", "2"]);
    await desktop.importDesktopExchange(initial, { decisions: { "sheet-1": { action: "replace", targetSheetId: created.id } } });
    assert.deepEqual(findSheet(created.id).musicList.map(item => item.id), ["1", "2"], "replace must remove duplicates");
    const before = clone(sheets);
    const beforeStars = clone(stars);
    const beforeCounts = clone(counts);
    failWrite = true;
    await assert.rejects(desktop.importDesktopExchange(doc([track("new")])), /injected sheet write failure/);
    assert.deepEqual(sheets, before);
    assert.deepEqual(stars, beforeStars);
    assert.deepEqual(counts, beforeCounts);
    await assert.rejects(desktop.importDesktopExchange("{"), /有效 JSON/);
    assert.deepEqual(sheets, before);
    console.log("PASS: desktop source identity, favorite mapping, repeated import, replace deduplication and failed-write rollback");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
