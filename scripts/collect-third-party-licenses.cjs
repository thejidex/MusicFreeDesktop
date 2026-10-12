'use strict';
const fs = require('fs');
const path = require('path');

// Keep original notices byte-for-byte; do not synthesize license text from SPDX IDs.
module.exports = function collectThirdPartyLicenses(repo, stage) {
  const output = path.join(stage, 'third-party-licenses');
  fs.cpSync(path.join(repo, 'third-party-licenses'), output, { recursive: true });
  const lock = JSON.parse(fs.readFileSync(path.join(repo, 'package-lock.json'), 'utf8'));
  const records = [];
  const opencc = JSON.parse(fs.readFileSync(path.join(repo, 'node_modules/opencc-js/package.json'), 'utf8'));
  if (opencc.version !== '1.4.2') throw new Error('Refresh checked-in OpenCC notices for version ' + opencc.version);
  const seen = new Set();
  const runtimeHelpers = new Set(['node_modules/css-loader', 'node_modules/style-loader']);
  function findNotices(folder, relative = '', insideNoticeFolder = false) {
    const result = [];
    for (const entry of fs.readdirSync(path.join(folder, relative), { withFileTypes: true })) {
      if (entry.isSymbolicLink() || ['node_modules', '.git'].includes(entry.name)) continue;
      const file = path.join(relative, entry.name);
      const named = /^(licen[cs]e|notice|copying|copyright|third[-_]?party)([._-]|s$|$)/i.test(entry.name);
      if (entry.isDirectory()) result.push(...findNotices(folder, file, insideNoticeFolder || named));
      else if (entry.isFile() && (named || insideNoticeFolder)) result.push(file);
    }
    return result;
  }
  for (const [relative, locked] of Object.entries(lock.packages)) {
    if (!relative || (locked.dev && !runtimeHelpers.has(relative))) continue;
    const folder = path.resolve(repo, relative);
    if (!folder.startsWith(path.resolve(repo, 'node_modules') + path.sep)) {
      throw new Error('Unexpected dependency path: ' + relative);
    }
    const manifestFile = path.join(folder, 'package.json');
    if (!fs.existsSync(manifestFile)) {
      if (locked.optional) continue; // Platform-specific optional dependencies may be absent.
      throw new Error('Dependency missing; run npm ci: ' + relative);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    const identity = manifest.name + '@' + manifest.version;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const key = identity.replace(/[^A-Za-z0-9._-]/g, '_');
    const notices = findNotices(folder);
    // Some upstream packages include their permission notice only in README.
    if (!notices.length) {
      const readme = fs.readdirSync(folder).find(name => /^readme(\.|$)/i.test(name));
      if (readme) notices.push(readme);
    }
    const target = path.join(output, 'packages', key);
    fs.mkdirSync(target, { recursive: true });
    for (const file of notices) {
      fs.mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
      fs.copyFileSync(path.join(folder, file), path.join(target, file));
    }
    fs.copyFileSync(manifestFile, path.join(target, 'package.json'));
    const supplemental = path.join(output, 'supplemental', manifest.name.replace(/[^A-Za-z0-9._-]/g, '_') + '@' + manifest.version);
    const readmePermission = notices.some(file => /^readme/i.test(file) && /permission is hereby granted/i.test(fs.readFileSync(path.join(folder, file), 'utf8')));
    const needsReview = !notices.some(file => !/^readme/i.test(file)) && !readmePermission && !fs.existsSync(path.join(supplemental, 'LICENSE'));
    records.push({
      needsReview,
      name: manifest.name, version: manifest.version, license: manifest.license || manifest.licenses || null,
      source: manifest.repository || manifest.homepage || null,
      directory: 'packages/' + key, files: notices.map(file => file.split(path.sep).join('/')),
    });
  }
  records.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  fs.writeFileSync(path.join(output, 'inventory.json'), JSON.stringify(records, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'INDEX.md'), [
    '# Third-party notices', '',
    'Original notices from installed runtime dependencies and bundled CSS runtime helpers.',
    'This is a conservative inventory: some listed dependencies may be removed by bundling.',
    'Electron and Chromium notices remain at the application root. Other original bundled notices are preserved.',
    'OpenCC dictionary notices are also retained in opencc-js/THIRD_PARTY_LICENSES.md.',
    'Metadata is informational; the original license text governs. This inventory is not a legal audit.', '',
    '| Package | Version | Declared license | Files |', '| --- | --- | --- | --- |',
    ...records.map(item => '| ' + item.name + ' | ' + item.version + ' | ' +
      (typeof item.license === 'string' ? item.license : JSON.stringify(item.license)).replace(/\|/g, '\\|') +
      ' | [Original files](' + item.directory + '/) |'),
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(output, 'REVIEW.md'), '# Notice collection limits\n\nSupplemental notices include provenance in SOURCE.json; some are from later upstream branches, not the original package revision.\n\nNo standalone license text found for the following installed packages; their original README and package metadata are retained, without inventing a copyright notice:\n\n' + records.filter(item => item.needsReview).map(item => '- ' + item.name + '@' + item.version).join('\n') + '\n');
  console.log('Collected third-party notices for ' + records.length + ' installed packages.');
  return records;
};
