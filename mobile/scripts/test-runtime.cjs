'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const nativeRequire = require('node:module').createRequire(path.resolve(__dirname, '../package.json'));
const { zipSync, strToU8 } = require('fflate');
const src = path.resolve(__dirname, '../src');
function load(relative, mocks = {}) {
    const filename = path.resolve(src, relative);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
        target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
    } }).outputText;
    const module = { exports: {} };
    const resolver = name => {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (name.startsWith('@/')) return load(name.slice(2) + '.ts', mocks);
        if (name.startsWith('.')) return load(path.relative(src, path.resolve(path.dirname(filename), name)) + '.ts', mocks);
        return nativeRequire(name);
    };
    new Function('module', 'exports', 'require', code)(module, module.exports, resolver);
    return module.exports;
}
async function main() {
    // Exercise the monorepo with an existing desktop build: dependency imports
    // must keep resolving within their own package, never to Electron's main.
    const desktopMain = path.resolve(__dirname, '../../.webpack/main/index.js');
    const createdDesktopFixture = !fs.existsSync(desktopMain);
    if (createdDesktopFixture) {
        fs.mkdirSync(path.dirname(desktopMain), { recursive: true });
        fs.writeFileSync(desktopMain, 'module.exports = {};\n');
    }
    try {
        const transformed = require('@babel/core').transformSync("import TrackPlayer from '..'; TrackPlayer.play();", {
            filename: path.resolve(__dirname, '../node_modules/react-native-track-player/src/hooks/useIsPlaying.ts'),
            configFile: path.resolve(__dirname, '../babel.config.js'), babelrc: false,
        }).code;
        assert.ok(!transformed.includes('.webpack'), 'Mobile dependency was redirected into the Electron application');
    } finally {
        if (createdDesktopFixture) fs.unlinkSync(desktopMain);
    }
    const collection = load('core/trackPlayer/collection.ts');
    const song = { platform: 'bilibili', id: 'video', bvid: 'BV-test', title: 'Collection' };
    const getAlbum = async () => ({ isEnd: true, musicList: [{ id: 'part-a', cid: 1, duration: 10 }, { id: 'part-b', cid: 2, duration: 20 }] });
    const plan = await collection.resolveCollection({ ...song, url: 'https://expired.example/last-part', source: { standard: { url: 'https://expired.example/last-part' } } }, getAlbum);
    assert.equal(plan.parts[0].url, undefined);
    assert.equal(plan.parts[0].source, undefined);
    assert.deepEqual(plan.offsets, [0, 10]);
    assert.equal(plan.total, 30);
    assert.deepEqual(collection.collectionPosition(plan, 15), { part: 1, position: 5 });
    assert.deepEqual(collection.collectionPosition(plan, -5), { part: 0, position: 0 });
    assert.deepEqual(collection.collectionPosition(plan, 10), { part: 1, position: 0 });
    assert.equal((await collection.resolveCollection({ ...song, cid: 1 }, getAlbum)), null);
    assert.equal((await collection.resolveCollection(song, async () => ({ isEnd: false }))), null);
    assert.equal((await collection.resolveCollection(song, async () => { throw new Error('Plugin unavailable'); })), null);
    assert.equal((await collection.resolveCollection(song, async () => ({ musicList: [{ cid: 1, duration: -1 }, { cid: 2, duration: 1 }] }))), null);

    // Exercise the real controller across a paused, cross-part seek and restart.
    const persisted = new Map();
    const native = { position: 0, queue: [], plays: 0,
        getPlaybackState: async () => ({ state: 'paused' }),
        setQueue: async queue => { native.queue = queue; native.position = 0; },
        seekTo: async position => { native.position = position; },
        play: async () => { native.plays++; }, addEventListener: () => {},
    };
    const same = (a, b) => a?.platform === b?.platform && String(a?.id) === String(b?.id);
    const controller = load('core/trackPlayer/index.ts', {
        'react-native-track-player': { __esModule: true, default: native, State: { Playing: 'playing', Paused: 'paused' }, Event: {} },
        '@/components/dialogs/useDialog': {},
        '@/utils/delay': async () => {},
        '@/constants/commonConst': { internalFakeSoundKey: 'fake', sortIndexSymbol: Symbol('sort'), timeStampSymbol: Symbol('time') },
        '@/constants/repeatModeConst': { MusicRepeatMode: { QUEUE: 'queue', SINGLE: 'single', SHUFFLE: 'shuffle' } },
        '@/utils/log': { errorLog: (...args) => { throw new Error(args.join(' ')); }, trace: () => {} },
        '@/utils/mediaUtils': { isSameMediaItem: same }, '@/utils/network': {},
        '@/utils/persistStatus': { get: key => persisted.get(key), set: (key, value) => persisted.set(key, value) },
        '@/utils/qualities': {}, '@/utils/trackUtils': { musicIsPaused: state => state === 'paused' },
        '../localMusicSheet': {}, '../library': { library: { apply: item => ({ ...item }) } },
        '@/core.defination/trackPlayer': { TrackPlayerEvents: { CurrentMusicChanged: 'current', PlayEnd: 'end' } },
        '@/constants/assetsConst': { ImgAsset: { albumDefault: 'file:///cover.png' } },
        '@/utils/fileUtils': { resolveImportedAssetOrPath: value => value },
    }).default;
    const plugin = { methods: { getAlbumInfo: getAlbum, getMediaSource: async item => ({ url: `file:///part-${item.cid}.wav` }) } };
    const inject = player => player.injectDependencies({ getConfig: key => key === 'basic.defaultPlayQuality' ? 'standard' : false }, {}, { getByMedia: () => plugin });
    inject(controller);
    controller.setPlayList([song]);
    controller.setCurrentMusic(song);
    controller.collection = await collection.resolveCollection(song, getAlbum);
    await controller.seekTo(15);
    assert.equal(native.position, 5);
    assert.equal(persisted.get('music.progress'), 15, 'Paused cross-part seek must survive the source reset');
    assert.equal(native.plays, 0);
    const restored = new controller.constructor();
    inject(restored);
    await restored.setupTrackPlayer();
    await new Promise(setImmediate);
    assert.equal(restored.collection.part, 1);
    assert.equal(native.queue[0].url, 'file:///part-2.wav');
    assert.equal(restored.toCollectionProgress({ position: native.position }).position, 15);
    assert.equal(native.plays, 0, 'Restoring paused playback must not autoplay');

    const virtualFiles = new Map();
    const config = new Map();
    let selected;
    const packs = load('core/theme-packs.ts', {
        'react-native-fs': {
            stat: async file => ({ size: fs.statSync(file).size }),
            readFile: async (file, encoding) => fs.readFileSync(file).toString(encoding),
            mkdir: async () => {},
            writeFile: async (file, data, encoding) => virtualFiles.set(file, Buffer.from(data, encoding)),
        },
        '@/constants/pathConst': { basePath: '/sandbox' },
        './theme': { setTheme: (...args) => { selected = args; } },
        './appConfig': { setConfig: (key, value) => config.set(key, value) },
    });
    const themeRoot = path.resolve(__dirname, '../../MusicFree主题');
    const themes = fs.readdirSync(themeRoot, { recursive: true }).filter(file => file.endsWith('.mftheme'));
    assert.equal(themes.length, 11);
    let dynamic = 0;
    for (const file of themes) {
        const name = await packs.installThemePack(path.join(themeRoot, file));
        assert.ok(name && selected[0].startsWith('pack-'));
        assert.ok(selected[1].colors.primary, `${file} lost its theme color`);
        if (config.get('theme.packHtml')) { dynamic++; assert.ok(virtualFiles.has(config.get('theme.packHtml'))); }
    }
    assert.equal(dynamic, 3);
    const testRoot = path.resolve(__dirname, '../out/tests');
    fs.mkdirSync(testRoot, { recursive: true });
    const bad = path.join(testRoot, 'unsafe.mftheme');
    fs.writeFileSync(bad, zipSync({ '../outside': strToU8('bad'), 'config.json': strToU8('{"name":"unsafe"}') }));
    await assert.rejects(packs.installThemePack(bad), /路径/);

    const lyrics = load('core/lyric-provider.ts', {
        'react-native-fs': {}, '@/constants/pathConst': { lrcCachePath: '/sandbox/lyrics/' },
    });
    const item = { id: '1', platform: 'local', title: 'Test Song', artist: 'Test Artist', duration: 180 };
    const candidate = { source: 'lrclib', id: 1, title: 'Test Song', artists: ['Test Artist'], duration: 180 };
    assert.ok(lyrics.rankLyricCandidate(item, candidate, 'Test Song') >= 75);
    assert.ok(lyrics.rankLyricCandidate(item, { ...candidate, duration: 220 }, 'Test Song') < 0);
    assert.ok(lyrics.rankLyricCandidate(item, { ...candidate, title: 'Test Song (live)' }, 'Test Song') < 0);
    const display = load('utils/lyric-display.ts');
    assert.equal(display.displayLyric('繁體歌詞', true), '繁体歌词');
    assert.equal(display.displayLyric('繁體歌詞', false), '繁體歌詞');
    console.log('PASS: collection boundaries/fallback, all 11 bundled themes (3 dynamic), unsafe archive paths, lyric matching and display conversion');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
