import AppBar from "@/components/base/appBar";
import ThemeText from "@/components/base/themeText";
import Backup from "@/core/backup";
import { ROUTE_PATH, useNavigate } from "@/core/router";
import useColors from "@/hooks/useColors";
import { useIsFocused } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { nanoid } from "nanoid";
import React, { useRef, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import RNFS, { CachesDirectoryPath, downloadFile, stopDownload } from "react-native-fs";
import { SafeAreaView } from "react-native-safe-area-context";
import { errorLog } from "@/utils/log";

const MAX_TRANSFER_BYTES = 64 * 1024 * 1024;

function isPrivateIPv4(host: string) {
    const parts = host.split(".").map(Number);
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    const [a, b] = parts;
    return a === 10 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31 || a === 169 && b === 254;
}

function validateShareUrl(input: string) {
    let url: URL;
    try {
        url = new URL(input.trim());
    } catch {
        throw new Error("请粘贴电脑端显示的完整连接地址");
    }
    const isPrivateHost = isPrivateIPv4(url.hostname) || url.hostname.toLowerCase().endsWith(".local");
    if (url.protocol !== "http:" || !isPrivateHost || url.username || url.password ||
        !/^\/v1\/[a-f0-9]{64}$/i.test(url.pathname) || url.search || url.hash) {
        throw new Error("连接地址无效；请使用电脑端二维码或复制的局域网连接");
    }
    return url.toString();
}

export default function PlaylistExchangeReceive() {
    const colors = useColors();
    const navigate = useNavigate();
    const navigation = useNavigation<any>();
    const focused = useIsFocused();
    const [permission, requestPermission] = useCameraPermissions();
    const [address, setAddress] = useState("");
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState<{ received: number; total: number }>();
    const [error, setError] = useState("");
    const scanLock = useRef(false);
    const downloadTask = useRef<{ jobId: number } | undefined>(undefined);
    const abortRef = useRef(false);

    async function receive(input: string) {
        if (busy || scanLock.current) return;
        scanLock.current = true;
        abortRef.current = false;
        setBusy(true);
        setError("");
        const target = `${CachesDirectoryPath}/MusicFreeExchange-${nanoid()}.json`;
        let sessionUrl: string | undefined;
        let transferredToPreview = false;
        try {
            const url = validateShareUrl(input);
            sessionUrl = url;
            const task = downloadFile({
                fromUrl: url,
                toFile: target,
                background: false,
                progressInterval: 200,
                progress: event => {
                    if (event.contentLength > MAX_TRANSFER_BYTES) {
                        abortRef.current = true;
                        if (downloadTask.current) stopDownload(downloadTask.current.jobId);
                        setError("分享内容超过 64 MB，请使用文件导出。");
                        return;
                    }
                    setProgress({ received: event.bytesWritten, total: event.contentLength });
                },
            });
            downloadTask.current = { jobId: task.jobId };
            const response = await task.promise;
            downloadTask.current = undefined;
            if (abortRef.current) throw new Error("接收已取消或文件过大");
            if (response.statusCode !== 200) throw new Error(`电脑传输服务返回 ${response.statusCode}`);
            if (response.bytesWritten > MAX_TRANSFER_BYTES) throw new Error("分享内容超过 64 MB，请使用文件导出");
            const raw = await RNFS.readFile(target, "utf8");
            const preview = Backup.previewExchange(raw);
            const previewId = Backup.saveExchangePreview(preview, url);
            transferredToPreview = true;
            navigate(ROUTE_PATH.PLAYLIST_EXCHANGE_PREVIEW, { previewId });
        } catch (exception: any) {
            if (sessionUrl && !transferredToPreview) {
                void fetch(`${sessionUrl}/complete`, { method: "POST" }).catch(() => {});
            }
            if (!abortRef.current) {
                const reason = exception?.message || String(exception);
                setError(`${reason}。请确认两台设备连接同一局域网并检查电脑防火墙；也可取消后改用歌单文件。`);
                errorLog("局域网歌单接收失败", exception);
            }
        } finally {
            downloadTask.current = undefined;
            try { if (await RNFS.exists(target)) await RNFS.unlink(target); } catch { /* temporary cache cleanup */ }
            setBusy(false);
            setProgress(undefined);
            scanLock.current = false;
        }
    }

    function cancel() {
        abortRef.current = true;
        if (downloadTask.current) stopDownload(downloadTask.current.jobId);
    }

    const progressText = progress?.total
        ? `${(progress.received / 1024 / 1024).toFixed(1)} / ${(progress.total / 1024 / 1024).toFixed(1)} MB`
        : progress ? `${(progress.received / 1024 / 1024).toFixed(1)} MB` : "";

    return (
        <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]}>
            <AppBar>从电脑接收歌单</AppBar>
            <View style={styles.content}>
                {permission?.granted && focused ? (
                    <View style={styles.cameraFrame}>
                        <CameraView
                            style={StyleSheet.absoluteFill}
                            facing="back"
                            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                            onBarcodeScanned={event => {
                                if (!scanLock.current) {
                                    setAddress(event.data);
                                    void receive(event.data);
                                }
                            }}
                        />
                        <View pointerEvents="none" style={styles.scanOverlay}>
                            <View style={[styles.scanBox, { borderColor: colors.primary }]} />
                        </View>
                    </View>
                ) : (
                    <View style={[styles.cameraUnavailable, { borderColor: colors.border }]}>
                        <ThemeText>允许相机权限后可直接扫描电脑二维码；也可以在下方粘贴连接地址。</ThemeText>
                        {permission && !permission.granted && (
                            <Pressable style={[styles.secondaryButton, { borderColor: colors.border }]} onPress={requestPermission}>
                                <ThemeText>请求相机权限</ThemeText>
                            </Pressable>
                        )}
                    </View>
                )}

                <ThemeText fontWeight="bold">备用方式：粘贴连接地址</ThemeText>
                <TextInput
                    value={address}
                    onChangeText={setAddress}
                    editable={!busy}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    placeholder="http://192.168.x.x:端口/v1/会话令牌"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                />
                {error ? <ThemeText style={{ color: colors.notification }}>{error}</ThemeText> : null}
                {busy && (
                    <View style={styles.progressRow}>
                        <ActivityIndicator color={colors.primary} />
                        <ThemeText>{progressText ? `正在接收：${progressText}` : "正在连接电脑…"}</ThemeText>
                        <Pressable onPress={cancel}><ThemeText style={{ color: colors.notification }}>取消</ThemeText></Pressable>
                    </View>
                )}
                <View style={styles.actions}>
                    <Pressable style={[styles.secondaryButton, { borderColor: colors.border }]} onPress={() => navigation.goBack()}>
                        <ThemeText>返回</ThemeText>
                    </Pressable>
                    <Pressable
                        disabled={busy || !address.trim()}
                        style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: busy || !address.trim() ? 0.55 : 1 }]}
                        onPress={() => void receive(address)}
                    >
                        <ThemeText color={colors.background} fontWeight="bold">{busy ? "正在接收…" : "连接并预览"}</ThemeText>
                    </Pressable>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    page: { flex: 1 },
    content: { flex: 1, padding: 16, gap: 12 },
    cameraFrame: { height: 300, borderRadius: 14, overflow: "hidden", backgroundColor: "#111" },
    cameraUnavailable: { height: 150, borderWidth: 1, borderRadius: 14, padding: 16, alignItems: "center", justifyContent: "center", gap: 12 },
    scanOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
    scanBox: { width: 210, height: 210, borderWidth: 3, borderRadius: 14 },
    input: { minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: "auto" },
    secondaryButton: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
    primaryButton: { minHeight: 44, borderRadius: 10, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
    progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
});
