import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import Base from "../Base";
import { hideModal } from "../..";
import MusicSheet, { defaultSheet } from "@/renderer/core/music-sheet";
import { createDesktopExchangePayload } from "@/renderer/core/playlist-exchange";
import { startPlaylistShare, stopPlaylistShare, type ShareSession } from "@/renderer/core/playlist-exchange/transport";
import "./index.scss";

interface Props {
    initialSheetId?: string;
}

export default function SendToPhone({ initialSheetId }: Props) {
    const sheets = MusicSheet.frontend.useAllSheets();
    const [selected, setSelected] = useState<string[]>(initialSheetId ? [initialSheetId] : []);
    const [session, setSession] = useState<ShareSession>();
    const [selectedUrl, setSelectedUrl] = useState("");
    const [qrData, setQrData] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [includeLocalAudio, setIncludeLocalAudio] = useState(false);
    const sheetLabels = useMemo(() => sheets.map(sheet => ({
        id: sheet.id,
        title: sheet.id === defaultSheet.id ? "我喜欢" : (sheet.title || "未命名歌单"),
    })), [sheets]);

    useEffect(() => {
        if (!session || !selectedUrl) {
            setQrData("");
            return;
        }
        QRCode.toDataURL(selectedUrl, { width: 280, margin: 2, errorCorrectionLevel: "M" })
            .then(setQrData)
            .catch(() => setError("二维码生成失败，请复制连接地址到手机接收页面。"));
    }, [session, selectedUrl]);

    useEffect(() => () => {
        if (session) void stopPlaylistShare(session.id);
    }, [session]);

    function close() {
        if (session) void stopPlaylistShare(session.id);
        setSession(undefined);
        hideModal();
    }

    async function start() {
        if (!selected.length || busy) return;
        setBusy(true);
        setError("");
        try {
            const payload = await createDesktopExchangePayload(selected, includeLocalAudio);
            const nextSession = await startPlaylistShare(payload);
            setSession(nextSession);
            setSelectedUrl(nextSession.urls[0] || "");
            if (payload.missingLocalFiles) {
                setError(`${payload.missingLocalFiles} 首本地歌曲没有可读取的文件路径；这些歌曲仍会导入为“需要补充本地文件”。`);
            }
        } catch (exception: any) {
            setError(`${exception?.message || exception}。请检查网络、防火墙，或使用文件导出。`);
        } finally {
            setBusy(false);
        }
    }

    async function copyUrl() {
        try {
            await navigator.clipboard.writeText(selectedUrl);
            setError("连接地址已复制；在手机“从电脑接收”中粘贴即可。");
        } catch {
            setError("无法访问剪贴板，请手动复制连接地址。");
        }
    }

    return (
        <Base withBlur={false} onDefaultClick={close}>
            <div className="modal--send-to-phone shadow backdrop-color">
                <Base.Header>发送歌单到手机</Base.Header>
                {!session ? (
                    <>
                        <div className="send-to-phone--tip">选择要发送的歌单。手机和电脑连接同一路由器即可，电脑使用网线、手机使用 Wi-Fi 也可以。</div>
                        <div className="send-to-phone--toolbar">
                            <button onClick={() => setSelected(sheetLabels.map(sheet => sheet.id))}>全选</button>
                            <button onClick={() => setSelected([])}>清空</button>
                            <span>已选 {selected.length} 个歌单</span>
                        </div>
                        <label className="send-to-phone--include-local">
                            <input
                                type="checkbox"
                                checked={includeLocalAudio}
                                onChange={event => setIncludeLocalAudio(event.target.checked)}
                            />
                            <span>同时传输歌单中的本地音频（最多 8 GB）</span>
                        </label>
                        <div className="send-to-phone--list">
                            {sheetLabels.map(sheet => (
                                <label className="send-to-phone--row" key={sheet.id}>
                                    <input
                                        type="checkbox"
                                        checked={selected.includes(sheet.id)}
                                        onChange={event => setSelected(current => event.target.checked
                                            ? [...current, sheet.id]
                                            : current.filter(id => id !== sheet.id))}
                                    />
                                    <span>{sheet.title}</span>
                                </label>
                            ))}
                        </div>
                        {error && <div className="send-to-phone--error">{error}</div>}
                        <div className="send-to-phone--actions">
                            <button onClick={close}>取消</button>
                            <button className="primary" disabled={!selected.length || busy} onClick={start}>
                                {busy ? "正在准备…" : "生成二维码"}
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="send-to-phone--share">
                        <p>打开手机 MusicFree 的“从电脑接收”，扫描二维码。{session.totalBytes ? `本地音频共 ${(session.totalBytes / 1024 / 1024).toFixed(1)} MB。` : ""}此连接将在 {new Date(session.expiresAt).toLocaleTimeString()} 过期。</p>
                        {session.urls.length > 1 && (
                            <label className="send-to-phone--address-select">
                                电脑网络：
                                <select value={selectedUrl} onChange={event => setSelectedUrl(event.target.value)}>
                                    {session.urls.map(url => <option key={url} value={url}>{new URL(url).hostname}</option>)}
                                </select>
                            </label>
                        )}
                        {qrData ? <img className="send-to-phone--qr" src={qrData} alt="歌单接收二维码" /> : <div className="send-to-phone--qr-placeholder">正在生成二维码…</div>}
                        <div className="send-to-phone--url">{selectedUrl}</div>
                        <div className="send-to-phone--actions">
                            <button onClick={copyUrl}>复制连接</button>
                            <button className="primary" onClick={close}>完成并关闭</button>
                        </div>
                        {error && <div className="send-to-phone--error">{error}</div>}
                    </div>
                )}
            </div>
        </Base>
    );
}
