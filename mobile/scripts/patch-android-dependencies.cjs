'use strict';

const fs = require('node:fs');
const path = require('node:path');

const mobileRoot = path.resolve(__dirname, '..');
const trackPlayerPackageFile = path.join(mobileRoot, 'node_modules/react-native-track-player/package.json');
const flashListPackageFile = path.join(mobileRoot, 'node_modules/@shopify/flash-list/package.json');
if (!fs.existsSync(trackPlayerPackageFile) || !fs.existsSync(flashListPackageFile)) {
    throw new Error('Android native dependencies are not installed. Run npm run mobile:install first.');
}

function patchFile(packageName, relativePath, changes) {
    const filename = path.join(mobileRoot, 'node_modules', packageName, relativePath);
    let source = fs.readFileSync(filename, 'utf8');
    let changed = false;

    for (const [before, after, description] of changes) {
        const beforeCount = source.split(before).length - 1;
        const afterCount = source.split(after).length - 1;
        if (beforeCount === 1 && afterCount === 0) {
            source = source.replace(before, after);
            changed = true;
        } else if (beforeCount === 0 && afterCount === 1) {
            continue;
        } else {
            throw new Error(`Unexpected ${description} source in react-native-track-player ${installedVersion}; expected exactly one unpatched or patched occurrence.`);
        }
    }

    if (changed) fs.writeFileSync(filename, source);
}

const trackPlayerVersion = require(trackPlayerPackageFile).version;
if (trackPlayerVersion !== '4.1.1') {
    throw new Error(`Android compatibility patch expects react-native-track-player 4.1.1; found ${trackPlayerVersion}. Review the patch before upgrading this dependency.`);
}

patchFile('react-native-track-player', 'android/src/main/java/com/doublesymmetry/trackplayer/module/MusicModule.kt', [
    [
        'callback.resolve(Arguments.fromBundle(musicService.tracks[index].originalItem))',
        'callback.resolve(musicService.tracks[index].originalItem?.let { Arguments.fromBundle(it) })',
        'nullable track bundle handling in getTrack',
    ],
    [
        'else Arguments.fromBundle(\n                musicService.tracks[musicService.getCurrentTrackIndex()].originalItem\n            )',
        'else musicService.tracks[musicService.getCurrentTrackIndex()].originalItem?.let {\n                Arguments.fromBundle(it)\n            }',
        'nullable track bundle handling in getActiveTrack',
    ],
]);

patchFile('react-native-track-player', 'android/src/main/java/com/doublesymmetry/trackplayer/service/MusicService.kt', [[
    'override fun onBind(intent: Intent?): IBinder {',
    'override fun onBind(intent: Intent): IBinder? {',
    'React Native 0.81 service binding signature',
]]);

const flashListVersion = require(flashListPackageFile).version;
if (flashListVersion !== '1.7.6') {
    throw new Error(`Android compatibility patch expects @shopify/flash-list 1.7.6; found ${flashListVersion}. Review the patch before upgrading this dependency.`);
}

patchFile('@shopify/flash-list', 'android/src/main/kotlin/com/shopify/reactnative/flash_list/BlankAreaEvent.kt', [[
    'rctEventEmitter.receiveEvent(viewTag, eventName, eventData)',
    'rctEventEmitter.receiveEvent(viewTag, eventName, getEventData())',
    'React Native event payload access',
]]);

console.log('Applied React Native 0.81 compatibility patches for track-player 4.1.1 and FlashList 1.7.6.');
