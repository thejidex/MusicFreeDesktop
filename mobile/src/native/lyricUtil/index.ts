import Config from "@/core/appConfig";
import Toast from "@/utils/toast";
import { NativeModule, NativeModules } from "react-native";
import { errorLog } from "@/utils/log.ts";
import { displayLyric } from "@/utils/lyric-display";

export enum NativeTextAlignment {
    // 左对齐
    LEFT = 3,
    // 右对齐
    RIGHT = 5,
    // 居中
    CENTER = 17,
}

// 状态栏歌词的工具
interface ILyricUtil extends NativeModule {
    /** 显示状态栏歌词 */
    showStatusBarLyric: (
        initLyric?: string,
        config?: Record<string, any>,
    ) => Promise<void>;
    /** 隐藏状态栏歌词 */
    hideStatusBarLyric: () => Promise<void>;
    /** 设置歌词文本 */
    setStatusBarLyricText: (lyric: string) => Promise<void>;
    /** 设置距离顶部的距离 */
    setStatusBarLyricTop: (percent: number) => Promise<void>;
    /** 设置距离左部的距离 */
    setStatusBarLyricLeft: (percent: number) => Promise<void>;
    /** 设置宽度 */
    setStatusBarLyricWidth: (percent: number) => Promise<void>;
    /** 设置字体 */
    setStatusBarLyricFontSize: (fontSize: number) => Promise<void>;
    /** 设置对齐 */
    setStatusBarLyricAlign: (alignment: NativeTextAlignment) => Promise<void>;
    /** 设置颜色 */
    setStatusBarColors: (
        textColor: string | null,
        backgroundColor: string | null,
    ) => Promise<void>;
    /** 检查权限 */
    checkSystemAlertPermission: () => Promise<boolean>;
    /** 请求悬浮窗 */
    requestSystemAlertPermission: () => Promise<boolean>;
}

// iOS has no public API for Android-style cross-application lyric windows.
const LyricUtil: ILyricUtil = NativeModules.LyricUtil ?? {
    showStatusBarLyric: async () => {
        throw new Error("iOS 不支持跨应用悬浮歌词，请使用应用内歌词"); 
    },
    hideStatusBarLyric: async () => {},
    setStatusBarLyricText: async () => {},
    setStatusBarLyricTop: async () => {},
    setStatusBarLyricLeft: async () => {},
    setStatusBarLyricWidth: async () => {},
    setStatusBarLyricFontSize: async () => {},
    setStatusBarLyricAlign: async () => {},
    setStatusBarColors: async () => {},
    checkSystemAlertPermission: async () => false,
    requestSystemAlertPermission: async () => false,
};

const originalShowStatusBarLyric = LyricUtil.showStatusBarLyric;
const originalSetText = LyricUtil.setStatusBarLyricText;
LyricUtil.setStatusBarLyricText = text => originalSetText(
    displayLyric(text, Config.getConfig("lyric.simplifiedChinese") ?? true) ?? "",
);

const showStatusBarLyric: ILyricUtil["showStatusBarLyric"] = async (
    initLyric,
    config,
) => {
    try {
        await originalShowStatusBarLyric(initLyric, config);
    } catch (e) {
        errorLog("状态栏歌词开启失败", e);
        Toast.warn("状态栏歌词开启失败，请到手机系统设置打开悬浮窗权限");
        Config.setConfig("lyric.showStatusBarLyric", false);
    }
};

LyricUtil.showStatusBarLyric = showStatusBarLyric;

export default LyricUtil;
