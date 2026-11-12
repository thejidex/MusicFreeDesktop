"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const sourcePath = path.resolve(__dirname, "../../src/shared/playlist-exchange/index.ts");
const code = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS },
}).outputText;
const loaded = { exports: {} };
new Function("module", "exports", code)(loaded, loaded.exports);
const {
    EXCHANGE_FORMAT,
    ExchangeFormatError,
    parseExchangeInput,
    planPlaylistMerge,
    playlistIdentity,
    songIdentity,
} = loaded.exports;

const online = (id, title, editedFields = [], playCount = 0, pluginData = {}) => ({
    source: { platform: "example", id, pluginData },
    metadata: { title, artist: "Artist", album: "Album", editedFields },
    playCount,
});
const makeDocument = tracks => ({
    format: EXCHANGE_FORMAT,
    formatVersion: 1,
    exportId: "export-1",
    sourceDevice: { id: "desktop-a", platform: "desktop", appVersion: "1.4" },
    createdAt: "2026-11-11T00:00:00.000Z",
    plugins: [{ id: "example", version: "2.0", installSources: ["https://plugins.example/index.js?token=remove"] }],
    attachments: [],
    playlists: [{ sourceSheetId: "sheet-a", title: "Road", order: 0, isFavorite: false, isStarred: false, tracks }],
});

const current = parseExchangeInput(JSON.stringify(makeDocument([online("1", "One")]))) ;
assert.equal(current.legacy, false);
assert.equal(current.document.playlists[0].tracks[0].source.id, "1");
assert.equal(current.document.plugins[0].installSources[0], "https://plugins.example/index.js");
assert.equal(playlistIdentity("desktop-a", "sheet-a"), JSON.stringify(["desktop-a", "sheet-a"]));

const oldDesktop = parseExchangeInput({ musicSheets: [{ id: "old", title: "Same name", musicList: [
    { id: "1", platform: "example", title: "Original", artist: "Artist", album: "Album", bvid: "BV1", cid: 12,
        url: "https://expired.example/audio", $$localPath: "C:\\private\\song.mp3", $$metadataOverrides: { title: "Edited" } },
] }] });
assert.equal(oldDesktop.legacy, true);
assert.equal(oldDesktop.document.playlists[0].tracks[0].metadata.title, "Edited");
assert.equal(oldDesktop.document.playlists[0].tracks[0].source.pluginData.bvid, "BV1");
assert.equal(oldDesktop.document.playlists[0].tracks[0].source.pluginData.cid, 12);
assert.equal("url" in oldDesktop.document.playlists[0].tracks[0].source.pluginData, false);
assert.equal("$$localPath" in oldDesktop.document.playlists[0].tracks[0].source.pluginData, false);

const oldMobile = parseExchangeInput({
    musicSheets: [{ id: "favorite", title: "我喜欢", musicList: [{ id: "1", platform: "example", title: "Plugin", artist: "Artist" }] }],
    library: {
        'edits:["example","1"]': JSON.stringify({ title: "Phone edit", displaySource: "Alias" }),
        'count:["example","1"]': "7",
    },
});
assert.equal(oldMobile.document.playlists[0].isFavorite, true);
assert.equal(oldMobile.document.playlists[0].tracks[0].metadata.title, "Phone edit");
assert.equal(oldMobile.document.playlists[0].tracks[0].metadata.displaySource, "Alias");
assert.equal(oldMobile.document.playlists[0].tracks[0].playCount, 7);

const localPathDocument = parseExchangeInput({
    ...makeDocument([{
        source: { platform: "本地", id: "C:\\Users\\Owner\\song.flac", pluginData: { bvid: "BV1" } },
        metadata: { title: "Song", artist: "", album: "", editedFields: [] },
        localAudio: { needsFile: true },
    }]),
});
assert(!localPathDocument.document.playlists[0].tracks[0].source.id.includes("Users"));
assert(!JSON.stringify(localPathDocument.document).includes("song.flac"));

const deviceTracks = [online("1", "Phone edit", ["title"], 12), online("2", "Already here")];
const sourceTracks = [online("1", "Computer edit", ["title"], 30), online("3", "New")];
const merged = planPlaylistMerge(deviceTracks, sourceTracks, {
    metadataConflict: "keep-device", playCount: "keep-device",
});
assert.deepEqual(merged.tracks.map(songIdentity), [songIdentity(deviceTracks[0]), songIdentity(deviceTracks[1]), songIdentity(sourceTracks[1])]);
assert.equal(merged.tracks[0].metadata.title, "Phone edit");
assert.equal(merged.tracks[0].playCount, 12);
assert.equal(merged.added, 1);
assert.equal(merged.matched, 1);
assert.equal(planPlaylistMerge(merged.tracks, sourceTracks, { metadataConflict: "keep-device", playCount: "keep-device" }).added, 0);
const sourceWins = planPlaylistMerge(deviceTracks, sourceTracks, { metadataConflict: "use-source", playCount: "use-source" });
assert.equal(sourceWins.tracks[0].metadata.title, "Computer edit");
assert.equal(sourceWins.tracks[0].playCount, 30);

const missingLocalFile = {
    source: { platform: "本地", id: "local-1", pluginData: {} },
    metadata: { title: "Local", artist: "", album: "", editedFields: [] },
    localAudio: { needsFile: true },
};
const incomingLocalFile = { ...missingLocalFile, localAudio: { needsFile: true, attachmentId: "new-attachment" } };
assert.equal(planPlaylistMerge([missingLocalFile], [incomingLocalFile], {
    metadataConflict: "keep-device", playCount: "keep-device",
}).tracks[0].localAudio.attachmentId, "new-attachment", "a later transfer must attach the missing local audio");

assert.throws(() => parseExchangeInput("{"), ExchangeFormatError);
assert.throws(() => parseExchangeInput({ ...makeDocument([]), formatVersion: 99 }), /不支持的歌单交换版本/);
assert.throws(() => parseExchangeInput({ ...makeDocument([]), attachments: [], playlists: [{
    ...makeDocument([]).playlists[0], tracks: [{
        ...online("1", "Song"),
        source: { platform: "本地", id: "1", pluginData: {} },
        localAudio: { needsFile: false, attachmentId: "missing" },
    }],
}]}), /不存在的本地附件/);

console.log("PASS: current and legacy formats, local path removal, favorite mapping, plugin field sanitization, stable identity, idempotent merge and conflict policies");
