import { app, ipcMain } from "electron";
import { createReadStream, promises as fsPromises } from "fs";
import { createServer, IncomingMessage, Server, ServerResponse } from "http";
import { networkInterfaces } from "os";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import path from "path";
import { ExchangeDocument, validateCurrentDocument } from "./index";

const SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024 * 1024;

interface RequestedAttachment {
    playlistId: string;
    trackIndex: number;
    path: string;
}

interface PreparedAttachment {
    id: string;
    path: string;
    filename: string;
    mimeType: string;
    size: number;
    sha256: string;
}

interface ShareSession {
    id: string;
    token: string;
    expiresAt: number;
    json: string;
    attachments: Map<string, PreparedAttachment>;
    server: Server;
    timer: NodeJS.Timeout;
}

function getLanAddresses(port: number, token: string) {
    const interfaces = Object.entries(networkInterfaces());
    const entries = interfaces.flatMap(([name, items]) =>
        (items || []).filter(item => !item.internal && item.family === "IPv4")
            .map(item => ({ name, address: item.address })),
    );
    const preferred = entries.filter(item => !/(virtual|vEthernet|wsl|docker|vmware|virtualbox|vpn|tunnel|loopback)/i.test(item.name));
    const addresses = (preferred.length ? preferred : entries)
        .map(item => `http://${item.address}:${port}/v1/${token}`);
    return [...new Set(addresses)];
}

function reply(res: ServerResponse, status: number, body: string) {
    res.writeHead(status, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        "X-Content-Type-Options": "nosniff",
    });
    res.end(body);
}

function mimeType(filename: string) {
    const ext = path.extname(filename).toLowerCase();
    const types: Record<string, string> = {
        ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".mp4": "audio/mp4",
        ".aac": "audio/aac", ".flac": "audio/flac", ".wav": "audio/wav",
        ".ogg": "audio/ogg", ".opus": "audio/ogg", ".wma": "audio/x-ms-wma",
        ".ape": "audio/ape",
    };
    return types[ext] || "application/octet-stream";
}

async function hashFile(filePath: string) {
    const hash = createHash("sha256");
    await new Promise<void>((resolve, reject) => {
        const stream = createReadStream(filePath);
        stream.on("data", chunk => {
            hash.update(typeof chunk === "string" ? chunk : new Uint8Array(chunk));
        });
        stream.once("error", reject);
        stream.once("end", resolve);
    });
    return hash.digest("hex");
}

function isRecord(value: unknown): value is Record<string, any> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function tokenMatches(actual: string, expected: string) {
    const left = Buffer.from(actual);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(new Uint8Array(left), new Uint8Array(right));
}

class PlaylistExchangeTransport {
    private session?: ShareSession;

    setup() {
        ipcMain.handle("@shared/playlist-exchange/start", async (_event, input: unknown) => this.start(input));
        ipcMain.handle("@shared/playlist-exchange/stop", async (_event, id: unknown) => this.stop(typeof id === "string" ? id : ""));
        app.on("will-quit", () => { void this.stop(""); });
    }

    private async start(input: unknown) {
        await this.stop(this.session?.id || "");
        const rawDocument = isRecord(input) && "document" in input ? input.document : input;
        const requestedFiles = isRecord(input) && Array.isArray(input.files)
            ? input.files as RequestedAttachment[]
            : [];
        const document: ExchangeDocument = validateCurrentDocument(rawDocument);
        const prepared = new Map<string, PreparedAttachment>();
        let totalAttachmentBytes = 0;
        for (const reference of requestedFiles) {
            if (!isRecord(reference) || typeof reference.playlistId !== "string" ||
                !Number.isSafeInteger(reference.trackIndex) || typeof reference.path !== "string") {
                throw new Error("本地音频附件信息无效");
            }
            const playlist = document.playlists.find(item => item.sourceSheetId === reference.playlistId);
            const track = playlist?.tracks[reference.trackIndex];
            if (!track || !track.localAudio?.needsFile ||
                !["本地", "local", "Local", "localMusic"].includes(track.source.platform)) {
                throw new Error("本地音频附件与所选歌单不匹配");
            }
            if (track.localAudio.attachmentId) continue;
            const absolutePath = await fsPromises.realpath(reference.path);
            const fileStat = await fsPromises.stat(absolutePath);
            if (!fileStat.isFile() || fileStat.size <= 0) {
                throw new Error(`本地音频文件无效：${path.basename(reference.path)}`);
            }
            totalAttachmentBytes += fileStat.size;
            if (!Number.isSafeInteger(totalAttachmentBytes) || totalAttachmentBytes > MAX_ATTACHMENT_BYTES) {
                throw new Error("本地音频总大小超过 8 GB，请分批发送");
            }
            const filename = path.basename(absolutePath).replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 180) || "audio.bin";
            const id = randomBytes(16).toString("hex");
            const attachment: PreparedAttachment = {
                id,
                path: absolutePath,
                filename,
                mimeType: mimeType(filename),
                size: fileStat.size,
                sha256: await hashFile(absolutePath),
            };
            prepared.set(id, attachment);
            track.localAudio = { needsFile: true, attachmentId: id };
            document.attachments.push({
                id,
                filename,
                mimeType: attachment.mimeType,
                size: attachment.size,
                sha256: attachment.sha256,
            });
        }
        // Re-validate after adding only the explicitly requested local files.
        const normalizedDocument = validateCurrentDocument(document);
        const json = JSON.stringify(normalizedDocument);
        if (Buffer.byteLength(json) > MAX_DOCUMENT_BYTES) throw new Error("所选歌单超过局域网分享限制，请改用文件导出");
        if (!document.playlists.length) throw new Error("请至少选择一个歌单");

        const id = randomBytes(12).toString("hex");
        const token = randomBytes(32).toString("hex");
        const expiresAt = Date.now() + SESSION_TTL_MS;
        let session!: ShareSession;
        const server = createServer((req, res) => this.handleRequest(req, res, session));
        server.maxConnections = 16;
        server.requestTimeout = 10_000;
        const timer = setTimeout(() => void this.stop(id), SESSION_TTL_MS);
        timer.unref();
        session = { id, token, expiresAt, json, attachments: prepared, server, timer };
        this.session = session;

        try {
            await new Promise<void>((resolve, reject) => {
                server.once("error", reject);
                server.listen(0, "0.0.0.0", () => {
                    server.removeListener("error", reject);
                    resolve();
                });
            });
        } catch (error) {
            await this.stop(id);
            throw error;
        }

        const address = server.address();
        if (!address || typeof address === "string") {
            await this.stop(id);
            throw new Error("无法启动局域网分享服务");
        }
        const urls = getLanAddresses(address.port, token);
        if (!urls.length) {
            await this.stop(id);
            throw new Error("没有找到可用的局域网网卡，请检查电脑网络连接");
        }
        return { id, expiresAt, urls, totalBytes: totalAttachmentBytes };
    }

    private handleRequest(req: IncomingMessage, res: ServerResponse, session: ShareSession) {
        if (req.method === "OPTIONS") {
            reply(res, 204, "");
            return;
        }
        const route = new URL(req.url || "/", "http://127.0.0.1").pathname;
        const requestedToken = route.startsWith("/v1/") ? route.slice(4) : "";
        const requestToken = requestedToken.split("/")[0] || "";
        if (!tokenMatches(requestToken, session.token)) {
            reply(res, 404, JSON.stringify({ error: "Not found" }));
            return;
        }
        if (Date.now() > session.expiresAt || this.session?.id !== session.id) {
            reply(res, 410, JSON.stringify({ error: "This share session has expired" }));
            void this.stop(session.id);
            return;
        }
        if (req.method === "POST" && route === `/v1/${session.token}/complete`) {
            req.resume();
            reply(res, 204, "");
            setTimeout(() => void this.stop(session.id), 100);
            return;
        }
        const attachmentPrefix = `/v1/${session.token}/attachments/`;
        if (req.method === "GET" && route.startsWith(attachmentPrefix)) {
            const attachmentId = route.slice(attachmentPrefix.length);
            const attachment = /^[a-f0-9]{32}$/.test(attachmentId)
                ? session.attachments.get(attachmentId)
                : undefined;
            if (!attachment) {
                reply(res, 404, JSON.stringify({ error: "Attachment not found" }));
                return;
            }
            res.writeHead(200, {
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-store",
                "Content-Type": attachment.mimeType,
                "Content-Length": attachment.size,
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
                "X-Content-SHA256": attachment.sha256,
                "X-Content-Type-Options": "nosniff",
            });
            const stream = createReadStream(attachment.path);
            stream.once("error", () => {
                if (!res.headersSent) reply(res, 500, JSON.stringify({ error: "Attachment read failed" }));
                else res.destroy();
            });
            stream.pipe(res);
            return;
        }
        if (route !== `/v1/${session.token}`) {
            reply(res, 404, JSON.stringify({ error: "Not found" }));
            return;
        }
        if (req.method !== "GET" || route !== `/v1/${session.token}`) {
            reply(res, 405, JSON.stringify({ error: "Method not allowed" }));
            return;
        }
        reply(res, 200, session.json);
    }

    private async stop(id: string) {
        const session = this.session;
        if (!session || (id && session.id !== id)) return false;
        this.session = undefined;
        clearTimeout(session.timer);
        await new Promise<void>(resolve => {
            if (!session.server.listening) return resolve();
            session.server.close(() => resolve());
            session.server.closeAllConnections?.();
        });
        return true;
    }
}

export default new PlaylistExchangeTransport();
