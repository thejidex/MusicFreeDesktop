"use strict";
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-empty-function */
// Run: npm run test:music-list-navigation
// Mount both real lists and the real metadata editor in Chromium, replacing persistence/playback services.
const fs = require("node:fs");
const path = require("node:path");
const repo = path.resolve(__dirname, "../..");

async function runRendererTests() {
    const assert = require("node:assert/strict");
    const ts = require("typescript");
    const React = require("react");
    const { createRoot } = require("react-dom/client");
    const hotkeys = require("hotkeys-js");
    const empty = () => null;
    const children = props => props.children;
    const counts = new Map();
    const commandHandlers = new Map();
    const modals = [];
    let contextMenu;
    let modalApi;
    let metadataWriter;
    const notices = { success: [], error: [] };
    const modalBridge = {
        showModal: (type, props) => {
            modals.push({ type, props });
            modalApi?.showModal(type, props);
        },
        hideModal: () => modalApi.hideModal(),
    };
    const sheet = { id: "test-sheet", platform: "local" };
    const musicSheetService = {
        frontend: {
            getAllSheets: () => [sheet],
            updateMusicMetadata: (...args) => metadataWriter(...args),
        },
    };
    const songs = Array.from({ length: 120 }, (_, index) => ({
        id: String(index), platform: "test", title: `Song ${String(index).padStart(3, "0")}`,
        artist: "Artist", album: "Album", duration: 90,
    }));
    let playbackCalls = 0;
    const player = {
        get currentMusic() {
            return null;
        },
        get musicQueue() {
            return songs;
        },
        playMusic() {
            playbackCalls++;
        },
        playMusicWithReplaceQueue() {
            playbackCalls++;
        },
    };
    const common = {
        react: React,
        "react/jsx-runtime": require("react/jsx-runtime"),
        "hotkeys-js": hotkeys,
        "@renderer/core/track-player": player,
        "@/renderer/core/track-player": player,
        "@/common/constant": { localPluginName: "local", RequestStateCode: { FINISHED: 0 }, rem: 13 },
        "@/common/media-util": {
            getMediaPrimaryKey: item => item.id,
            isSameMedia: (left, right) => left?.id === right?.id && left?.platform === right?.platform,
            getInternalData: () => undefined,
        },
        "@/hooks/useAppConfig": key => key === "normal.showPlayCount" ? true : [],
    };
    function load(file, dependencies = {}) {
        const module = { exports: {} };
        const source = ts.transpileModule(fs.readFileSync(path.join(repo, file), "utf8"), {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021,
                jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
            },
        }).outputText;
        new Function("require", "module", "exports", source)(id => {
            if (id.endsWith(".scss")) return {};
            assert.ok(id in dependencies || id in common, `Unexpected import: ${id}`);
            return id in dependencies ? dependencies[id] : common[id];
        }, module, module.exports);
        return module.exports;
    }
    const navigation = load("src/renderer/utils/music-list-navigation.ts");
    common["@/renderer/utils/music-list-navigation"] = navigation;
    common["@/hooks/useVirtualList"] = load("src/hooks/useVirtualList.ts", {
        "lodash.throttle": require("lodash.throttle"),
    }).default;
    const condition = load("src/renderer/components/Condition/index.tsx");
    const MusicList = load("src/renderer/components/MusicList/index.tsx", {
        "@tanstack/react-table": require("@tanstack/react-table"),
        "../Tag": children,
        "@/common/time-util": { secondsToDuration: String },
        "@/renderer/core/music-sheet": musicSheetService,
        "../Condition": condition,
        "../Empty": empty,
        "../MusicFavorite": empty,
        "../MusicDownloaded": empty,
        "../BottomLoadingState": empty,
        "../ContextMenu": { showContextMenu: menu => { contextMenu = menu; } },
        "../Modal": modalBridge,
        "@/renderer/core/downloader": { isDownloaded: () => false },
        "react-toastify": { toast: {} },
        "../SwitchCase": { Switch: children, Case: empty },
        "../SvgAsset": empty,
        "@/renderer/core/db/music-sheet-db": {},
        "../DragReceiver": { default: empty, startDrag() {}, __esModule: true },
        "@/shared/i18n/renderer": { i18n: { t: key => key } },
        "@/renderer/utils/is-local-music": () => false,
        "@shared/app-config/renderer": { getConfig: () => "normal" },
        "@shared/utils/renderer": {},
        "@shared/message-bus/renderer/main": {
            onCommand: (command, handler) => {
                commandHandlers.set(command, handler);
                return () => commandHandlers.delete(command);
            },
        },
        "@/renderer/core/play-counts": {
            default: { useCounts: () => counts }, playCountKey: item => item.id, __esModule: true,
        },
    }).default;
    const PlayList = load("src/renderer/components/Panel/templates/PlayList/index.tsx", {
        "@/renderer/components/Condition": condition,
        "@/renderer/components/Empty": empty,
        "@/renderer/components/MusicFavorite": empty,
        "@/renderer/components/Tag": children,
        "@/renderer/components/SvgAsset": empty,
        "@/renderer/components/MusicList": { showMusicContextMenu() {} },
        "@/renderer/components/MusicDownloaded": empty,
        "../Base": children,
        "react-i18next": { Trans: empty, useTranslation: () => ({ t: key => key }) },
        "@/renderer/components/DragReceiver": { default: empty, startDrag() {}, __esModule: true },
        "@renderer/core/track-player/hooks": { useCurrentMusic: () => null, useMusicQueue: () => songs },
    }).default;

    document.head.insertAdjacentHTML("beforeend", `<style>
        html { font-size: 13px; } table { border-collapse: collapse; width: 100%; }
        tr { height: 33.8px; } .playlist--music-list-container { height: 170px; overflow: auto; }
        .playlist--music-list-scroll { position: relative; }
    </style>`);
    const viewport = document.createElement("div");
    viewport.style.cssText = "height:170px;overflow:auto;width:900px";
    const host = document.createElement("div");
    viewport.append(host);
    document.body.append(viewport);
    const root = createRoot(host);
    const settle = () => new Promise(resolve => setTimeout(resolve, 40));
    const settleFrames = () => new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Chromium animation frames did not advance")), 2000);
        requestAnimationFrame(() => requestAnimationFrame(() => {
            clearTimeout(timeout);
            resolve();
        }));
    });
    let globalArrowCalls = 0;
    hotkeys("up,down", "all", () => {
        globalArrowCalls++;
    });

    async function press(target, key, extra = {}) {
        const event = new KeyboardEvent("keydown", {
            key, keyCode: key === "ArrowDown" ? 40 : 38, bubbles: true, cancelable: true, ...extra,
        });
        target.dispatchEvent(event);
        await settle();
        target.dispatchEvent(new KeyboardEvent("keyup", {
            key, keyCode: key === "ArrowDown" ? 40 : 38, bubbles: true,
        }));
        return event;
    }
    const selectedIndex = container => {
        const active = container.querySelectorAll("[data-active=true]");
        assert.equal(active.length, 1, `Exactly one row is selected; rendered rows: ${
            Array.from(container.querySelectorAll("[data-song-index]")).map(row => row.dataset.songIndex).join(",")
        }; scrollTop: ${container.parentElement?.scrollTop}`);
        return Number(active[0].closest("[data-song-index]").dataset.songIndex);
    };
    async function click(container, index) {
        const row = container.querySelector(`[data-song-index="${index}"]`);
        assert.ok(row, `Row ${index} must be rendered before clicking`);
        row.click();
        await settle();
        assert.equal(document.activeElement, container, "A left click gives the list keyboard focus");
        assert.equal(selectedIndex(container), index);
    }
    async function testList(container, scrollElement) {
        container.focus();
        assert.equal((await press(container, "ArrowDown")).defaultPrevented, false,
            "Arrows require an existing song selection");
        await click(container, 2);
        const globalBefore = globalArrowCalls;
        assert.equal((await press(container, "ArrowDown")).defaultPrevented, true);
        assert.equal(selectedIndex(container), 3);
        await press(container, "ArrowUp");
        assert.equal(selectedIndex(container), 2);
        await press(container, "ArrowUp", { repeat: true });
        assert.equal(selectedIndex(container), 1, "Holding an arrow keeps moving selection");
        assert.equal(globalArrowCalls, globalBefore, "List navigation must not trigger playback hotkeys");

        for (const extra of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }, { isComposing: true }]) {
            await press(container, "ArrowDown", extra);
            assert.equal(selectedIndex(container), 1, "Modified keys and IME events retain their own behavior");
        }
        const input = document.createElement("input");
        input.style.cssText = "position:fixed;top:0;left:0";
        container.append(input);
        input.focus();
        await press(input, "ArrowDown");
        assert.equal(selectedIndex(container), 1, "Inputs inside a list do not navigate its selection");
        input.remove();
        const outside = document.createElement("input");
        outside.style.cssText = "position:fixed;top:0;left:0";
        document.body.append(outside);
        outside.focus();
        await press(outside, "ArrowDown");
        assert.equal(selectedIndex(container), 1, "Unfocused lists do not react to arrows elsewhere");
        outside.remove();

        await click(container, 0);
        await press(container, "ArrowUp");
        assert.equal(selectedIndex(container), 0, "Selection stops at the first row");
        for (let index = 0; index < 45; index++) await press(container, "ArrowDown", { repeat: true });
        assert.equal(selectedIndex(container), 45, "Navigation crosses virtual render windows");
        assert.ok(scrollElement.scrollTop > 0, "The selected row stays visible while navigating");
        scrollElement.scrollTop = 0;
        scrollElement.dispatchEvent(new Event("scroll"));
        await settle();
        const offscreenEvent = await press(container, "ArrowDown");
        await settle();
        assert.ok(offscreenEvent.defaultPrevented && scrollElement.scrollTop > 0,
            `Offscreen navigation: prevented=${offscreenEvent.defaultPrevented}, scrollTop=${scrollElement.scrollTop}, active=${document.activeElement.className}`);
        assert.ok(container.querySelector("[data-song-index=\"46\"]"),
            `Offscreen render: scrollTop=${scrollElement.scrollTop}, containerTop=${container.offsetTop}, transform=${container.querySelector("tbody")?.style.transform}`);
        assert.equal(selectedIndex(container), 46, "Offscreen selection is restored into the virtual window");
        scrollElement.scrollTop = scrollElement.scrollHeight;
        scrollElement.dispatchEvent(new Event("scroll"));
        await settle();
        await click(container, songs.length - 1);
        await press(container, "ArrowDown");
        assert.equal(selectedIndex(container), songs.length - 1, "Selection stops at the last row");
    }

    root.render(React.createElement(MusicList, {
        musicList: songs,
        musicSheet: sheet,
        virtualProps: { getScrollElement: () => viewport },
    }));
    await settle();
    let container = host.querySelector(".music-list-container");
    await testList(container, viewport);
    viewport.scrollTop = 0;
    container.querySelector("th[data-id=title]").click();
    await settle();
    container.querySelector("th[data-id=title]").click();
    await settle();
    await click(container, 0);
    await press(container, "ArrowDown");
    assert.equal(selectedIndex(container), 1);
    assert.ok(container.querySelector("[data-active=true]").textContent.includes("Song 118"),
        "Navigation follows the displayed descending sort order");
    commandHandlers.get("EditSelectedMusic")();
    assert.equal(modals.length, 1, "The existing edit command accepts keyboard selection");
    assert.equal(modals[0].type, "EditMusic");
    assert.equal(modals[0].props.musicItem.id, "118", "Editing uses the selected song in current display order");

    // Mount the real edit form, modal store and close lifecycle. Only persistence
    // is replaced, with the same immutable song refresh caused by a real save.
    const Base = load("src/renderer/components/Modal/templates/Base/index.tsx", {
        "../..": modalBridge,
        "@/renderer/components/SvgAsset": empty,
    }).default;
    const EditMusic = load("src/renderer/components/Modal/templates/EditMusic/index.tsx", {
        "react-i18next": { useTranslation: () => ({ t: key => key }) },
        "react-toastify": { toast: {
            success: message => notices.success.push(message),
            error: message => notices.error.push(message),
        } },
        "@/renderer/core/music-sheet": musicSheetService,
        "@/hooks/useMounted": load("src/hooks/useMounted.ts").default,
        "../..": modalBridge,
        "../Base": Base,
    }).default;
    modalApi = load("src/renderer/components/Modal/index.tsx", {
        "@/common/store": load("src/common/store.ts").default,
        "./templates": { EditMusic },
    });
    const modalHost = document.createElement("div");
    document.body.append(modalHost);
    const modalRoot = createRoot(modalHost);
    modalRoot.render(React.createElement(modalApi.default));
    await settle();
    await settleFrames();
    assert.equal(document.hasFocus(), true, "The isolated Chromium fixture emits real focus events");
    let currentSongs = songs;
    let currentSheet = sheet;
    const renderSongs = async () => {
        root.render(React.createElement(MusicList, {
            musicList: currentSongs,
            musicSheet: currentSheet,
            virtualProps: { getScrollElement: () => viewport },
        }));
        await settle();
    };
    const rowTitle = () => container.querySelector("[data-active=true] [title]")?.getAttribute("title");
    const dialog = () => modalHost.querySelector("form[role=dialog]");
    const setTitle = async title => {
        // The heading also uses this ID; target the actual editable field.
        const field = modalHost.querySelector("input#edit-music-title");
        assert.ok(field, "The real title editor is mounted");
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field, title);
        field.dispatchEvent(new Event("input", { bubbles: true }));
        await settle();
        field.focus();
        return field;
    };
    const enter = async () => {
        await require("electron").ipcRenderer.invoke("music-list-test:enter");
        await settle();
        await settle();
        await settleFrames();
        await settle();
    };
    const saves = [];
    let saveError = false;
    metadataWriter = async (musicItem, sheetId, metadata) => {
        saves.push({ musicItem, sheetId, metadata });
        if (saveError) throw new Error("Expected persistence failure");
        currentSongs = currentSongs.map(item => ({
            ...item,
            ...(item.id === musicItem.id && item.platform === musicItem.platform
                ? { ...metadata, $$displayPlatform: metadata.displayPlatform } : {}),
        }));
        await renderSongs();
    };

    // The existing descending title order is retained across all rerenders.
    commandHandlers.get("EditSelectedMusic")();
    await settle();
    assert.ok(dialog(), "The existing edit command opens the real metadata form");
    assert.equal(document.activeElement, modalHost.querySelector("input#edit-music-title"),
        "The metadata title field receives autofocus");
    await setTitle("Song 118 edited");
    await enter();
    assert.equal(saves.length, 1, "Native Enter submits the real edit form exactly once");
    assert.equal(dialog(), null, "A successful save closes the modal");
    assert.equal(document.activeElement, container,
        `Closing after Enter restores focus to the originating list; active=${document.activeElement?.outerHTML.slice(0, 300)}, scope=${container.dataset.selectionScope}`);
    assert.equal(selectedIndex(container), 1, "An immutable metadata refresh keeps the selected row");
    assert.equal(rowTitle(), "Song 118 edited", "The selected row contains the saved metadata");
    await press(document.activeElement, "ArrowDown");
    assert.equal(selectedIndex(container), 2, "Arrows continue from the edited song without another click");
    commandHandlers.get("EditSelectedMusic")();
    await settle();
    assert.equal(modals.at(-1).props.musicItem.id, "117", "Editing again targets the newly selected song");

    await setTitle("   ");
    await enter();
    assert.ok(dialog(), "Blank-title validation keeps the editor open");
    assert.equal(saves.length, 1, "Invalid metadata never reaches persistence");
    assert.equal(document.activeElement, modalHost.querySelector("input#edit-music-title"));
    saveError = true;
    await setTitle("Failed title");
    await enter();
    assert.ok(dialog(), "A failed save keeps the editor open");
    assert.equal(saves.length, 2);
    assert.equal(notices.error.length, 1, "Save failures are surfaced to the user");
    assert.equal(selectedIndex(container), 2, "Save failure retains the original song selection");
    saveError = false;
    await setTitle("ZZZ renamed song");
    await enter();
    assert.equal(dialog(), null);
    assert.equal(document.activeElement, container);
    assert.equal(selectedIndex(container), 0, "A sorted title change moves selection with the same song identity");
    assert.equal(rowTitle(), "ZZZ renamed song");
    commandHandlers.get("EditSelectedMusic")();
    await settle();
    assert.equal(modals.at(-1).props.musicItem.id, "117", "Reopening after sorting edits the same song");
    modalApi.hideModal();
    await settle();
    await press(document.activeElement, "ArrowDown");
    assert.equal(selectedIndex(container), 1, "Sorted navigation resumes from the edited song's new position");
    assert.equal(rowTitle(), "Song 119");

    commandHandlers.get("EditSelectedMusic")();
    await settle();
    await setTitle("AAA offscreen rename");
    await enter();
    assert.equal(document.activeElement, container);
    assert.equal(selectedIndex(container), songs.length - 1,
        `Renaming a song beyond the virtual window reveals its retained selection; index=${selectedIndex(container)}, title=${rowTitle()}`);
    assert.equal(rowTitle(), "AAA offscreen rename");
    assert.ok(viewport.scrollTop > 0, "Saving a sorted rename scrolls the selected song into view");
    await press(document.activeElement, "ArrowUp");
    assert.equal(selectedIndex(container), songs.length - 2);
    assert.equal(rowTitle(), "Song 000", "Arrows navigate relative to the offscreen song's new sorted position");

    currentSongs = currentSongs.filter(item => item.id !== "0");
    await renderSongs();
    assert.equal(container.querySelectorAll("[data-active=true]").length, 0,
        "Removing the selected song clears selection rather than choosing another song at its index");
    viewport.scrollTop = 0;
    viewport.dispatchEvent(new Event("scroll"));
    await settle();
    await click(container, 1);
    currentSongs = currentSongs.map(item => ({ ...item }));
    await renderSongs();
    assert.equal(selectedIndex(container), 1, "Replacing all song objects retains a surviving identity");
    currentSheet = { ...sheet, id: "different-sheet" };
    await renderSongs();
    assert.equal(container.querySelectorAll("[data-active=true]").length, 0,
        "Switching to another sheet clears selection even when its songs are identical");
    await click(container, 1);
    currentSheet = { ...currentSheet, platform: "different-platform" };
    await renderSongs();
    assert.equal(container.querySelectorAll("[data-active=true]").length, 0,
        "Switching sheet platform clears selection even when the sheet ID is unchanged");

    currentSheet = sheet;
    currentSongs = [
        { ...songs[0], id: "shared-id", platform: "first-source", title: "ZZZ first source" },
        { ...songs[1], id: "shared-id", platform: "second-source", title: "AAA second source" },
    ];
    await renderSongs();
    await click(container, 0);
    currentSongs = currentSongs.map(item => ({
        ...item,
        title: item.platform === "first-source" ? "AAA renamed first source" : "ZZZ second source",
    }));
    await renderSongs();
    assert.equal(selectedIndex(container), 1, "Song IDs are scoped by the original platform across sorting changes");
    assert.equal(rowTitle(), "AAA renamed first source");
    currentSongs = currentSongs.filter(item => item.platform !== "first-source");
    await renderSongs();
    assert.equal(container.querySelectorAll("[data-active=true]").length, 0,
        "Removing a selected identity does not select another platform's song with the same ID");

    currentSongs = [...currentSongs, { ...songs[2], title: "AAA context neighbor" }];
    await renderSongs();
    await click(container, 0);
    container.querySelector("[data-song-index='0']").dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true, cancelable: true, clientX: 20, clientY: 40,
    }));
    await settle();
    const editMenuItem = contextMenu.menuItems.find(item => item.title === "music_list_context_menu.edit_music");
    assert.ok(editMenuItem?.show, "The real song context menu exposes metadata editing");
    const menuButton = document.createElement("div");
    menuButton.setAttribute("role", "button");
    menuButton.style.cssText = "position:fixed;left:20px;top:20px;width:160px;height:35px;background:white";
    menuButton.textContent = "Edit metadata";
    let menuClickOrigin;
    menuButton.onclick = () => {
        menuClickOrigin = document.activeElement;
        editMenuItem.onClick();
        menuButton.remove();
    };
    document.body.append(menuButton);
    const menuRect = menuButton.getBoundingClientRect();
    await require("electron").ipcRenderer.invoke("music-list-test:click", {
        x: Math.round(menuRect.x + menuRect.width / 2),
        y: Math.round(menuRect.y + menuRect.height / 2),
    });
    await settle();
    assert.equal(menuClickOrigin, document.body,
        "A native click on the nonfocusable context-menu item blurs the source list before opening the editor");
    assert.ok(dialog(), "The native context-menu click opens the real editor");
    await setTitle("ZZZ context edit");
    await enter();
    assert.equal(document.activeElement, container, "Context-menu editing also restores the originating list focus");
    assert.equal(selectedIndex(container), 0);
    assert.equal(rowTitle(), "ZZZ context edit");
    await press(document.activeElement, "ArrowDown");
    assert.equal(selectedIndex(container), 1, "Arrow navigation works immediately after a context-menu edit");
    assert.equal(rowTitle(), "AAA context neighbor");

    await click(container, 0);
    commandHandlers.get("EditSelectedMusic")();
    await settle();
    const outsideFocus = document.createElement("button");
    document.body.append(outsideFocus);
    outsideFocus.focus();
    modalApi.hideModal();
    await settle();
    assert.equal(document.activeElement, outsideFocus,
        "Closing the editor preserves a deliberate focus change to another control");
    outsideFocus.remove();

    container.focus();
    commandHandlers.get("EditSelectedMusic")();
    await settle();
    currentSheet = { ...sheet, id: "another-sheet-while-editing" };
    await renderSongs();
    modalApi.hideModal();
    await settle();
    assert.notEqual(document.activeElement, container,
        "Closing an editor opened for a previous sheet does not refocus a different sheet");
    modalRoot.unmount();
    modalHost.remove();

    root.render(React.createElement(PlayList));
    await settle();
    container = host.querySelector(".playlist--music-list-scroll");
    await testList(container, host.querySelector(".playlist--music-list-container"));
    assert.equal(playbackCalls, 0, "Selection never starts or changes playback");
    root.unmount();
    hotkeys.unbind("up,down");
    viewport.remove();
    return "PASS: real song-list and play-queue keyboard navigation; native Enter/context-menu edit save and focus restoration; validation/failure retention; identity across immutable refresh/sorted rename; virtual reveal, removal and sheet scope guards";
}

if (process.type === "renderer") {
    module.exports = { runRendererTests };
} else {
    const { app, BrowserWindow, ipcMain } = require("electron");
    const out = path.join(repo, "out");
    fs.mkdirSync(out, { recursive: true });
    const profile = fs.mkdtempSync(path.join(out, "music-list-navigation-test-"));
    for (const name of ["appData", "userData", "temp", "crashDumps"]) {
        const folder = path.join(profile, name);
        fs.mkdirSync(folder);
        app.setPath(name, folder);
    }
    app.setPath("sessionData", path.join(profile, "userData"));
    app.setAppLogsPath(path.join(profile, "logs"));
    app.whenReady().then(async () => {
        const fixture = path.join(profile, "fixture.html");
        fs.writeFileSync(fixture, "<!doctype html><title>MusicFree song navigation test</title>");
        const window = new BrowserWindow({
            width: 1100, height: 700, show: false,
            webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false, offscreen: true },
        });
        // Hidden windows suspend real frames/focus events without offscreen painting
        // and focused-page emulation. Keep this fixture invisible and independent of user UI.
        window.webContents.on("paint", () => {});
        window.webContents.startPainting();
        ipcMain.handle("music-list-test:enter", () => {
            window.webContents.focus();
            window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Return" });
            window.webContents.sendInputEvent({ type: "char", keyCode: "\r" });
            window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Return" });
        });
        ipcMain.handle("music-list-test:click", (_, point) => {
            window.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point });
            window.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...point });
        });
        try {
            await window.loadFile(fixture);
            window.webContents.debugger.attach("1.3");
            await window.webContents.debugger.sendCommand("Emulation.setFocusEmulationEnabled", { enabled: true });
            const result = await window.webContents.executeJavaScript(
                `require(${JSON.stringify(__filename)}).runRendererTests()`,
            );
            console.log(result);
            app.exit(0);
        } catch (error) {
            console.error(error);
            app.exit(1);
        }
    });
}
