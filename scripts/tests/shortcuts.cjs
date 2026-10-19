/* Run with: npm run test:shortcuts */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, no-console */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "../..");

function loadTs(file, dependencies, globals = {}, append = "") {
    const source = fs.readFileSync(path.join(root, file), "utf8") + append;
    const compiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2021,
            esModuleInterop: true,
        },
    }).outputText;
    const exports = {};
    vm.runInNewContext(compiled, {
        exports,
        require: (id) => {
            assert.ok(id in dependencies, `Unexpected import: ${id}`);
            return dependencies[id];
        },
        console,
        ...globals,
    }, { filename: file });
    return exports;
}

const constants = loadTs("src/common/constant.ts", {});
const defaults = loadTs("src/shared/app-config/default-app-config.ts", {
    "@/common/constant": constants,
}).default;

async function loadConfig(persisted) {
    const appConfig = loadTs("src/shared/app-config/main.ts", {
        path,
        electron: { app: { getPath: () => "test-user-data" } },
        fs: { writeFileSync() {} },
        "fs/promises": { readFile: async () => JSON.stringify(persisted) },
        rimraf: {},
        "@shared/logger/main": { logError: (...args) => assert.fail(args.join(" ")) },
        "@shared/app-config/default-app-config": defaults,
    }).default;
    return appConfig.loadConfig();
}

async function testConfig() {
    assert.deepEqual(Array.from(defaults["shortCut.shortcuts"]["focus-search"].local), ["Ctrl", "/"]);
    assert.deepEqual(Array.from(defaults["shortCut.shortcuts"]["add-to-favorite"].local), ["Z"]);
    assert.deepEqual(Array.from(defaults["shortCut.shortcuts"]["edit-music"].local), ["Ctrl", "Z"]);

    // Upgrade an existing installation without overwriting its customized bindings.
    const loaded = await loadConfig({
        "$schema-version": 1,
        "shortCut.shortcuts": { "play/pause": { local: ["P"] } },
    });
    assert.deepEqual(Array.from(loaded["shortCut.shortcuts"]["focus-search"].local), ["Ctrl", "/"]);
    assert.deepEqual(Array.from(loaded["shortCut.shortcuts"]["add-to-favorite"].local), ["Z"]);
    assert.deepEqual(Array.from(loaded["shortCut.shortcuts"]["edit-music"].local), ["Ctrl", "Z"]);
    assert.deepEqual(Array.from(loaded["shortCut.shortcuts"]["play/pause"].local), ["P"]);

    const customized = await loadConfig({
        "$schema-version": 1,
        "shortCut.shortcuts": {
            "focus-search": { local: null, global: ["Ctrl", "F"] },
            "add-to-favorite": { local: ["A"] },
            "edit-music": { local: null, global: ["Ctrl", "E"] },
        },
    });
    assert.equal(customized["shortCut.shortcuts"]["focus-search"].local, null);
    assert.deepEqual(Array.from(customized["shortCut.shortcuts"]["focus-search"].global), ["Ctrl", "F"]);
    assert.deepEqual(Array.from(customized["shortCut.shortcuts"]["add-to-favorite"].local), ["A"]);
    assert.equal(customized["shortCut.shortcuts"]["edit-music"].local, null);
    assert.deepEqual(Array.from(customized["shortCut.shortcuts"]["edit-music"].global), ["Ctrl", "E"]);

    const migrated = await loadConfig({ shortCut: { shortcuts: { "play/pause": { local: ["P"] } } } });
    assert.deepEqual(Array.from(migrated["shortCut.shortcuts"]["focus-search"].local), ["Ctrl", "/"]);
    assert.deepEqual(Array.from(migrated["shortCut.shortcuts"]["play/pause"].local), ["P"]);
}

async function testKeyboard() {
    // Exercise the actual hotkeys-js parser and dispatch, including the slash key.
    const listeners = new Map();
    const testDocument = {
        addEventListener: (type, callback) => listeners.set(type, callback),
        removeEventListener: type => listeners.delete(type),
    };
    const testWindow = { addEventListener() {}, removeEventListener() {}, "@shared/short-cut": {} };
    const hotkeysModule = { exports: {} };
    vm.runInNewContext(fs.readFileSync(require.resolve("hotkeys-js/dist/hotkeys.common.js"), "utf8"), {
        module: hotkeysModule,
        exports: hotkeysModule.exports,
        document: testDocument,
        window: testWindow,
        navigator: { userAgent: "shortcut-test" },
        console,
    });

    const commands = [];
    const config = await loadConfig({ "$schema-version": 1, "shortCut.shortcuts": { "volume-up": { local: ["Up"] } } });
    // Renderer config writes are asynchronous IPC. Do not apply a write until setup finishes.
    const pendingPatches = [];
    const flushConfig = () => pendingPatches.splice(0).forEach(patch => Object.assign(config, patch));
    const shortCut = loadTs("src/shared/short-cut/renderer.ts", {
        "@shared/app-config/renderer": {
            getConfig: key => config[key],
            setConfig: patch => pendingPatches.push(patch),
        },
        "@/common/constant": constants,
        "hotkeys-js": hotkeysModule.exports,
        "@shared/message-bus/renderer/main": { sendCommand: command => commands.push(command) },
    }, { window: testWindow }).default;
    shortCut.setup();
    flushConfig();
    assert.deepEqual(Array.from(config["shortCut.shortcuts"]["focus-search"].local), ["Ctrl", "/"]);
    assert.deepEqual(Array.from(config["shortCut.shortcuts"]["add-to-favorite"].local), ["Z"]);
    assert.deepEqual(Array.from(config["shortCut.shortcuts"]["volume-up"].local), ["Up"]);

    const body = { tagName: "DIV", closest: () => null };
    function key(type, code, extra = {}) {
        const event = {
            type, keyCode: code, which: code, target: body,
            ctrlKey: false, altKey: false, shiftKey: false, metaKey: false,
            repeat: false, isComposing: false,
            preventDefault() {
                this.prevented = true; 
            },
            ...extra,
        };
        listeners.get(type)(event);
        return event;
    }
    function press(code, extra = {}) {
        const event = key("keydown", code, extra);
        key("keyup", code, extra);
        return event;
    }
    assert.equal(press(191, { ctrlKey: true }).prevented, true);
    assert.deepEqual(commands.splice(0), ["FocusSearch"]);
    key("keyup", 17);
    press(90);
    assert.deepEqual(commands.splice(0), ["ToggleFavorite"]);
    press(90, { ctrlKey: true });
    key("keyup", 17);
    assert.deepEqual(commands.splice(0), ["EditSelectedMusic"]);
    press(90, { ctrlKey: true, repeat: true });
    key("keyup", 17);
    assert.deepEqual(commands.splice(0), []);
    press(90, { repeat: true });
    press(90, { isComposing: true });
    for (const target of [
        { tagName: "INPUT", type: "text", closest: () => null },
        { tagName: "TEXTAREA", closest: () => null },
        { tagName: "SELECT", closest: () => null },
        { tagName: "DIV", isContentEditable: true, closest: () => null },
        { tagName: "DIV", closest: selector => selector === "[role=textbox]" ? {} : null },
        { tagName: "INPUT", readOnly: true, closest: selector => selector === "[data-capture=true]" ? {} : null },
    ]) {
        press(90, { target });
        press(90, { target, ctrlKey: true });
        key("keyup", 17);
    }
    assert.deepEqual(commands.splice(0), []);
    press(38, { repeat: true });
    assert.deepEqual(commands.splice(0), ["VolumeUp"]);
    config["shortCut.enableLocal"] = false;
    press(90);
    press(90, { ctrlKey: true });
    key("keyup", 17);
    assert.deepEqual(commands.splice(0), []);
    config["shortCut.enableLocal"] = true;

    shortCut.registerLocalShortCut("focus-search", ["Ctrl", "F"]);
    flushConfig();
    press(191, { ctrlKey: true });
    key("keyup", 17);
    assert.deepEqual(commands.splice(0), []);
    press(70, { ctrlKey: true });
    key("keyup", 17);
    assert.deepEqual(commands.splice(0), ["FocusSearch"]);
    shortCut.unregisterLocalShortCut("add-to-favorite");
    flushConfig();
    press(90);
    assert.deepEqual(commands.splice(0), []);
    const reloaded = await loadConfig(config);
    assert.equal(reloaded["shortCut.shortcuts"]["add-to-favorite"].local, null);
    assert.deepEqual(Array.from(reloaded["shortCut.shortcuts"]["focus-search"].local), ["Ctrl", "F"]);
    shortCut.unregisterLocalShortCut("edit-music");
    flushConfig();
    press(90, { ctrlKey: true });
    key("keyup", 17);
    assert.deepEqual(commands.splice(0), []);
    assert.equal((await loadConfig(config))["shortCut.shortcuts"]["edit-music"].local, null);
}

async function testCommands() {
    const callbacks = new Map();
    const favorite = new Set();
    let adds = 0;
    let removes = 0;
    const focusEvents = [];
    class Input {
        focus() {
            focusEvents.push("focus"); 
        }
        select() {
            focusEvents.push("select"); 
        }
    }
    const input = new Input();
    const player = { currentMusic: null, currentMusicBasicInfo: null, on() {} };
    const sheet = { frontend: {
        isFavoriteMusic: item => favorite.has(item?.id),
        addMusicToFavorite: async item => {
            adds++; favorite.add(item.id); 
        },
        removeMusicFromFavorite: async item => {
            removes++;
            favorite.delete(item.id);
        },
    } };
    const bootstrap = loadTs("src/renderer/document/bootstrap.ts", {
        "@/common/constant": constants,
        "../core/music-sheet": sheet,
        "../core/track-player": player,
        "../core/local-music": {},
        immer: { setAutoFreeze() {} },
        "../core/downloader": {},
        "@shared/app-config/renderer": {},
        "@/shared/i18n/renderer": {},
        "@/shared/themepack/renderer": {},
        "../core/recently-playlist": {},
        "@/renderer/core/play-counts": {},
        "@shared/logger/renderer": {},
        "@shared/service-manager/renderer": {},
        "@renderer/core/track-player/enum": { PlayerEvents: {} },
        "@shared/utils/renderer": {},
        "@shared/plugin-manager/renderer": {},
        "@shared/message-bus/renderer/main": {
            onCommand: (command, callback) => callbacks.set(command, callback),
            syncAppState() {},
        },
        "lodash.throttle": callback => callback,
        "@renderer/components/MusicDetail": { hide() {
            focusEvents.push("hide"); 
        } },
        "@shared/short-cut/renderer": {},
        "@/common/media-util": { getMediaPrimaryKey: item => `${item.platform}@${item.id}` },
    }, {
        HTMLInputElement: Input,
        document: { getElementById: id => id === "header-search-input" ? input : null },
    }, "\nexports.testSetup = setupCommandAndEvents;");
    bootstrap.testSetup();
    await callbacks.get("AddToFavorite")();
    assert.equal(adds, 0);
    player.currentMusic = { id: "song", title: "Song", platform: "Plugin" };
    await callbacks.get("AddToFavorite")();
    await callbacks.get("AddToFavorite")();
    assert.equal(adds, 1);
    assert.equal(favorite.has("song"), true);
    await callbacks.get("ToggleFavorite")();
    assert.equal(favorite.has("song"), false);
    await callbacks.get("ToggleFavorite")();
    assert.equal(favorite.has("song"), true);
    assert.equal(removes, 1);
    await Promise.all([callbacks.get("ToggleFavorite")(), callbacks.get("ToggleFavorite")()]);
    assert.equal(favorite.has("song"), true, "Two rapid presses must both be applied");
    assert.equal(removes, 2);
    assert.equal(adds, 3);
    const firstSongToggle = callbacks.get("ToggleFavorite")();
    player.currentMusic = { id: "different", title: "Other Song", platform: "Plugin" };
    await Promise.all([firstSongToggle, callbacks.get("ToggleFavorite")()]);
    assert.equal(favorite.has("song"), false);
    assert.equal(favorite.has("different"), true, "Each press must capture its own current song");
    callbacks.get("FocusSearch")();
    assert.deepEqual(focusEvents, ["hide", "focus", "select"]);
    player.currentMusic = null;
    await callbacks.get("ToggleFavorite")();
    for (const lang of ["zh-CN", "zh-TW", "en-US"]) {
        const strings = JSON.parse(fs.readFileSync(path.join(root, "res", "lang", `${lang}.json`), "utf8")).settings.short_cut;
        assert.ok(strings["focus-search"]);
        assert.ok(strings["add-to-favorite"]);
        assert.ok(strings["edit-music"]);
    }
}

function testCommandUnsubscription() {
    let bridge;
    loadTs("src/shared/message-bus/preload/main.ts", {
        electron: {
            contextBridge: { exposeInMainWorld: (_name, value) => {
                bridge = value; 
            } },
            ipcRenderer: { on() {} },
        },
        eventemitter3: require("eventemitter3"),
        "@shared/global-context/preload": { getGlobalContext: () => ({ platform: "win32" }) },
    }, { window: {} });
    let first = 0;
    let second = 0;
    const disposeFirst = bridge.onCommand("EditSelectedMusic", () => {
        first++; 
    });
    const disposeSecond = bridge.onCommand("EditSelectedMusic", () => {
        second++; 
    });
    bridge.sendCommand("EditSelectedMusic");
    assert.equal(first, 1);
    assert.equal(second, 1);
    disposeFirst();
    disposeFirst();
    bridge.sendCommand("EditSelectedMusic");
    assert.equal(first, 1, "Unmounted lists must not retain edit command listeners");
    assert.equal(second, 2);
    disposeSecond();
    bridge.sendCommand("EditSelectedMusic");
    assert.equal(second, 2);
}

(async () => {
    await testConfig();
    await testKeyboard();
    await testCommands();
    testCommandUnsubscription();
    console.log("PASS: shortcut defaults/migration, deferred IPC updates, actual hotkeys Ctrl+/ and Z, editable/IME/recording guards, repeats, customization/clear/reload, favorite toggle/rapid presses/current song changes, search focus and locale labels.");
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
