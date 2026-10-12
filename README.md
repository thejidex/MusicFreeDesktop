# MusicFree Desktop · thejidex 个人改进版

[![GitHub Release](https://img.shields.io/github/v/release/thejidex/MusicFreeDesktop)](https://github.com/thejidex/MusicFreeDesktop/releases)
[![GitHub Downloads](https://img.shields.io/github/downloads/thejidex/MusicFreeDesktop/total)](https://github.com/thejidex/MusicFreeDesktop/releases)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](./LICENSE)

基于 [猫头猫（maotoumao）](https://github.com/maotoumao) 开发的 [MusicFreeDesktop](https://github.com/maotoumao/MusicFreeDesktop) 的个人改进版本，由 [thejidex](https://github.com/thejidex) 整理维护。感谢原作者及项目贡献者提供的音乐播放器。

本分支基于上游 **master / 0.0.8**，主要改善播放控制、B 站合集播放、网络请求和歌词体验。这是个人 Fork，**并非原作者的官方发布**；原项目及其后续开发进度请查看上游仓库。

**[下载改进版](https://github.com/thejidex/MusicFreeDesktop/releases) · [查看原仓库](https://github.com/maotoumao/MusicFreeDesktop) · [反馈本版本问题](https://github.com/thejidex/MusicFreeDesktop/issues) · [贡献方向讨论](https://github.com/maotoumao/MusicFreeDesktop/issues/446)**

## 六项改进

| 改进 | 本版本的行为 |
| --- | --- |
| 进度条 | 调整细轨道、悬停和拖动状态，改善暂停标记、点击定位与拖动定位。 |
| 默认本地快捷键 | 空格播放/暂停，左方向键切上一首，右方向键切下一首；保留已有自定义配置，录制快捷键时避免误触发播放。 |
| B 站多分集音乐合集 | 在插件提供完整分集信息时连续播放后续分集，显示合集累计时长，支持跨分集定位。 |
| 搜索与网络请求 | 改善核心插件请求层的 HTTP/HTTPS 系统代理处理，保留手动代理优先级，缓解连接或代理配置导致的搜索失败。 |
| 歌词与桌面歌词 | 歌词缺失时提供可关闭的匹配功能，改善空歌词与切歌时的显示；桌面歌词工具栏增加一键左右居中，保持上下位置、窗口大小和字体大小，并保存位置。 |
| 简体歌词显示 | 简体中文界面下，主歌词与桌面歌词共用繁转简显示；保留原始歌词和时间戳，切换界面语言可以恢复原文。 |

这些改动已在 Windows 本地进行验证；尚未适配上游重构后的 dev。向上游贡献的范围和实现方式将按维护者的反馈另行整理。

## 下载与运行

打开本仓库的 [Releases](https://github.com/thejidex/MusicFreeDesktop/releases)，在相应版本的 **Assets** 中下载：

- `MusicFree-<发布标签>-win-x64.exe`：推荐。双击后自动解压并启动，无需另外安装 MusicFree。
- `MusicFree-<发布标签>-win-x64.zip`：手动解压整个压缩包，再运行其中的 `MusicFree.exe`。

`Source code (zip)` 和 `Source code (tar.gz)` 是源码，需要构建后使用，不是可直接运行的程序。实际可下载的版本和附件以 Releases 页面为准。

当前发布准备面向 **Windows x64**，在 Windows 11 上验证。原项目支持其他平台，但本 Fork 尚未提供经过验证的 macOS、Linux 或 Windows ARM64 程序包。

### 自动解压 EXE

1. 将下载的 EXE 放在有足够空间的可写文件夹，例如 D 盘的普通文件夹。
2. 首次双击会在旁边生成 `MusicFree-<发布标签>` 程序文件夹，然后启动。
3. 以后可双击原 EXE，或进入生成的文件夹运行 `MusicFree.exe`。
4. 在程序中自行安装音源插件，再进行搜索和播放。

应用配置、歌单、搜索记录、插件、主题、缓存和日志保存在生成的程序文件夹内的 `portable` 目录。便携包首次启动的歌曲下载目录为 `portable/downloads`，也可在设置中改到其他位置。需要移动整个程序时，请一起移动完整程序文件夹。

发布包从当前源码重新构建，**不包含维护者的个人歌单、搜索历史、主题包、插件、登录信息和配置**。再次分享时请发送下载到的原始 EXE 或 ZIP；已经使用过的程序文件夹中会有你自己的数据。

不同发布标签会生成不同程序文件夹，不会自动覆盖旧版本或迁移其数据。便携版首次启动关闭官方更新检查；本 Fork 的更新请从本仓库 Releases 获取。

## 使用说明与限制

- MusicFree 是插件化播放器，本发布包不预装第三方音源插件。插件安装和开发请参考 [原项目文档](https://musicfree.catcat.work/) 与 [示例插件仓库](https://github.com/maotoumao/MusicFreePlugins)。
- 系统代理优化针对应用的连接和代理处理，不保证所有第三方插件接口都正常。快手插件在当前验证中仍返回空结果。
- B 站合集连续播放需要插件返回完整且有效的分集信息；明确指定单个分集的歌曲仍按单分集播放。
- 可靠歌词无法匹配时仍可能没有歌词。自动匹配缺失歌词默认启用，可在歌词设置中关闭。
- **网络行为**：插件搜索、播放和获取歌词需要访问相应服务；自动匹配缺失歌词时，会将歌曲标题、歌手等匹配信息发送给网易云音乐或 LRCLIB。匹配结果缓存到本地。
- **桌面歌词左右居中**：启用桌面歌词并解锁后，在悬停工具栏点击“左右居中”；以窗口当前所在显示器的工作区为准，只执行一次位置调整。
- 快捷键属于应用内的本地快捷键；已有配置不会被强制覆盖，可在快捷键设置中查看和调整。

## 从源码启动

安装 Node.js 和 npm，在仓库根目录执行：

```bash
npm ci
npm start
```

## 构建 Windows 便携包

在 Windows x64 环境下执行：

```bash
node scripts/build-portable.cjs --tag v0.0.8-thejidex.1
```

脚本调用 Electron Forge 构建当前源码，再生成自动解压 EXE、ZIP 和 SHA-256 校验文件。默认输出位于 `out/releases/<发布标签>`；可通过 `--output` 指定其他目录。

```bash
node scripts/build-portable.cjs --tag v0.0.8-thejidex.1 --output D:\CodexTemp\MusicFree-release
```

自动解压启动器的源码位于 [scripts/portable/Launcher.cs](./scripts/portable/Launcher.cs)，便携数据路径初始化位于 [scripts/portable/portable-init.cjs](./scripts/portable/portable-init.cjs)。构建需要 Windows 的 .NET Framework C# 编译器；原生依赖如果需要重新编译，请按构建报错安装相应工具。

发布时请将标签指向包含对应代码和打包脚本的提交，以便下载者找到对应源码。个人数据目录和构建输出不应提交到 Git。

## 主题与截图

主题包格式沿用原项目，可参考 [上游 README](https://github.com/maotoumao/MusicFreeDesktop#主题包) 和 [主题包示例](https://github.com/maotoumao/MusicFreeThemePacks)。

下面是原项目的界面示例，具体界面以本版本实际运行结果为准：

![MusicFree 原项目界面示例](./.imgs/screenshot.png)

## 原作者、出处与许可证

- 原作者：[猫头猫 / maotoumao](https://github.com/maotoumao)。
- 原桌面端仓库：[maotoumao/MusicFreeDesktop](https://github.com/maotoumao/MusicFreeDesktop)。
- MusicFree 项目：[maotoumao/MusicFree](https://github.com/maotoumao/MusicFree)。
- 本 Fork：[thejidex/MusicFreeDesktop](https://github.com/thejidex/MusicFreeDesktop)。

本项目保留原仓库的 **GNU Affero General Public License v3**，完整条款见 [LICENSE](./LICENSE)。请遵守许可证及原项目使用说明，并保留原作者与代码出处。发布包同时保留 MusicFree 和第三方组件的许可证文件。

如果这个项目对你有帮助，欢迎先给 [原项目](https://github.com/maotoumao/MusicFreeDesktop) 点 Star，支持原作者与贡献者。
