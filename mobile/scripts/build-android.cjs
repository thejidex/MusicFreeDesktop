'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version.split('.').slice(0, 2).join('.');
const output = path.resolve(root, '../release');
const arch = process.env.MUSICFREE_ANDROID_ARCH || 'arm64-v8a';
if (!['arm64-v8a', 'armeabi-v7a', 'x86_64'].includes(arch)) throw new Error('Unsupported Android architecture');
const suffix = { 'arm64-v8a': 'arm64', 'armeabi-v7a': 'armv7', x86_64: 'x64' }[arch];
const filename = `MusicFree-v${version}-android-${suffix}.apk`;
const target = path.join(output, filename);
if (fs.existsSync(target)) throw new Error(`Output already exists: ${target}`);
const env = { ...process.env };
if (env.MUSICFREE_ANDROID_SIGNING_FILE) {
    const signing = JSON.parse(fs.readFileSync(env.MUSICFREE_ANDROID_SIGNING_FILE, 'utf8'));
    Object.assign(env, {
        MUSICFREE_ANDROID_KEYSTORE: signing.storeFile,
        MUSICFREE_ANDROID_STORE_PASSWORD: signing.storePassword,
        MUSICFREE_ANDROID_KEY_ALIAS: signing.keyAlias,
        MUSICFREE_ANDROID_KEY_PASSWORD: signing.keyPassword,
    });
}
for (const key of ['MUSICFREE_ANDROID_KEYSTORE', 'MUSICFREE_ANDROID_STORE_PASSWORD', 'MUSICFREE_ANDROID_KEY_ALIAS', 'MUSICFREE_ANDROID_KEY_PASSWORD']) {
    if (!env[key]) throw new Error(`Missing ${key}; release APKs must use your persistent signing key.`);
}
const windows = process.platform === 'win32';
require('./collect-notices.cjs');
const result = spawnSync(windows ? 'cmd.exe' : './gradlew', windows
    ? ['/d', '/c', 'gradlew.bat', 'assembleRelease', `-PreactNativeArchitectures=${arch}`, '--no-daemon', '--console=plain', '--max-workers=2']
    : ['assembleRelease', `-PreactNativeArchitectures=${arch}`, '--no-daemon', '--console=plain', '--max-workers=2'],
    { cwd: path.join(root, 'android'), env, stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
const built = path.join(root, 'android/app/build/outputs/apk/release/app-release.apk');
if (!fs.existsSync(built)) throw new Error('Signed APK not found');
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(built, target);
const hash = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
fs.writeFileSync(path.join(output, `SHA256SUMS-v${version}-android-${suffix}.txt`), `${hash}  ${filename}\n`);
fs.mkdirSync(path.join(root, 'out'), { recursive: true });
fs.writeFileSync(path.join(root, 'out/android-build.json'), JSON.stringify({ version, architecture: arch, filename, sha256: hash }, null, 2));
console.log(`Built ${target}`);
