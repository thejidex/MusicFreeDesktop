# MusicFree Desktop · thejidex 改进版

[![GitHub Release](https://img.shields.io/github/v/release/thejidex/MusicFreeDesktop)](https://github.com/thejidex/MusicFreeDesktop/releases)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](./LICENSE)

基于 [猫头猫（maotoumao）的 MusicFreeDesktop](https://github.com/maotoumao/MusicFreeDesktop) 的个人 Fork，由 [thejidex](https://github.com/thejidex) 维护。保留原项目的插件化播放、歌单和主题功能，改进日常播放与歌曲管理体验。本仓库并非原作者的官方发行版。

**当前版本：v1.3**，基于 MusicFreeDesktop 0.0.8。便携包面向 **Windows x64**；其他平台源码保留，但本版本未验证其构建和运行。

[下载发布版](https://github.com/thejidex/MusicFreeDesktop/releases) · [反馈问题](https://github.com/thejidex/MusicFreeDesktop/issues) · [更新记录](./docs/changelog.md) · [上游仓库](https://github.com/maotoumao/MusicFreeDesktop)

## 本次更新

v1.3 增加歌曲列表和右侧播放队列的上下键选择：先左键选中一首歌，再按 `↑` 或 `↓` 按当前显示顺序选中上一首或下一首歌曲，列表自动滚动到选中项；到达首尾时停止。选择变化不会切歌，输入框和其他控件保持原有按键行为。

## v1.2 改进

v1.2 在 v1.1.1 的基础上增加以下功能：

| 功能 | 使用方式 |
| --- | --- |
| 隐藏左侧功能栏 | 点击左上角列表按钮隐藏或展开；也可在“设置 → 常规”勾选“隐藏左侧功能栏”。重启后保留选择。 |
| 精简关于页 | “关于 MusicFree”仅显示原作者 GitHub、thejidex GitHub、本仓库地址和当前版本。许可证及完整版权声明仍保留在程序文件中。 |
| 三种窗口状态 | 连续点击右上角方框按钮，按“普通窗口 → 最大化 → 真全屏 → 普通窗口”循环。真全屏隐藏 Windows 任务栏；`Esc` 也可退出真全屏。 |
| 本机播放次数 | “设置 → 常规 → 在歌单中显示播放次数”控制该列，默认隐藏。点击“播放次数”表头依次切换数值升序、降序、原顺序。 |

播放次数从此版本开始累计，**实际开始播放时计一次**；暂停继续、缓冲恢复、拖动进度、切换音质不重复计数，重新播放与单曲循环会增加次数，播放失败不计数。统计按原始音源和歌曲 ID 保存，同一首歌在不同歌单中共用次数，修改歌名或显示来源不会丢失统计。隐藏该列仍继续记录，重启后保留；不根据旧的“最近播放”记录推算历史次数。按列排序时暂停拖拽调整歌单顺序，取消排序后恢复。

## v1.1 系列改进

以下变化相对于本仓库此前的 [master 提交 68815fa](https://github.com/thejidex/MusicFreeDesktop/commit/68815fa8c662a0cdd7201a4835adc44b166f3caf)（2026-10-14，软件版本 0.0.8）。

| 功能 | v1.1.1 的行为 |
| --- | --- |
| 快速搜索 | `Ctrl+/` 聚焦顶部搜索框；在歌曲详情页使用时会返回主界面。 |
| 收藏快捷键 | `Z` 切换**当前播放歌曲**的“我喜欢”状态，再按一次取消收藏。长按只执行一次，快速多次按键依次处理。 |
| 编辑歌曲信息 | 在“我的歌单”中右键单首歌曲，选择“编辑歌曲信息”，可修改歌名、作者、专辑和显示的来源。 |
| 编辑快捷键 | 在“我的歌单”中**左键选中一首歌，再按 `Ctrl+Z`** 打开编辑窗口。选中的歌可以不是正在播放的歌；多选时不触发。在输入框中仍为正常撤销。 |
| 隐藏歌曲列 | 右上角齿轮 → 常规 → 歌曲列表隐藏列，可隐藏专辑、时长或来源，立即生效；隐藏来源也作用于右侧播放列表。 |
| 播放列表序号 | 右侧播放队列显示从 1 开始的歌曲序号，随队列顺序更新。 |
| 应用图标 | 应用、窗口、托盘和界面标志统一使用银色苹果图标。 |
| 发布方式 | 统一生成 Windows x64 自动解压 EXE、ZIP 和 SHA-256 校验文件；构建过程排除个人数据。 |

**编辑说明：** 按 Enter 或点击保存后，继续选中刚才编辑的歌曲并返回列表焦点，可接着使用上下键或 Ctrl+Z；即使改名导致排序位置变化，也会跟随同一首歌曲。编辑内容保存在本机，同一首歌在其他自建歌单中的信息也会更新，播放队列及最近播放同步显示。修改“来源”只改变显示名称，不改变插件、歌曲 ID 或实际播放音源，也不修改原始音频文件的标签。插件补全信息时会保留手动编辑的字段。

来源列隐藏在旧版已经存在；本次增加专辑选项，并修复设置立即生效及播放队列的来源显示。快捷键可在“设置 → 快捷键”中调整，已有自定义绑定会保留。

## 此前版本已具备的改进

这些功能延续自本仓库之前的 GitHub 版本：

- 改善进度条的显示、点击定位和拖动定位。
- 默认空格播放/暂停，左右方向键切换上一首、下一首；录制快捷键时避免误触发。
- 插件提供完整分集信息时，支持 B 站合集连续播放、累计时长和跨分集定位。
- 改善插件请求层的 HTTP/HTTPS 系统代理处理，保留手动代理优先级。
- 歌词缺失时自动匹配歌词，可在设置中关闭；桌面歌词支持一键左右居中。
- 简体中文界面下，主歌词与桌面歌词显示繁转简结果，保留原始歌词和时间戳。

## 下载与运行

在 [Releases](https://github.com/thejidex/MusicFreeDesktop/releases) 对应版本的 **Assets** 中下载，实际已发布的版本以该页面为准：

- `MusicFree-v1.3-win-x64.exe`：双击自动解压并启动，无需安装。
- `MusicFree-v1.3-win-x64.zip`：完整解压后运行其中的 `MusicFree.exe`。
- `SHA256SUMS-v1.3.txt`：用于核对下载文件的 SHA-256。

将 EXE 放在普通的可写文件夹。首次运行会在旁边生成 `MusicFree-v1.3` 文件夹，以后也可直接运行其中的 `MusicFree.exe`。**请保留整个程序文件夹**，其中的 `portable` 保存歌单、插件、主题、设置、播放次数、缓存和日志。歌曲默认下载到 `portable/downloads`，可在设置中更改。

发布包不预装第三方音源插件，也不包含个人歌单、账号或配置。安装插件后再搜索和播放，可参考 [MusicFree 文档](https://musicfree.catcat.work/) 与 [插件示例](https://github.com/maotoumao/MusicFreePlugins)。仓库随附供下载者使用的主题包，下载仓库后可按下方说明安装主题。

GitHub 自动生成的 `Source code` 附件是源码，需要构建后才能运行。分享程序时请发送原始 EXE 或 ZIP，避免分享包含自己数据的已使用程序目录。

### 使用仓库提供的主题

[MusicFree主题](./MusicFree主题) 是供下载者使用的仓库资源，包含 **8 款静态主题和 3 款动态主题**：

- [静态主题](./MusicFree主题/静态主题)：下载所需的 `.mftheme` 文件。
- [动态主题](./MusicFree主题/动态主题)：下载所需的 `.mftheme` 文件，包含动态背景。

在 MusicFree 的主题包页面安装本地 `.mftheme` 文件后选择应用，也可将文件拖入播放器；主题包无需解压。主题包格式沿用 [上游主题包](https://github.com/maotoumao/MusicFreeThemePacks)。

### 更新与沿用数据

本 Fork 的更新请从本仓库 Releases 获取。不同版本会生成独立程序目录，不会自动覆盖旧版本或迁移数据。

1. 退出新旧程序，并分别备份完整程序目录。
2. 解压新版，将旧版的整个 `portable` 复制到新版目录，替换同名目录。
3. 启动新版检查歌单和设置；如果主题或下载目录使用绝对路径，需在设置中重新选择。

请勿在程序运行时复制数据。上面的方式适用于已有 `portable` 目录的便携版；其他安装方式应先使用应用提供的歌单导出/备份功能。

## 使用限制

- 搜索、播放和歌词获取依赖相应服务及插件，代理优化不保证第三方接口始终可用。
- B 站合集功能要求插件返回完整有效的分集信息；明确指定单分集的歌曲仍按单分集播放。
- 缺失歌词自动匹配默认启用，会向网易云音乐或 LRCLIB 查询歌曲标题、歌手等信息，结果缓存在本机；可在歌词设置中关闭。
- 桌面歌词解锁后，在悬停工具栏选择“左右居中”，只调整当前显示器内的水平位置。
- 本地快捷键在应用内生效。需要系统级快捷键时，请在快捷键设置中另行配置。

## 从源码开发

安装 Node.js 和 npm，推荐 Node.js 22 或 24。在仓库根目录执行：

```bash
npm ci
npm start
```

检查类型及本次功能的回归用例：

```bash
npx tsc --noEmit
npm run test:shortcuts
npm run test:library
npm run test:playback-metadata
npm run test:play-counts
npm run test:music-list-navigation
```

`test:library` 和 `test:play-counts` 在隐藏的 Electron 窗口中使用 `out` 下的独立数据库，不会读取日常使用的歌单。后者覆盖播放次数持久化、并发递增、数值排序、播放事件去重和三种窗口状态的切换逻辑。

`test:music-list-navigation` 在隐藏的 Electron 窗口中挂载歌曲列表、播放队列和编辑窗口，检查点击聚焦、上下选择、首尾边界、排序、虚拟滚动及输入框和快捷键隔离，并验证 Enter 保存后继续选中原歌曲、恢复列表焦点。

## 构建和发布

在 **Windows x64** 环境安装依赖后执行：

```bash
npm run build:release
```

构建脚本从当前源码生成程序，当前标签为 `v1.3`。界面、发布文件名和 Git 标签统一使用 `x.x`，后续依次使用 `v1.4`、`v1.5` 等；npm 内部元数据使用 `x.x.0` 以兼容工具链，不作为对外版本名称。最终 EXE、ZIP 和校验文件位于根目录 `release/`；构建清单及临时文件位于 `out/` 和 `.webpack/`，避免混入交付目录。自动解压启动器使用 Windows 自带的 .NET Framework C# 编译器；原生依赖如需编译，还需对应的 C++ 构建工具。

同名发布文件存在时脚本会停止，以避免覆盖；更新版本时同步修改 `package.json`、`package-lock.json` 中的内部版本与 `release/version.json` 中的两段版本号。清理旧包前先检查是否仍需保留，尤其不要删除使用中的 `portable` 数据。上传 GitHub 前可删除本机的 `node_modules/`、`out/` 和 `.webpack/`，需要开发时执行 `npm ci` 即可重新生成依赖。

仓库中的手动 **Build** 工作流使用相同的构建命令生成 Windows 包，**Release** 工作流根据指定的构建运行创建草稿发布。发布标签必须指向生成该程序的源码提交。此版本的工作流尚需在 GitHub Actions 上实际运行验证。

**向 GitHub 提交源码，EXE、ZIP 和校验文件作为 Releases 附件上传。** 这些二进制文件、依赖、构建缓存、便携数据及本机工作记录均由 `.gitignore` 排除。

## 项目结构

```text
src/                    应用源码
res/                    图标、语言等运行资源
config/                 Forge、Webpack、ESLint 配置
docs/                   更新记录和第三方版权说明
docs/releases/          历史版本使用说明
MusicFree主题/          8 款静态主题、3 款动态主题（.mftheme）
scripts/build/          Windows 打包、启动器和版权收集
scripts/tests/          回归检查
release/                最新 EXE、ZIP、校验文件及版本说明
.github/                手动构建及草稿发布工作流
```

根目录只保留 README、许可证和 npm、TypeScript、Git 所需的入口文件。日常开发、检查和打包命令均从根目录执行；构建输出与个人便携数据不提交到 Git。

`release/` 保留当前版本的发布包、校验文件、使用说明和版本信息；历史版本使用说明归档在 [docs/releases](./docs/releases)。

## 出处与许可证

原作者：[猫头猫 / maotoumao](https://github.com/maotoumao)。本 Fork 保留原项目的 **GNU Affero General Public License v3**，完整条款见 [LICENSE](./LICENSE)。修改与再分发时请保留作者、源码出处及许可证，并按其条款提供对应源码。

发布包保留 MusicFree、Electron、Chromium 及运行依赖的版权文件，收集方式与补充声明见 [第三方版权说明](./docs/third-party-licenses/README.md)。银色苹果图标为本 Fork 的自定义资源，不代表 Apple 或原作者的官方发行或背书；该图标的权利归相应权利人所有。
