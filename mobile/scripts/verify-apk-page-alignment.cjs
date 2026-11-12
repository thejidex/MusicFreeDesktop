'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { unzipSync } = require('fflate');

const apkPath = process.argv[2] && path.resolve(process.argv[2]);
const expectedArch = process.argv[3] || process.env.MUSICFREE_ANDROID_ARCH;
if (!apkPath || !fs.existsSync(apkPath)) {
    throw new Error('Usage: node scripts/verify-apk-page-alignment.cjs <apk-path> [android-abi]');
}

function inspectElf(name, data) {
    const bytes = Buffer.from(data);
    if (bytes.length < 64 || bytes.subarray(0, 4).toString('hex') !== '7f454c46') {
        throw new Error(`${name} is not a valid ELF binary`);
    }

    const elfClass = bytes[4];
    const littleEndian = bytes[5] === 1;
    if (![1, 2].includes(elfClass) || ![1, 2].includes(bytes[5])) {
        throw new Error(`${name} has an unsupported ELF class or byte order`);
    }

    const readU16 = offset => littleEndian ? bytes.readUInt16LE(offset) : bytes.readUInt16BE(offset);
    const readU32 = offset => littleEndian ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset);
    const readU64 = offset => Number(littleEndian ? bytes.readBigUInt64LE(offset) : bytes.readBigUInt64BE(offset));
    const programOffset = elfClass === 1 ? readU32(28) : readU64(32);
    const entrySize = readU16(elfClass === 1 ? 42 : 54);
    const entryCount = readU16(elfClass === 1 ? 44 : 56);
    const alignOffset = elfClass === 1 ? 28 : 48;
    const programHeaders = [];

    for (let index = 0; index < entryCount; index += 1) {
        const offset = programOffset + index * entrySize;
        if (offset + entrySize > bytes.length) throw new Error(`${name} has a truncated program header table`);
        if (readU32(offset) !== 1) continue;
        const alignment = elfClass === 1 ? readU32(offset + alignOffset) : readU64(offset + alignOffset);
        programHeaders.push(alignment);
    }

    if (!programHeaders.length) throw new Error(`${name} has no PT_LOAD segments`);
    return programHeaders;
}

const entries = unzipSync(fs.readFileSync(apkPath), {
    filter(entry) {
        return entry.name.startsWith('lib/') && entry.name.endsWith('.so');
    },
});
const nativeLibraries = Object.entries(entries).sort(([left], [right]) => left.localeCompare(right));
if (!nativeLibraries.length) throw new Error('APK contains no native shared libraries');
if (expectedArch && nativeLibraries.some(([name]) => name.split('/')[1] !== expectedArch)) {
    throw new Error(`APK contains a native ABI other than ${expectedArch}`);
}

let failed = false;
for (const [name, data] of nativeLibraries) {
    const alignments = inspectElf(name, data);
    const supported = alignments.every(alignment => alignment >= 0x4000);
    if (!supported) failed = true;
    console.log(`${supported ? 'PASS' : 'FAIL'} ${name}: PT_LOAD align ${alignments.map(value => `0x${value.toString(16)}`).join(', ')}`);
}

if (failed) process.exitCode = 1;
else console.log(`All ${nativeLibraries.length} native libraries meet the 16 KB page alignment check.`);
