import AppBar from "@/components/base/appBar";
import ThemeText from "@/components/base/themeText";
import Backup from "@/core/backup";
import { useParams } from "@/core/router";
import {
    cancelExchangeAttachmentDownloads,
    finishMobileExchangeSession,
    getMobileExchangePreview,
    removeMobileExchangePreview,
} from "@/core/playlistExchange";
import type { MobileImportOptions, MobileImportPreview, PlaylistImportDecision } from "@/core/playlistExchange";
import useColors from "@/hooks/useColors";
import Toast from "@/utils/toast";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";

type ImportAction = PlaylistImportDecision["action"];

export default function PlaylistExchangePreview() {
    const { previewId } = useParams<"playlist-exchange-preview">();
    const navigation = useNavigation<any>();
    const colors = useColors();
    const preview = useMemo(() => getMobileExchangePreview(previewId), [previewId]);
    const [installMissing, setInstallMissing] = useState(false);
    const [useSourceEdits, setUseSourceEdits] = useState(false);
    const [useSourceCounts, setUseSourceCounts] = useState(false);
    const [working, setWorking] = useState(false);
    const [attachmentProgress, setAttachmentProgress] = useState<{ received: number; total: number; filename: string }>();
    const [actions, setActions] = useState<Record<string, ImportAction>>(() =>
        Object.fromEntries((preview?.matchedPlaylists || []).map(item => [item.sourceSheetId, "merge"])),
    );

    useEffect(() => navigation.addListener("beforeRemove", () => {
        cancelExchangeAttachmentDownloads();
        if (preview) {
            void finishMobileExchangeSession(preview);
            removeMobileExchangePreview(previewId);
        }
    }), [navigation, preview, previewId]);

    if (!preview) {
        return (
            <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]}>
                <AppBar>导入预览</AppBar>
                <View style={styles.empty}>
                    <ThemeText>预览已失效，请重新选择文件或连接电脑。</ThemeText>
                </View>
            </SafeAreaView>
        );
    }
    const activePreview = preview as MobileImportPreview;

    const matchedById = new Map(activePreview.matchedPlaylists.map(item => [item.sourceSheetId, item]));
    const actionLabel: Record<ImportAction, string> = {
        create: "新建副本",
        merge: "合并",
        replace: "覆盖此歌单",
    };
    const buttonStyle = (active: boolean) => [
        styles.choice,
        { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? `${colors.primary}20` : colors.background },
    ];

    async function onImport() {
        if (working) return;
        setWorking(true);
        try {
            const decisions: Record<string, PlaylistImportDecision> = {};
            for (const playlist of activePreview.document.playlists) {
                const match = matchedById.get(playlist.sourceSheetId);
                const action = actions[playlist.sourceSheetId] || (match ? "merge" : "create");
                decisions[playlist.sourceSheetId] = {
                    action,
                    ...(match ? { targetSheetId: match.targetSheetId } : {}),
                };
            }
            const options: MobileImportOptions = {
                decisions,
                metadataConflict: useSourceEdits ? "use-source" : "keep-device",
                playCount: useSourceCounts ? "use-source" : "keep-device",
                installMissingPlugins: installMissing,
                onAttachmentProgress: setAttachmentProgress,
            };
            const result = await Backup.importExchange(activePreview, options);
            removeMobileExchangePreview(previewId);
            if (result.warnings.length) {
                Toast.warn(`歌单已导入。${result.warnings.join("；")}`);
            } else {
                Toast.success(`已导入 ${result.imported.length} 个歌单`);
            }
            navigation.goBack();
        } catch (error: any) {
            Toast.warn(`导入失败：${error?.message || error}`);
        } finally {
            setWorking(false);
            setAttachmentProgress(undefined);
        }
    }

    return (
        <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]}>
            <AppBar>检查并导入歌单</AppBar>
            <ScrollView contentContainerStyle={styles.content}>
                {activePreview.legacy && (
                    <View style={[styles.notice, { borderColor: colors.primary }]}>
                        <ThemeText>{activePreview.warnings.join("\n")}</ThemeText>
                    </View>
                )}

                <View style={[styles.card, { borderColor: colors.border }]}>
                    <ThemeText fontWeight="bold">来源</ThemeText>
                    <ThemeText>{`${activePreview.document.sourceDevice.platform} · ${activePreview.document.sourceDevice.appVersion}`}</ThemeText>
                    <ThemeText fontSize="subTitle">{`${activePreview.document.playlists.length} 个歌单 · ${activePreview.document.playlists.reduce((sum, item) => sum + item.tracks.length, 0)} 首歌曲`}</ThemeText>
                </View>

                <View style={[styles.card, { borderColor: colors.border }]}>
                    <ThemeText fontWeight="bold">歌单预览</ThemeText>
                    {activePreview.document.playlists.map(playlist => {
                        const match = matchedById.get(playlist.sourceSheetId);
                        const needsFiles = playlist.tracks.filter(track => track.localAudio?.needsFile &&
                            (!track.localAudio?.attachmentId || !activePreview.remoteBaseUrl)).length;
                        return (
                            <View key={`${playlist.sourceSheetId}:${playlist.order}`} style={[styles.playlist, { borderTopColor: colors.border }]}>
                                <ThemeText fontWeight="bold">{playlist.title}{playlist.isFavorite ? "（映射到我喜欢）" : ""}</ThemeText>
                                <ThemeText fontSize="subTitle">{`${playlist.tracks.length} 首${playlist.isStarred ? " · 已收藏" : ""}${needsFiles ? ` · ${needsFiles} 首本地歌曲需要补充文件` : ""}`}</ThemeText>
                                {playlist.tracks.slice(0, 5).map((track, index) => (
                                    <ThemeText key={`${track.source.platform}:${track.source.id}:${index}`} fontSize="subTitle">
                                        {`${index + 1}. ${track.metadata.title || "未知歌曲"} — ${track.metadata.artist || "未知歌手"}`}
                                    </ThemeText>
                                ))}
                                {playlist.tracks.length > 5 && <ThemeText fontSize="subTitle">{`还有 ${playlist.tracks.length - 5} 首…`}</ThemeText>}
                                {match && (
                                    <View style={styles.choices}>
                                        {((playlist.isFavorite ? ["merge", "replace"] : ["merge", "replace", "create"]) as ImportAction[]).map(action => (
                                            <Pressable
                                                key={action}
                                                onPress={() => setActions(value => ({ ...value, [playlist.sourceSheetId]: action }))}
                                                style={buttonStyle((actions[playlist.sourceSheetId] || "merge") === action)}
                                            >
                                                <ThemeText fontSize="subTitle">{actionLabel[action]}</ThemeText>
                                            </Pressable>
                                        ))}
                                    </View>
                                )}
                                {!match && <ThemeText fontSize="subTitle">首次导入将新建歌单；同名歌单不会自动合并。</ThemeText>}
                            </View>
                        );
                    })}
                </View>

                {activePreview.document.attachments.length > 0 && (
                    <View style={[styles.card, { borderColor: colors.border }]}>
                        <ThemeText fontWeight="bold">本地音频</ThemeText>
                        {activePreview.remoteBaseUrl ? (
                            <ThemeText>{`${activePreview.document.attachments.length} 个文件 · ${(activePreview.document.attachments.reduce((sum, item) => sum + item.size, 0) / 1024 / 1024).toFixed(1)} MB，确认后校验并保存到手机`}</ThemeText>
                        ) : (
                            <ThemeText>当前文件只包含本地音频清单，没有附带音频数据；对应歌曲会标记为“需要补充本地文件”。</ThemeText>
                        )}
                        {attachmentProgress && (
                            <View style={styles.progressRow}>
                                <ActivityIndicator color={colors.primary} />
                                <ThemeText>{`${attachmentProgress.filename} · ${(attachmentProgress.received / 1024 / 1024).toFixed(1)} / ${(attachmentProgress.total / 1024 / 1024).toFixed(1)} MB`}</ThemeText>
                                <Pressable onPress={cancelExchangeAttachmentDownloads}>
                                    <ThemeText style={{ color: colors.notification }}>取消传输</ThemeText>
                                </Pressable>
                            </View>
                        )}
                    </View>
                )}

                <View style={[styles.card, { borderColor: colors.border }]}>
                    <ThemeText fontWeight="bold">所需插件</ThemeText>
                    {activePreview.document.plugins.length === 0 && <ThemeText fontSize="subTitle">文件没有记录所需插件。</ThemeText>}
                    {activePreview.document.plugins.map(plugin => {
                        const state = activePreview.missingPlugins.find(item => item.plugin.id === plugin.id);
                        return (
                            <ThemeText key={plugin.id} fontSize="subTitle">
                                {`${plugin.id}${plugin.version ? ` v${plugin.version}` : ""}${state ? state.installed ? " · 已安装但未启用" : " · 缺失" : " · 已启用"}`}
                            </ThemeText>
                        );
                    })}
                    {activePreview.missingPlugins.length > 0 && (
                        <Pressable style={styles.toggleRow} onPress={() => setInstallMissing(value => !value)}>
                            <View style={[styles.check, { borderColor: installMissing ? colors.primary : colors.border, backgroundColor: installMissing ? colors.primary : "transparent" }]}>
                                {installMissing ? <ThemeText>✓</ThemeText> : null}
                            </View>
                            <ThemeText>确认后批量安装缺失插件；安装失败时仍保留歌单</ThemeText>
                        </Pressable>
                    )}
                </View>

                <View style={[styles.card, { borderColor: colors.border }]}>
                    <ThemeText fontWeight="bold">冲突处理</ThemeText>
                    <Pressable style={styles.toggleRow} onPress={() => setUseSourceEdits(value => !value)}>
                        <View style={[styles.check, { borderColor: useSourceEdits ? colors.primary : colors.border, backgroundColor: useSourceEdits ? colors.primary : "transparent" }]}>
                            {useSourceEdits ? <ThemeText>✓</ThemeText> : null}
                        </View>
                        <ThemeText>冲突时采用来源设备的手动编辑（默认保留手机编辑）</ThemeText>
                    </Pressable>
                    <Pressable style={styles.toggleRow} onPress={() => setUseSourceCounts(value => !value)}>
                        <View style={[styles.check, { borderColor: useSourceCounts ? colors.primary : colors.border, backgroundColor: useSourceCounts ? colors.primary : "transparent" }]}>
                            {useSourceCounts ? <ThemeText>✓</ThemeText> : null}
                        </View>
                        <ThemeText>迁移来源设备播放次数（默认保留手机统计）</ThemeText>
                    </Pressable>
                </View>

                <Pressable
                    disabled={working}
                    onPress={onImport}
                    style={[styles.importButton, { backgroundColor: colors.primary, opacity: working ? 0.7 : 1 }]}
                >
                    {working ? <ActivityIndicator color={colors.background} /> : <ThemeText color={colors.background} fontWeight="bold">确认导入</ThemeText>}
                </Pressable>
                <Pressable onPress={() => {
                    cancelExchangeAttachmentDownloads();
                    void finishMobileExchangeSession(activePreview);
                    removeMobileExchangePreview(previewId);
                    navigation.goBack();
                }} style={styles.cancelButton}>
                    <ThemeText>取消</ThemeText>
                </Pressable>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    page: { flex: 1 },
    content: { padding: 16, paddingBottom: 36, gap: 12 },
    card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14, gap: 8 },
    playlist: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 4, gap: 6 },
    choices: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
    choice: { borderWidth: 1, borderRadius: 18, paddingVertical: 7, paddingHorizontal: 11 },
    notice: { borderWidth: 1, borderRadius: 10, padding: 12 },
    toggleRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 5 },
    check: { width: 22, height: 22, borderWidth: 1, borderRadius: 5, alignItems: "center", justifyContent: "center" },
    importButton: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 6 },
    cancelButton: { minHeight: 42, alignItems: "center", justifyContent: "center" },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    progressRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
});
