const {getDefaultConfig} = require('expo/metro-config');
const {mergeConfig} = require('@react-native/metro-config');
const path = require('path');

/**
 * Reference: https://github.com/software-mansion/react-native-svg/blob/main/USAGE.md
 */
const defaultConfig = getDefaultConfig(__dirname);
const {assetExts, sourceExts} = defaultConfig.resolver;
/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
    // The wire format is shared with the Electron application and has no native dependencies.
    watchFolders: [path.resolve(__dirname, '../src/shared/playlist-exchange')],
    transformer: {
        babelTransformerPath: require.resolve('react-native-svg-transformer'),
    },
    resolver: {
        assetExts: assetExts.filter(ext => ext !== 'svg'),
        sourceExts: [...sourceExts, 'svg'],
    },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
