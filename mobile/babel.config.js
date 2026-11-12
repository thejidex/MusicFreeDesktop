module.exports = {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    plugins: [
        [
            'module-resolver',
            {
                // Root lookup treats a dependency's bare '..' import as the
                // parent Electron package once .webpack exists. Only map aliases.
                cwd: __dirname,
                alias: {
                    '^@/(.+)': './src/\\1',
                    '^nanoid$': './node_modules/nanoid/index.browser.js',
                    'webdav': "webdav/dist/react-native"
                },
            },
        ],
        'react-native-reanimated/plugin',
    ],
    env: {
        production: {
            plugins: ['transform-remove-console'],
        },
    },
};
