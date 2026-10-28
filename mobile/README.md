# MusicFree Mobile · thejidex

移动端从 [maotoumao/MusicFree](https://github.com/maotoumao/MusicFree) 的 React Native 工程移植，原始提交及许可见 [UPSTREAM.md](./UPSTREAM.md)。桌面端源码仍在仓库根目录。应用标识为 `io.github.thejidex.musicfree`，与上游应用的数据相互独立。

## 发布状态

首次移动端发行版本为 **v1.4**，内部 npm 版本为 `1.4.0`，按**移动移植预览**提供。构建结果、模拟器／真机验证范围和已知限制以 Release 附带的验证报告为准；构建脚本本身不代表设备功能已经验收。

## 手机操作

- 播放、搜索、插件、歌单、本地音乐、下载、最近播放和 WebDAV 延续移动端基础工程。
- 歌曲菜单 → 编辑歌曲信息：修改标题、作者、专辑及显示来源；保留实际插件与歌曲 ID，插件补全不覆盖本机修改。
- 长按歌曲进入选择模式。底部上、下按钮只改变选择；点击编辑或播放执行相应操作，完成退出选择。
- 设置 → 基础设置 → 歌曲列表与歌词：显示播放次数、隐藏专辑／来源／时长、歌词繁转简。播放次数实际开始播放时累计；歌单顶部可切换次数升序、降序及原顺序。
- 播放队列显示序号；编辑内容与隐藏来源设置作用于播放队列。歌词补全会向网易云或 LRCLIB 请求歌曲标题、歌手和时长，可以关闭自动搜索歌词。
- B 站合集需要插件返回完整分集及有效时长，保持一个队列项，连续播放并按累计时间定位。明确指定 `cid` 的歌曲仍只播放该分集。
- 设置 → 主题 → 安装 `.mftheme`：支持仓库的 8 款静态主题与 3 款动态主题。手机使用对应配色和背景，不依赖桌面 CSS 布局。主题包保存在各设备的应用沙箱中。
- 本地音乐菜单 → 从文件导入音乐：使用系统文件选择器复制到应用目录；原始音频文件不被修改。

## 平台对应关系

| 桌面行为 | Android / iOS |
| --- | --- |
| 快捷键、右键菜单、上下选择 | 屏幕按钮、歌曲菜单、长按选择；触摸操作不触发切歌 |
| 托盘、Windows 任务栏控制 | Android 通知栏；iOS 锁屏／控制中心和耳机媒体按键 |
| 普通／最大化／全屏窗口、可隐藏侧栏 | 手机系统窗口及可关闭的导航抽屉 |
| 桌面浮动歌词 | Android 悬浮歌词需授权；iOS 使用应用内歌词，不提供跨应用悬浮窗 |
| 桌面网络代理 | 使用手机系统的网络和代理设置 |
| 便携目录 | 系统应用沙箱；通过备份／恢复迁移歌单、编辑信息与播放次数 |

## 构建 Android

需要 Node.js 22、JDK 17、Android SDK 35 / Build Tools 35.0.0、NDK 26.1.10909125 与 CMake 3.22.1。设置 `ANDROID_HOME` 后：

```sh
npm ci --ignore-scripts
npm run typecheck
npm run test:library
npm run test:runtime
npm run build:android
```

发布构建必须提供固定的签名密钥，避免后续版本无法覆盖安装。通过环境变量提供 `MUSICFREE_ANDROID_KEYSTORE`、`MUSICFREE_ANDROID_STORE_PASSWORD`、`MUSICFREE_ANDROID_KEY_ALIAS`、`MUSICFREE_ANDROID_KEY_PASSWORD`；也可将 `MUSICFREE_ANDROID_SIGNING_FILE` 指向仓库外的 JSON，字段为 `storeFile`、`storePassword`、`keyAlias`、`keyPassword`。密钥与密码都不能提交 Git 或附在 Releases 中。

默认生成 `release/MusicFree-v1.4-android-arm64.apk` 和独立的 SHA-256 文件。安装时允许相应文件管理器安装来源不明应用。仅 arm64 架构，最低 Android 7.0。通过 `MUSICFREE_ANDROID_ARCH` 可另外构建 `armeabi-v7a` 或 `x86_64`。同名文件存在时脚本停止，防止覆盖既有交付。

## 构建 iOS

需要 macOS、Xcode、Node.js 22、Ruby、Bundler 和 CocoaPods；Windows 本机无法编译 iOS 原生程序。最低 iOS 15.1。

```sh
npm ci --ignore-scripts
bundle install
npm run build:ios
```

脚本以 `CODE_SIGNING_ALLOWED=NO` 构建真机 arm64 应用并生成 `release/MusicFree-v1.4-ios-unsigned.ipa`。无需发布者的 Apple 账号；**未签名 IPA 无法直接安装到普通 iPhone**，使用者需要自行签名。此交付不包含 TestFlight 或 App Store 上架。

仓库的 **Mobile** 工作流在 macOS 上执行同一脚本，成功后下载 `MusicFree-ios-unsigned` artifact。Android CI 产物明确标为未签名验证包，不能替代本机持久密钥签名的 APK。

## 发布前验收

在实际设备核对插件安装、搜索播放、暂停恢复、耳机／锁屏操作、后台播放、下载、文件导入、歌单备份恢复、编辑持久化、播放计数、合集跨分集及 11 个主题。需要记录构建来源提交、SHA-256、验证设备与未验证项。构建成功不代表设备功能全部通过。

所有版本保留原始作者署名与 AGPL-3.0 许可证，不预装任何音源插件或个人数据。
