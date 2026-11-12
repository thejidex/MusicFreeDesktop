import { DocumentDirectoryPath, downloadFile, exists, getFSInfo, hash, mkdir, moveFile, stat, stopDownload, unlink } from "react-native-fs";
import { nanoid } from "nanoid";
import type { ExchangeAttachment } from "../../../../src/shared/playlist-exchange";

export interface AttachmentProgress {
    received: number;
    total: number;
    filename: string;
}

let activeJobId: number | undefined;
let cancelRequested = false;

export function cancelExchangeAttachmentDownloads() {
    cancelRequested = true;
    if (activeJobId !== undefined) stopDownload(activeJobId);
}

function throwIfCancelled() {
    if (cancelRequested) throw new Error("本地音频传输已取消");
}

function fileExtension(filename: string) {
    const match = filename.match(/\.[a-z0-9]{1,8}$/i);
    return match?.[0].toLowerCase() || ".audio";
}

/** Downloads only the attachment IDs declared in the validated exchange document. */
export async function downloadExchangeAttachments(
    attachments: ExchangeAttachment[],
    baseUrl: string,
    onProgress?: (progress: AttachmentProgress) => void,
) {
    cancelRequested = false;
    const total = attachments.reduce((sum, item) => sum + item.size, 0);
    if (!attachments.length) return new Map<string, string>();
    if (!Number.isSafeInteger(total) || total <= 0 || total > 8 * 1024 * 1024 * 1024) {
        throw new Error("本地音频附件总大小无效或超过 8 GB");
    }
    const { freeSpace } = await getFSInfo();
    if (freeSpace < total + 32 * 1024 * 1024) {
        throw new Error(`手机可用空间不足：需要 ${(total / 1024 / 1024).toFixed(1)} MB，可用 ${(freeSpace / 1024 / 1024).toFixed(1)} MB`);
    }

    const directory = `${DocumentDirectoryPath}/MusicFree/playlist-exchange`;
    if (!(await exists(directory))) await mkdir(directory);
    const output = new Map<string, string>();
    let receivedBefore = 0;
    try {
        for (const attachment of attachments) {
            throwIfCancelled();
            const destination = `${directory}/${attachment.sha256}${fileExtension(attachment.filename)}`;
            if (await exists(destination)) {
                const existing = await stat(destination);
                if (Number(existing.size) === attachment.size && (await hash(destination, "sha256")).toLowerCase() === attachment.sha256) {
                    output.set(attachment.id, destination);
                    receivedBefore += attachment.size;
                    onProgress?.({ received: receivedBefore, total, filename: attachment.filename });
                    continue;
                }
                await unlink(destination);
            }

            const partial = `${destination}.part-${nanoid(8)}`;
            try {
                const task = downloadFile({
                    fromUrl: `${baseUrl}/attachments/${encodeURIComponent(attachment.id)}`,
                    toFile: partial,
                    background: false,
                    progressInterval: 200,
                    progress: event => {
                        onProgress?.({
                            received: receivedBefore + Math.min(event.bytesWritten, attachment.size),
                            total,
                            filename: attachment.filename,
                        });
                    },
                });
                activeJobId = task.jobId;
                const response = await task.promise;
                activeJobId = undefined;
                throwIfCancelled();
                if (response.statusCode !== 200) throw new Error(`本地音频“${attachment.filename}”传输失败，HTTP ${response.statusCode}`);
                const result = await stat(partial);
                if (Number(result.size) !== attachment.size) throw new Error(`本地音频“${attachment.filename}”大小校验失败`);
                if ((await hash(partial, "sha256")).toLowerCase() !== attachment.sha256) {
                    throw new Error(`本地音频“${attachment.filename}”SHA-256 校验失败`);
                }
                await moveFile(partial, destination);
                output.set(attachment.id, destination);
                receivedBefore += attachment.size;
                onProgress?.({ received: receivedBefore, total, filename: attachment.filename });
            } catch (error) {
                activeJobId = undefined;
                if (await exists(partial)) await unlink(partial).catch(() => {});
                throw error;
            }
        }
        return output;
    } catch (error) {
        // Fully verified files can be reused on retry; partial files are always deleted.
        throw error;
    }
}
