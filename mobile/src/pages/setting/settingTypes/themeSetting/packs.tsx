import React, { useState } from "react";
import { Pressable, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import ThemeText from "@/components/base/themeText";
import { installThemePack } from "@/core/theme-packs";
import Toast from "@/utils/toast";

export default function ThemePacks() {
    const [busy, setBusy] = useState(false);
    async function install() {
        if (busy) return;
        try {
            const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
            if (result.canceled) return;
            setBusy(true);
            const name = await installThemePack(result.assets[0].uri);
            Toast.success(`已应用：${name}`);
        } catch (error: any) {
            Toast.warn(`主题安装失败：${error.message}`); 
        } finally {
            setBusy(false); 
        }
    }
    return <View style={{ padding: 16, gap: 12 }}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={install}><ThemeText>{busy ? "正在安装主题…" : "安装 .mftheme 主题包"}</ThemeText></Pressable>
        <ThemeText fontSize="description">支持仓库提供的 8 款静态主题和 3 款动态主题。手机界面使用主题配色和背景。</ThemeText>
    </View>;
}
