/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, no-console */
// Run: npm run test:playback-metadata
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "../..");
function load(file, dependencies = {}) {
    const compiled = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true },
    }).outputText;
    const exports = {};
    vm.runInNewContext(compiled, {
        exports,
        require(id) {
            assert.ok(id in dependencies, `Unexpected import: ${id}`);
            return dependencies[id];
        },
    }, { filename: file });
    return exports;
}

const constants = load("src/common/constant.ts");
const media = load("src/common/media-util.ts", { immer: require("immer"), "./constant": constants });
const indexMap = load("src/common/index-map.ts");
const events = load("src/renderer/core/track-player/enum.ts");
function store(value) {
    return { getValue: () => value, setValue: next => {
        value = next; 
    } };
}
const stores = Object.fromEntries([
    "musicQueue", "currentMusic", "currentLyric", "repeatMode", "progress", "playerState", "currentVolume", "currentSpeed", "currentQuality",
].map(name => [name + "Store", store(name === "musicQueue" ? [] : null)]));
stores.resetProgress = () => stores.progressStore.setValue({ currentTime: 0 });
const saved = new Map();
let requested;
const requestStarted = new Promise(resolve => {
    requested = resolve; 
});
let resolveMusicInfo;
const musicInfo = new Promise(resolve => {
    resolveMusicInfo = resolve; 
});
const player = load("src/renderer/core/track-player/index.ts", {
    "./enum": events,
    "lodash.shuffle": require("lodash.shuffle"),
    "@/common/media-util": media,
    "@/common/constant": constants,
    "@/renderer/utils/lyric-parser": {},
    "@/renderer/utils/user-perference": {
        setUserPreference: (key, value) => saved.set(key, value),
        setUserPreferenceIDB: (key, value) => saved.set(key, value),
    },
    "@shared/app-config/renderer": {},
    "@/common/index-map": indexMap,
    "./store": stores,
    eventemitter3: require("eventemitter3"),
    "./controller/collection-audio-controller": class {},
    "./collection": {},
    "@/common/lyric-util": {},
    "@shared/logger/renderer": {},
    "@/renderer/core/play-counts": {},
    "@/common/void-callback": () => {},
    "@/common/time-util": {},
    "@/common/unique-map": {},
    "@renderer/core/link-lyric": {},
    "@shared/utils/renderer": {},
    "@shared/plugin-manager/renderer": { callPluginDelegateMethod: () => {
        requested(); return musicInfo; 
    } },
}).default;

(async () => {
    const song = { id: "stable-id", platform: "real-source", title: "old", artist: "old artist", album: "old album", $: { downloadData: { path: "saved.mp3" } } };
    const other = { id: "other", platform: "real-source", title: "other" };
    player.setMusicQueue([song, other]);
    stores.currentMusicStore.setValue(song);
    stores.progressStore.setValue({ currentTime: 80, duration: 120 });
    stores.playerStateStore.setValue(constants.PlayerState.Playing);
    const progressBefore = player.progress;
    let trackChanges = 0;
    player.setTrack = () => {
        trackChanges++; 
    };
    player.fetchCurrentLyric = () => {};
    const overrides = { title: "edited", artist: "edited artist", album: "edited album", $$displayPlatform: "display source" };
    player.updateMusicMetadata({ ...song, ...overrides, $$metadataOverrides: overrides });
    assert.equal(player.currentMusic.title, "edited");
    assert.equal(player.musicQueue[0].title, "edited");
    assert.equal(player.musicQueue[1], other);
    assert.equal(player.progress, progressBefore);
    assert.equal(player.playerState, constants.PlayerState.Playing);
    assert.equal(trackChanges, 0, "Editing must not restart audio");
    assert.equal(saved.get("currentMusic").title, "edited");
    assert.equal(player.currentMusic.$, song.$);
    assert.equal(player.currentMusicBasicInfo.$$displayPlatform, "display source");

    // A slow plugin response must not overwrite an edit made while it was pending.
    player.fetchMediaSource = async () => ({ mediaSource: { url: "test.mp3" }, quality: "standard" });
    const playback = player.playIndex(0, { refreshSource: true });
    await requestStarted;
    const newer = { ...overrides, title: "edited during playback" };
    player.updateMusicMetadata({ ...song, ...newer, $$metadataOverrides: newer });
    resolveMusicInfo({ title: "plugin title", artist: "plugin artist", album: "plugin album", id: "bad-id", platform: "bad-source" });
    await playback;
    assert.equal(player.currentMusic.title, newer.title);
    assert.equal(player.currentMusic.artist, overrides.artist);
    assert.equal(player.currentMusic.album, overrides.album);
    assert.equal(player.currentMusic.id, song.id);
    assert.equal(player.currentMusic.platform, song.platform);
    assert.equal(player.musicQueue[0].title, newer.title);
    console.log("PASS: editing syncs queue/current metadata without restarting audio; pending plugin responses preserve edits and source identity");
})().catch(error => {
    console.error(error); process.exitCode = 1; 
});
