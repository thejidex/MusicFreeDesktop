"use strict";
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, no-console */

// Exercise the real song database with Chromium IndexedDB in an isolated profile.
// Run: npm run test:library
const path = require("path");
const fs = require("fs");
const repo = path.resolve(__dirname, "../..");

async function runRendererTests() {
    const assert = require("assert/strict");
    const Module = require("module");
    const resolveFilename = Module._resolveFilename;
    const load = Module._load;
    Module._resolveFilename = function (request, ...args) {
        const aliases = {
            "@/": "src/",
            "@renderer/": "src/renderer/",
            "@shared/": "src/shared/",
        };
        for (const [alias, directory] of Object.entries(aliases)) {
            if (request.startsWith(alias)) {
                request = path.join(repo, directory, request.slice(alias.length));
                break;
            }
        }
        return resolveFilename.call(this, request, ...args);
    };
    // nanoid is ESM; only its unrelated sheet-ID generator is replaced here.
    Module._load = function (request, ...args) {
        if (request === "nanoid") {
            return { nanoid: () => require("crypto").randomBytes(16).toString("hex") };
        }
        return load.call(this, request, ...args);
    };
    require("ts-node").register({ transpileOnly: true, project: path.join(repo, "tsconfig.json") });
    await require("i18next").init({ lng: "zh-CN", resources: {} });
    const backend = require(path.join(repo, "src/renderer/core/music-sheet/backend"));
    const db = require(path.join(repo, "src/renderer/core/db/music-sheet-db")).default;
    const favorite = require(path.join(repo, "src/renderer/core/music-sheet/common/default-sheet")).default;

    await backend.queryAllSheets();
    const first = await backend.addSheet("编辑测试歌单");
    const second = await backend.addSheet("共享歌曲歌单");
    const song = {
        id: "stable-song-id",
        platform: "原始音源",
        title: "旧歌名",
        artist: "旧作者",
        album: "旧专辑",
        duration: 123,
        pluginSongId: { aid: "12345", page: 2 },
        $: { downloadData: { path: "test-only.mp3" } },
    };
    const other = { id: "other", platform: song.platform, title: "另一首歌" };
    await backend.addMusicToSheet([song, other], first.id);
    await backend.addMusicToSheet(song, second.id);
    const beforeSheet = await db.sheets.get(first.id);
    const beforeSong = await db.musicStore.get([song.platform, song.id]);
    const updated = await backend.updateMusicMetadata(song, first.id, {
        title: " 新歌名 ", artist: " 新作者 ", album: " 新专辑 ", displayPlatform: " 自定义来源 ",
    });
    assert.equal(updated.title, "新歌名");
    assert.equal(updated.artist, "新作者");
    assert.equal(updated.album, "新专辑");
    assert.equal(updated.$$displayPlatform, "自定义来源");
    for (const key of ["id", "platform", "duration", "pluginSongId", "$", "$$ref"]) {
        assert.deepEqual(updated[key], beforeSong[key], `${key} must be preserved`);
    }
    assert.deepEqual(await db.sheets.get(first.id), beforeSheet, "sheet order and references must be preserved");
    assert.equal((await backend.getSheetItemDetail(second.id)).musicList[0].title, "新歌名");

    await assert.rejects(backend.updateMusicMetadata(song, first.id, {
        title: "   ", artist: "", album: "", displayPlatform: "",
    }));
    await assert.rejects(backend.updateMusicMetadata(song, "missing-sheet", {
        title: "不能保存", artist: "", album: "", displayPlatform: "",
    }));
    assert.equal((await db.musicStore.get([song.platform, song.id])).title, "新歌名");

    // Reusing a stale search result in another sheet must preserve the saved edit.
    await backend.addMusicToSheet(song, favorite.id);
    await backend.addMusicToSheet(song, favorite.id);
    assert.equal((await backend.getSheetItemDetail(favorite.id)).musicList.length, 1);
    assert.equal((await backend.getSheetItemDetail(favorite.id)).musicList[0].title, "新歌名");
    assert.equal(backend.isFavoriteMusic(song), true);

    db.close();
    await db.open();
    await backend.queryAllSheets();
    const restored = (await backend.getSheetItemDetail(first.id)).musicList[0];
    assert.equal(restored.title, "新歌名");
    assert.equal(restored.$$displayPlatform, "自定义来源");
    assert.deepEqual(restored.pluginSongId, song.pluginSongId);
    assert.equal(restored.platform, song.platform);
    assert.equal(restored.id, song.id);

    await backend.updateMusicMetadata(song, first.id, {
        title: "新歌名", artist: "", album: "", displayPlatform: "",
    });
    const cleared = await db.musicStore.get([song.platform, song.id]);
    assert.equal(cleared.artist, "");
    assert.equal(cleared.album, "");
    assert.equal(cleared.$$displayPlatform, "");
    await backend.removeMusicFromSheet(song, first.id);
    await assert.rejects(backend.updateMusicMetadata(song, first.id, {
        title: "已移除", artist: "", album: "", displayPlatform: "",
    }));
    assert.equal((await db.musicStore.get([song.platform, song.id])).title, "新歌名");
    db.close();
    return "PASS: real IndexedDB edits, shared sheets, identity, references, duplicate favorites, reopen, validation and empty fields";
}

if (process.type === "renderer") {
    module.exports = { runRendererTests };
} else {
    const { app, BrowserWindow } = require("electron");
    const out = path.join(repo, "out");
    fs.mkdirSync(out, { recursive: true });
    const profile = fs.mkdtempSync(path.join(out, "library-customization-test-"));
    for (const name of ["appData", "userData", "temp", "crashDumps"]) {
        const folder = path.join(profile, name);
        fs.mkdirSync(folder);
        app.setPath(name, folder);
    }
    app.setPath("sessionData", path.join(profile, "userData"));
    app.setAppLogsPath(path.join(profile, "logs"));
    app.whenReady().then(async () => {
        const fixture = path.join(profile, "fixture.html");
        fs.writeFileSync(fixture, "<!doctype html><title>MusicFree isolated database test</title>");
        const window = new BrowserWindow({
            show: false,
            webPreferences: { nodeIntegration: true, contextIsolation: false },
        });
        try {
            await window.loadFile(fixture);
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
