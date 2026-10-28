'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { zipSync } = require('fflate');
const collect = require('../../scripts/build/collect-third-party-licenses.cjs');
const mobile = path.resolve(__dirname, '..');
const repo = path.resolve(mobile, '..');
const stage = path.join(mobile, 'out/license-staging');
const output = path.join(mobile, 'out/notices');
collect(mobile, stage, { noticesDirectory: path.join(repo, 'docs/third-party-licenses') });
const files = {};
function add(folder, prefix = '') {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) throw new Error('Unexpected symlink in notice collection');
        const relative = prefix + entry.name;
        if (entry.isDirectory()) add(path.join(folder, entry.name), relative + '/');
        else if (entry.isFile()) files[relative] = fs.readFileSync(path.join(folder, entry.name));
    }
}
add(path.join(stage, 'docs/third-party-licenses'), 'third-party-licenses/');
files['LICENSE'] = fs.readFileSync(path.join(mobile, 'LICENSE'));
files['UPSTREAM.md'] = fs.readFileSync(path.join(mobile, 'UPSTREAM.md'));
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'THIRD-PARTY-NOTICES.zip'), zipSync(files, { level: 6 }));
fs.copyFileSync(path.join(mobile, 'LICENSE'), path.join(output, 'MusicFree-LICENSE.txt'));
console.log('Mobile notice archive:', path.join(output, 'THIRD-PARTY-NOTICES.zip'));
