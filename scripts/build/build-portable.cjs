'use strict';

// Build from this checkout, never from an installed app or a personal data folder.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const repo = path.resolve(__dirname, '../..');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: repo, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Command failed: ' + command + ' (exit ' + result.status + ')');
  return result;
}

function git(...args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error('Cannot read source revision with Git.');
  return result.stdout.trim();
}

function sha256(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let count;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, count));
    }
    return hash.digest('hex');
  } finally { fs.closeSync(fd); }
}

function filesUnder(folder, prefix = '') {
  const files = [];
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Unexpected symbolic link: ' + entry.name);
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) files.push(...filesUnder(path.join(folder, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

async function main() {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('This builder requires Windows x64.');
  }
  const args = process.argv.slice(2);
  const sourceManifest = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
  let tag = 'v' + sourceManifest.version.replace(/\.0$/, '');
  let output;
  let skipPackage = false;
  while (args.length) {
    const option = args.shift();
    if (option === '--tag') tag = args.shift();
    else if (option === '--output') output = args.shift();
    else if (option === '--skip-package') skipPackage = true;
    else if (option === '--help') {
      console.log('node scripts/build/build-portable.cjs [--tag v1.1.1] [--output DIRECTORY] [--skip-package]');
      console.log('Default: use the package version and save release files in ./release.');
      return;
    } else throw new Error('Unknown option: ' + option);
  }
  if (!tag || !/^v[0-9][A-Za-z0-9._-]*$/.test(tag)) throw new Error('Invalid release tag.');
  if (output === '') throw new Error('Output directory cannot be empty.');
  output = path.resolve(output || path.join(repo, 'release'));
  const stem = 'MusicFree-' + tag + '-win-x64';
  const exeFile = path.join(output, stem + '.exe');
  const zipFile = path.join(output, stem + '.zip');
  const checksumFile = path.join(output, 'SHA256SUMS-' + tag + '.txt');
  for (const file of [exeFile, zipFile, checksumFile]) {
    if (fs.existsSync(file)) throw new Error('Output already exists; update the release version or remove confirmed obsolete package files first: ' + file);
  }

  const loadForgeConfig = require('@electron-forge/core/dist/util/forge-config').default;
  const { getHookListrTasks } = require('@electron-forge/core/dist/util/hook');
  const { Listr } = require('listr2');
  const forgeConfig = await loadForgeConfig(repo);
  if (!skipPackage) {
    for (const hook of ['generateAssets', 'prePackage']) {
      await new Listr(await getHookListrTasks(forgeConfig, hook, 'win32', 'x64')).run();
    }
  }
  // Forge 6's Packager step can exit before producing a directory on newer Node.
  // Use its production bundles with Electron's documented prebuilt-binary layout.
  const packaged = path.join(path.dirname(require.resolve('electron/package.json')), 'dist');
  if (!fs.existsSync(path.join(repo, '.webpack', 'main', 'index.js'))) {
    throw new Error('Production webpack bundles not found.');
  }
  fs.mkdirSync(output, { recursive: true });
  const workRoot = path.join(repo, 'out', 'portable-builds', tag);
  fs.mkdirSync(workRoot, { recursive: true });
  const work = fs.mkdtempSync(path.join(workRoot, '.build-'));
  const buildManifestFile = path.join(work, 'package-manifest.json');
  const stage = path.join(work, 'app');
  fs.mkdirSync(stage);

  // Explicit runtime allowlist. In particular, never copy a portable directory.
  const runtimeFiles = [
    'MusicFree.exe', 'chrome_100_percent.pak', 'chrome_200_percent.pak',
    'd3dcompiler_47.dll', 'ffmpeg.dll', 'icudtl.dat', 'libEGL.dll', 'libGLESv2.dll',
    'LICENSE', 'LICENSES.chromium.html', 'resources.pak', 'snapshot_blob.bin',
    'v8_context_snapshot.bin', 'version', 'vk_swiftshader_icd.json',
    'vk_swiftshader.dll', 'vulkan-1.dll',
  ];
  for (const name of runtimeFiles) {
    fs.copyFileSync(path.join(packaged, name === 'MusicFree.exe' ? 'electron.exe' : name), path.join(stage, name));
  }
  fs.cpSync(path.join(packaged, 'locales'), path.join(stage, 'locales'), { recursive: true });
  const appFolder = path.join(stage, 'resources', 'app');
  fs.mkdirSync(appFolder, { recursive: true });
  fs.cpSync(path.join(repo, '.webpack'), path.join(appFolder, '.webpack'), { recursive: true });
  fs.cpSync(path.join(repo, 'res'), path.join(stage, 'resources', 'res'), { recursive: true });
  const moduleRoot = path.join(repo, 'node_modules');
  fs.cpSync(moduleRoot, path.join(appFolder, 'node_modules'), {
    recursive: true,
    filter(source) {
      const relative = path.relative(moduleRoot, source).split(path.sep).join('/');
      return !forgeConfig.packagerConfig.ignore('/node_modules' + (relative ? '/' + relative : ''));
    },
  });
  const appManifestFile = path.join(appFolder, 'package.json');
  const manifest = { ...sourceManifest };
  delete manifest.devDependencies;
  delete manifest.scripts;
  delete manifest['lint-staged'];
  delete manifest.config;
  await require('rcedit')(path.join(stage, 'MusicFree.exe'), {
    icon: path.join(repo, 'res', 'logo.ico'),
    'version-string': { ProductName: 'MusicFree', FileDescription: 'MusicFree Desktop - thejidex' },
    'file-version': manifest.version, 'product-version': manifest.version,
  });
  if (!manifest.main || manifest.main === 'portable-start.cjs') throw new Error('Unexpected packaged entry point.');
  fs.copyFileSync(path.join(__dirname, 'portable', 'portable-init.cjs'), path.join(appFolder, 'portable-init.cjs'));
  fs.writeFileSync(path.join(appFolder, 'portable-start.cjs'),
    "'use strict';\nrequire('./portable-init.cjs');\nrequire(" + JSON.stringify('./' + manifest.main) + ");\n");
  manifest.main = 'portable-start.cjs';
  fs.writeFileSync(appManifestFile, JSON.stringify(manifest, null, 2) + '\n');
  for (const name of ['appData', 'userData', 'logs', 'crashDumps', 'temp', 'downloads']) {
    fs.mkdirSync(path.join(stage, 'portable', name), { recursive: true });
  }
  fs.copyFileSync(path.join(repo, 'LICENSE'), path.join(stage, 'LICENSE-MusicFree-AGPL-3.0.txt'));
  fs.copyFileSync(path.join(repo, 'README.md'), path.join(stage, 'README.md'));
  fs.cpSync(path.join(repo, 'docs'), path.join(stage, 'docs'), { recursive: true });
  require('./collect-third-party-licenses.cjs')(repo, stage);
  fs.writeFileSync(path.join(stage, '使用说明.txt'), '\ufeff' + [
    'MusicFree · thejidex 个人改进版 · ' + tag,
    '基于上游 MusicFreeDesktop 0.0.8，非原作者官方发布。',
    '原作者：https://github.com/maotoumao',
    '原仓库：https://github.com/maotoumao/MusicFreeDesktop',
    '本版本源码：https://github.com/thejidex/MusicFreeDesktop/tree/' + tag,
    '修改者：thejidex；功能改进更新日期：2026-10-19；版权说明更新日期：2026-10-12。',
    '第三方版权文件：docs/third-party-licenses/INDEX.md。',
    '',
    'EXE 首次运行在旁边解压为 MusicFree-' + tag + '，然后启动。',
    'ZIP 用户请完整解压后运行 MusicFree.exe。',
    '建议放在 D 盘的普通可写文件夹。',
    '配置、歌单、搜索历史、插件、主题、缓存和日志保存在 portable 内。',
    '歌曲默认下载到 portable/downloads，可在设置中修改。',
    '分享包不包含维护者的个人数据，不预装音源插件，请自行安装插件。',
    '再次分享请发送原始下载 EXE/ZIP，不要发送已经使用过的程序文件夹。',
    '',
    '功能改进和使用限制详见 README.md。',
    '默认空格播放/暂停，左右方向键切歌；Ctrl+/ 搜索，Z 收藏或取消收藏当前歌曲。',
    '我的歌单中左键选中单首歌曲后，Ctrl+Z 打开编辑；输入框中保留正常撤销。',
    '我的歌单内右键单首歌曲可编辑歌名、作者、专辑和显示来源。',
    '设置 → 常规可隐藏歌曲列表的专辑、来源列。播放列表显示歌曲序号。',
    '歌词缺失自动匹配默认启用，会向网易云音乐或 LRCLIB 查询歌曲信息，可在设置中关闭。',
    '本 Fork 请从本仓库 Releases 更新。',
    '保留 MusicFree 与第三方组件的许可证文件。',
  ].join('\r\n') + '\r\n');

  const revision = git('rev-parse', 'HEAD');
  const sourceModified = git('status', '--porcelain').length > 0;
  fs.writeFileSync(path.join(stage, 'release-build.json'), JSON.stringify({
    tag, sourceRepository: 'https://github.com/thejidex/MusicFreeDesktop',
    sourceBaseCommit: revision, sourceWorktreeModified: sourceModified,
    builtAt: new Date().toISOString(), platform: 'win32', arch: 'x64',
    appVersion: manifest.version,
  }, null, 2));
  const relativeFiles = filesUnder(stage);
  const forbidden = /(^|\/)(private-migration-backup|musicfree-plugin-storage|musicfree-plugins|musicfree-themepacks|lyric-cache|IndexedDB|Local Storage)(\/|$)/i;
  for (const relative of relativeFiles) {
    if (relative.startsWith('portable/') || forbidden.test(relative)) {
      throw new Error('Unexpected user data in runtime: ' + relative);
    }
  }

  const zipScript = path.join(work, 'zip.ps1');
  fs.writeFileSync(zipScript, [
    'param([string]$InputDirectory, [string]$OutputFile)',
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    '[System.IO.Compression.ZipFile]::CreateFromDirectory($InputDirectory, $OutputFile)',
  ].join('\r\n'));
  run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', zipScript, '-InputDirectory', stage, '-OutputFile', zipFile], { windowsHide: true });

  const payloadId = sha256(zipFile);
  const launcherSource = fs.readFileSync(path.join(__dirname, 'portable', 'Launcher.cs'), 'utf8')
    .replace('PACKAGE_ID_PLACEHOLDER', payloadId)
    .replace('FOLDER_NAME_PLACEHOLDER', 'MusicFree-' + tag)
    .replace(/PACKAGE_VERSION_PLACEHOLDER/g, manifest.version)
    .replace('RELEASE_TAG_PLACEHOLDER', tag);
  const launcherFile = path.join(work, 'Launcher.cs');
  fs.writeFileSync(launcherFile, '\ufeff' + launcherSource);
  const csc = path.join(process.env.WINDIR || 'C:\\Windows',
    'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  if (!fs.existsSync(csc)) throw new Error('.NET Framework C# compiler not found: ' + csc);
  run(csc, ['/nologo', '/target:winexe', '/platform:x64', '/optimize+',
    '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll',
    '/reference:System.IO.Compression.dll', '/reference:System.IO.Compression.FileSystem.dll',
    '/win32icon:' + path.join(stage, 'resources', 'res', 'logo.ico'),
    '/resource:' + zipFile + ',MusicFreePayload.zip', '/out:' + exeFile, launcherFile],
    { windowsHide: true });
  fs.writeFileSync(checksumFile,
    sha256(exeFile) + '  ' + path.basename(exeFile) + '\n' +
    payloadId + '  ' + path.basename(zipFile) + '\n');
  fs.writeFileSync(buildManifestFile, JSON.stringify({
    tag, appVersion: manifest.version, sourceBaseCommit: revision, sourceWorktreeModified: sourceModified,
    containsPersonalData: false, emptyPortable: true,
    assets: [exeFile, zipFile, checksumFile].map(file => path.basename(file)),
    files: Object.fromEntries(relativeFiles.map(relative => [relative, {
      bytes: fs.statSync(path.join(stage, relative)).size,
      sha256: sha256(path.join(stage, relative)),
    }])),
  }, null, 2));
  console.log(JSON.stringify({ output, exe: exeFile, zip: zipFile,
    buildManifest: buildManifestFile,
    sourceBaseCommit: revision, sourceWorktreeModified: sourceModified,
    files: relativeFiles.length, emptyPortable: true }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
