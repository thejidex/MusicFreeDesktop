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
    const collection = load('core/trackPlayer/collection.ts');
    const song = { platform: 'bilibili', id: 'video', bvid: 'BV-test', title: 'Collection' };
    const getAlbum = async () => ({ isEnd: true, musicList: [{ id: 'part-a', cid: 1, duration: 10 }, { id: 'part-b', cid: 2, duration: 20 }] });
    const plan = await collection.resolveCollection(song, getAlbum);
    assert.deepEqual(plan.offsets, [0, 10]);
    assert.equal(plan.total, 30);
    assert.deepEqual(collection.collectionPosition(plan, 15), { part: 1, position: 5 });
    assert.deepEqual(collection.collectionPosition(plan, -5), { part: 0, position: 0 });
    assert.deepEqual(collection.collectionPosition(plan, 10), { part: 1, position: 0 });
    assert.equal((await collection.resolveCollection({ ...song, cid: 1 }, getAlbum)), null);
    assert.equal((await collection.resolveCollection(song, async () => ({ isEnd: false }))), null);
    assert.equal((await collection.resolveCollection(song, async () => { throw new Error('Plugin unavailable'); })), null);
    assert.equal((await collection.resolveCollection(song, async () => ({ musicList: [{ cid: 1, duration: -1 }, { cid: 2, duration: 1 }] }))), null);

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
