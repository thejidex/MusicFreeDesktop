"use strict";
// Real Chromium IndexedDB, with controlled audio events for playback accounting.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const repo = path.resolve(__dirname, "../..");

function loadTs(file, dependencies = {}) {
    const ts = require("typescript");
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(repo, file), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true },
    }).outputText, {
        exports,
        setImmediate,
        navigator: { mediaSession: { setActionHandler() {} } },
        require(id) {
            assert.ok(id in dependencies, `Unexpected import: ${id}`);
            return dependencies[id];
        },
    }, { filename: file });
    return exports;
}

async function runRendererTests() {
    const Module = require("node:module");
    const resolve = Module._resolveFilename;
    Module._resolveFilename = function (request, ...args) {
        if (request.startsWith("@/")) request = path.join(repo, "src", request.slice(2));
        return resolve.call(this, request, ...args);
    };
    require("ts-node").register({ transpileOnly: true, project: path.join(repo, "tsconfig.json") });
    const constants = loadTs("src/common/constant.ts");
    const media = loadTs("src/common/media-util.ts", { immer: require("immer"), "./constant": constants });
    const { PlayCounts, playCountKey } = require(path.join(repo, "src/renderer/core/play-counts"));
    const counts = new PlayCounts();
    const song = { platform: "source-a", id: "shared-id", title: "Song", artist: "Artist" };
    const otherSource = { ...song, platform: "source-b" };
    const numeric = { ...song, id: "numeric-order" };
    await counts.setup();
    assert.equal(counts.getCount(song), 0);
    await Promise.all(Array.from({ length: 12 }, () => counts.recordPlay(song)));
    await counts.recordPlay(otherSource);
    await Promise.all([counts.recordPlay(numeric), counts.recordPlay(numeric)]);
    assert.equal(counts.getCount(song), 12, "Concurrent increments must not be lost");
    assert.equal(counts.getCount({ ...song, title: "Edited", $$displayPlatform: "custom source" }), 12);
    assert.equal(counts.getCount(otherSource), 1, "Different sources have independent counts");
    assert.notEqual(playCountKey({ platform: "a@b", id: "c" }), playCountKey({ platform: "a", id: "b@c" }));
    counts.db.close();
    const reopened = new PlayCounts();
    await reopened.setup();
    assert.equal(reopened.getCount(song), 12, "Counts survive a fresh repository instance");

    const { createTable, getCoreRowModel, getSortedRowModel } = require("@tanstack/react-table");
    const table = createTable({
        data: [song, otherSource, numeric],
        columns: [{ id: "playCount", accessorFn: item => reopened.getCount(item), sortingFn: "basic", sortDescFirst: false }],
        state: { sorting: [{ id: "playCount", desc: false }] },
        getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
    });
    assert.deepEqual(table.getRowModel().rows.map(row => row.getValue("playCount")), [1, 2, 12]);
    table.setOptions(previous => ({ ...previous, state: { sorting: [{ id: "playCount", desc: true }] } }));
    assert.deepEqual(table.getRowModel().rows.map(row => row.getValue("playCount")), [12, 2, 1]);
    await testPlaybackEvents(constants, media, reopened);
    reopened.db.close();
    return "PASS: persistent IndexedDB counts, concurrent increments, metadata identity, numeric sorting, playback/resume/seek/replay/loop/quality/error accounting";
}

async function testPlaybackEvents(constants, media, counts) {
    const { PlayerState, RepeatMode } = constants;
    let audio;
    class ControlledAudio {
        playerState = PlayerState.None;
        musicItem = null;
        constructor() { audio = this; }
        signal(state) {
            this.playerState = state;
            this.onPlayerStateChanged?.(state);
        }
        prepareTrack(item) { this.musicItem = item; this.signal(PlayerState.None); }
        setTrackSource(source, item) { this.musicItem = item; this.signal(PlayerState.Paused); }
        play() {}
        pause() { this.signal(PlayerState.Paused); }
        seekTo() {}
        reset() { this.signal(PlayerState.None); }
    }
    const store = value => ({ getValue: () => value, setValue: next => { value = next; } });
    const stores = Object.fromEntries([
        "musicQueue", "currentMusic", "currentLyric", "repeatMode", "progress", "playerState", "currentVolume", "currentSpeed", "currentQuality",
    ].map(name => [name + "Store", store(name === "musicQueue" ? [] : null)]));
    stores.progressStore.setValue({ currentTime: 40, duration: 120 });
    stores.resetProgress = () => {};
    const writes = [];
    const player = loadTs("src/renderer/core/track-player/index.ts", {
        "./enum": loadTs("src/renderer/core/track-player/enum.ts"),
        "lodash.shuffle": require("lodash.shuffle"),
        "@/common/media-util": media, "@/common/constant": constants,
        "@/renderer/utils/lyric-parser": {},
        "@/renderer/utils/user-perference": {
            getUserPreference: () => null, getUserPreferenceIDB: async () => [],
            setUserPreference() {}, setUserPreferenceIDB() {}, removeUserPreference() {},
        },
        "@shared/app-config/renderer": { onConfigUpdate() {}, getConfig: () => null },
        "@/common/index-map": loadTs("src/common/index-map.ts"), "./store": stores,
        eventemitter3: require("eventemitter3"),
        "./controller/collection-audio-controller": ControlledAudio, "./collection": {},
        "@/common/lyric-util": {}, "@shared/logger/renderer": { logError: (...args) => assert.fail(args.join(" ")) },
        "@/common/void-callback": () => {}, "@/common/time-util": {}, "@/common/unique-map": {},
        "@renderer/core/link-lyric": {}, "@shared/utils/renderer": {},
        "@shared/plugin-manager/renderer": { callPluginDelegateMethod: async () => null },
        "@/renderer/core/play-counts": { recordPlay: item => {
            const task = counts.recordPlay(item); writes.push(task); return task;
        } },
    }).default;
    player.fetchCurrentLyric = () => {};
    player.fetchMediaSource = async (item, quality = "standard") => {
        if (!item || item.id === "broken") throw new Error("No source");
        return { mediaSource: { url: "controlled.wav" }, quality };
    };
    await player.setup();
    const song = { id: "playback", platform: "controlled", title: "Playback" };
    const broken = { ...song, id: "broken" };
    player.setMusicQueue([song, broken]);
    await player.playIndex(0);
    assert.equal(counts.getCount(song), 0, "Loading a track must not count");
    audio.signal(PlayerState.Playing);
    await Promise.all(writes);
    assert.equal(counts.getCount(song), 1);
    player.pause(); player.resume(); audio.signal(PlayerState.Playing);
    player.seekTo(40); audio.signal(PlayerState.Playing);
    await player.setQuality("high"); audio.signal(PlayerState.Playing);
    await Promise.all(writes);
    assert.equal(counts.getCount(song), 1, "Pause, buffering, seek and quality changes must not double-count");
    await player.playIndex(0);
    await Promise.all(writes);
    assert.equal(counts.getCount(song), 2, "Explicit replay while already playing counts once");
    player.setRepeatMode(RepeatMode.Loop);
    audio.signal(PlayerState.Paused); audio.onEnded(); audio.signal(PlayerState.Playing);
    await Promise.all(writes);
    assert.equal(counts.getCount(song), 3, "Single-track loop counts a new play");
    await player.playIndex(1);
    await Promise.all(writes);
    assert.equal(counts.getCount(broken), 0, "Failed playback must not count");
    await player.playIndex(0); audio.signal(PlayerState.Playing);
    await Promise.all(writes);
    assert.equal(counts.getCount(song), 4, "Returning to a track counts a new play");
}

if (process.type === "renderer") {
    module.exports = { runRendererTests };
} else {
    const { app, BrowserWindow } = require("electron");
    app.disableHardwareAcceleration();
    const out = path.join(repo, "out");
    fs.mkdirSync(out, { recursive: true });
    const profile = fs.mkdtempSync(path.join(out, "play-count-test-"));
    for (const name of ["appData", "userData", "temp", "crashDumps"]) {
        const folder = path.join(profile, name);
        fs.mkdirSync(folder);
        app.setPath(name, folder);
    }
    app.setPath("sessionData", path.join(profile, "userData"));
    app.setAppLogsPath(path.join(profile, "logs"));
    setTimeout(() => { console.error("Play count regression timed out"); app.exit(1); }, 60000).unref();
    app.whenReady().then(async () => {
        const fixture = path.join(profile, "fixture.html");
        fs.writeFileSync(fixture, "<!doctype html><title>MusicFree play count regression</title>");
        const window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false } });
        window.webContents.on("render-process-gone", (_, details) => { console.error(details); app.exit(1); });
        window.webContents.on("console-message", (_, level, message) => { if (level >= 3) console.error("Renderer:", message); });
        try {
            await testWindowModes();
            await window.loadFile(fixture);
            console.log(await window.webContents.executeJavaScript(`require(${JSON.stringify(__filename)}).runRendererTests()`));
            app.exit(0);
        } catch (error) { console.error(error); app.exit(1); }
    });
}

async function testWindowModes() {
    const { cycleWindowMode, exitWindowFullscreen } = loadTs("src/main/window-manager/window-mode.ts");
    const EventEmitter = require("node:events");
    class Window extends EventEmitter {
        full = false;
        max = false;
        bounds = { x: 80, y: 80, width: 1050, height: 700 };
        isDestroyed() { return false; }
        isFullScreen() { return this.full; }
        isMaximized() { return this.max; }
        getNormalBounds() { return this.bounds; }
        getBounds() { return this.bounds; }
        setBounds(bounds) { this.bounds = bounds; }
        maximize() { this.max = true; }
        unmaximize() { this.max = false; }
        setFullScreen(full) { this.full = full; }
    }
    const window = new Window();
    cycleWindowMode(window);
    assert.equal(window.max, true);
    assert.equal(window.full, false);
    cycleWindowMode(window);
    assert.equal(window.full, true);
    cycleWindowMode(window);
    assert.equal(window.full, true, "Ignore clicks during a native fullscreen transition");
    window.emit("enter-full-screen");
    cycleWindowMode(window);
    window.emit("leave-full-screen");
    // Model Electron's late restoration of the pre-fullscreen maximized state.
    window.max = true;
    await new Promise(setImmediate);
    assert.equal(window.max, false);
    assert.equal(window.full, false);
    cycleWindowMode(window); cycleWindowMode(window); window.emit("enter-full-screen");
    exitWindowFullscreen(window); window.emit("leave-full-screen");
    await new Promise(setImmediate);
    assert.equal(window.max, false);
    assert.equal(window.full, false);
    console.log("PASS: three window modes, asynchronous transitions and fullscreen escape");
}
