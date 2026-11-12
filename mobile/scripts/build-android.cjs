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
require('./patch-android-dependencies.cjs');
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
const libraries = [];
require('fflate').unzipSync(fs.readFileSync(built), { filter(entry) {
    if (entry.name.startsWith('lib/') && entry.name.endsWith('.so')) libraries.push(entry.name);
    return false;
} });
if (!libraries.length || libraries.some(name => name.split('/')[1] !== arch)) {
    throw new Error('APK contains unexpected native architectures');
}

const alignmentCheck = spawnSync(process.execPath, [
    path.join(__dirname, 'verify-apk-page-alignment.cjs'), built, arch,
], { cwd: root, env, stdio: 'inherit', windowsHide: true });
if (alignmentCheck.error) throw alignmentCheck.error;
if (alignmentCheck.status !== 0) process.exit(alignmentCheck.status || 1);

const sdkRoot = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
if (!sdkRoot) throw new Error('Set ANDROID_HOME or ANDROID_SDK_ROOT to run the APK ZIP alignment check.');
const buildToolsRoot = path.join(sdkRoot, 'build-tools');
const zipalignName = windows ? 'zipalign.exe' : 'zipalign';
const zipalignVersions = fs.readdirSync(buildToolsRoot)
    .filter(version => fs.existsSync(path.join(buildToolsRoot, version, zipalignName)))
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
if (!zipalignVersions.length) throw new Error(`Android zipalign was not found under ${buildToolsRoot}`);
const zipalignResult = spawnSync(path.join(buildToolsRoot, zipalignVersions[0], zipalignName),
    ['-c', '-P', '16', '4', built], { cwd: root, env, stdio: 'inherit', windowsHide: true });
if (zipalignResult.error) throw zipalignResult.error;
if (zipalignResult.status !== 0) process.exit(zipalignResult.status || 1);

const signer = require('./verify-android-signature.cjs')(built, path.join(buildToolsRoot, zipalignVersions[0]));
console.log(`Verified Android signing certificate matches v1.4: ${signer}`);

for (const name of ['libreactnative.so', 'libhermes.so', 'libexpo-modules-core.so', 'libreactnativemmkv.so', 'libreanimated.so', 'libworklets.so', 'librnscreens.so']) {
    if (!libraries.includes(`lib/${arch}/${name}`)) throw new Error(`APK native dependency missing: ${name}`);
}
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(built, target);
const hash = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
fs.writeFileSync(path.join(output, `SHA256SUMS-v${version}-android-${suffix}.txt`), `${hash}  ${filename}\n`);
fs.mkdirSync(path.join(root, 'out'), { recursive: true });
fs.writeFileSync(path.join(root, 'out/android-build.json'), JSON.stringify({ version, architecture: arch, filename, sha256: hash }, null, 2));
console.log(`Built ${target}`);
