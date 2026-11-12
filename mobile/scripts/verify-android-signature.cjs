'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// This is a public certificate fingerprint, not the private signing key.
const fingerprintFile = path.resolve(__dirname, '../android/release-signing-certificate.sha256');

function verifyAndroidSignature(apkPath, buildToolsDirectory) {
    const expected = fs.readFileSync(fingerprintFile, 'utf8').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error('Invalid v1.4 signing certificate fingerprint');
    const apkSigner = path.join(buildToolsDirectory, 'lib', 'apksigner.jar');
    if (!fs.existsSync(apkSigner)) throw new Error(`Android apksigner was not found: ${apkSigner}`);
    const java = process.env.JAVA_HOME
        ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
        : 'java';
    const result = spawnSync(java, ['-jar', apkSigner, 'verify', '--print-certs', apkPath], {
        encoding: 'utf8', windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Android APK signature verification failed: ${(result.stderr || result.stdout).trim()}`);
    const signers = [...result.stdout.matchAll(/^Signer #\d+ certificate SHA-256 digest:\s*([a-f0-9]{64})\s*$/gim)]
        .map(match => match[1].toLowerCase());
    if (signers.length !== 1 || signers[0] !== expected) {
        throw new Error('Android APK signing certificate does not match the v1.4 release certificate');
    }
    return signers[0];
}

if (require.main === module) {
    try {
        const apkPath = process.argv[2] && path.resolve(process.argv[2]);
        const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
        if (!apkPath || !fs.existsSync(apkPath) || !sdkRoot) {
            throw new Error('Usage: set ANDROID_HOME and run node verify-android-signature.cjs <signed-apk>');
        }
        const buildToolsRoot = path.join(sdkRoot, 'build-tools');
        const versions = fs.readdirSync(buildToolsRoot)
            .filter(version => fs.existsSync(path.join(buildToolsRoot, version, 'lib', 'apksigner.jar')))
            .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
        if (!versions.length) throw new Error('Android apksigner was not found in build-tools');
        console.log(`PASS: signing certificate matches v1.4 (${verifyAndroidSignature(apkPath, path.join(buildToolsRoot, versions[0]))})`);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = verifyAndroidSignature;
