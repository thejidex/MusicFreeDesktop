'use strict';

// Run before the bundled main process imports modules that cache data paths.
const { app, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

if (process.platform === 'win32') {
  try {
    const base = path.join(path.dirname(app.getPath('exe')), 'portable');
    for (const name of ['appData', 'userData', 'logs', 'crashDumps', 'temp', 'downloads']) {
      fs.mkdirSync(path.join(base, name), { recursive: true });
    }
    for (const name of ['appData', 'userData', 'crashDumps', 'temp']) {
      app.setPath(name, path.join(base, name));
    }
    app.setPath('sessionData', path.join(base, 'userData'));
    app.setAppLogsPath(path.join(base, 'logs'));

    // Only create defaults for a fresh instance; preserve an existing user's settings.
    const configFile = path.join(base, 'userData', 'config.json');
    if (!fs.existsSync(configFile)) {
      fs.writeFileSync(configFile, JSON.stringify({
        '$schema-version': 1,
        'normal.checkUpdate': false,
        'download.path': path.join(base, 'downloads'),
      }, null, 2), { flag: 'wx' });
    }
  } catch (error) {
    dialog.showErrorBox('MusicFree', '无法写入 portable 数据文件夹。请将程序放在可写的文件夹后重试。\n\n' + error.message);
    app.exit(1);
    throw error;
  }
}
