const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/core/library-data.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', compiled)(loaded, loaded.exports);
const { LibraryData, PlaybackSession, songKey } = loaded.exports;
const values = new Map();
const storage = { getString: k => values.get(k), set: (k, v) => values.set(k, v), getAllKeys: () => [...values.keys()] };
const data = new LibraryData(storage);
const a = { platform: 'source', id: 'a', title: 'Original', artist: 'Artist' };
const b = { ...a, platform: 'other-source' };
assert.notEqual(songKey(a), songKey(b));
assert.equal(songKey({ platform: 'x', id: 1 }), songKey({ platform: 'x', id: '1' }));
data.edit(a, { title: 'Edited', displaySource: 'Custom' });
assert.equal(data.apply(a).platform, 'source');
assert.equal(data.apply(a).id, 'a');
assert.equal(data.apply({ ...a, title: 'Plugin update' }).title, 'Edited');
assert.equal(data.apply(b).title, 'Original');
assert.throws(() => data.edit(a, { title: ' ' }));
const session = new PlaybackSession();
session.begin(a);
assert.equal(data.count(a), 0); // Requested/failed playback does not count.
if (session.played(a)) data.increment(a);
assert.equal(data.count(a), 1);
assert.equal(session.played(a), false); // Resume/buffering/seek/quality reload.
session.begin(a);
assert.equal(session.played(a), false);
session.begin(a, true); // Explicit replay and single-track repeat.
if (session.played(a)) data.increment(a);
assert.equal(data.count(a), 2);
session.begin(b);
assert.equal(session.played(a), false); // Late native event for an older track.
if (session.played(b)) data.increment(b);
assert.equal(data.count(b), 1);
const restored = new LibraryData(storage);
assert.equal(restored.count(a), 2);
assert.equal(restored.apply(a).title, 'Edited');
const copy = new Map();
const imported = new LibraryData({ getString: key => copy.get(key), set: (key, value) => copy.set(key, value), getAllKeys: () => [...copy.keys()] });
imported.restore(data.snapshot());
assert.equal(imported.apply(a).title, 'Edited');
assert.equal(imported.count(a), 2);
imported.increment(a);
imported.restore(data.snapshot());
assert.equal(imported.count(a), 3); // Restoring an older backup never lowers a count.
imported.restore({ 'count:invalid': '100', 'count:["source","a"]': '-5' });
assert.equal(imported.count(a), 3);
console.log('PASS: identity, edits, plugin refresh, persistence, actual-play counting, duplicate events, replay and stale events');
