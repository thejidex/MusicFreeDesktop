import { nanoid } from "nanoid";
import { Platform } from "react-native";
import DeviceInfo from "react-native-device-info";
import getOrCreateMMKV from "@/utils/getOrCreateMMKV";
import MusicSheet from "@/core/musicSheet";
import PluginManager from "@/core/pluginManager";
import { library } from "@/core/library";
import { internalSerializeKey } from "@/constants/commonConst";
import { getLocalPath } from "@/utils/mediaUtils";
import { downloadExchangeAttachments, type AttachmentProgress } from "./attachments";
export { cancelExchangeAttachmentDownloads } from "./attachments";
import {
    createExchangeDocument,
    ExchangeDocument,
    ExchangeMetadataField,
    ExchangePlaylist,
    ExchangePlugin,
    ExchangeTrack,
    parseExchangeInput,
    planPlaylistMerge,
    songIdentity,
    sanitizePluginData,
} from "../../../../src/shared/playlist-exchange";

const identityStorage = getOrCreateMMKV("musicfree.playlist-exchange");
const DEVICE_ID_KEY = "deviceId";
const MEDIA_FIELDS = new Set([
    "id", "platform", "title", "artist", "album", "alias", "duration", "artwork",
    "displaySource", "url", "source", "headers", "qualities", "lyric", "lrc", "rawLrc",
    "playCount", "$$metadataOverrides", "$$displayPlatform", "$$localPath", "localPath", "path",
    "downloadData", "$$exchangeNeedsLocalFile", "$timestamp", "$sortIndex",
]);

function getDeviceId() {
    let id = identityStorage.getString(DEVICE_ID_KEY);
    if (!id) {
        id = nanoid();
        identityStorage.set(DEVICE_ID_KEY, id);
    }
    return id;
}

export function mobileItemToExchangeTrack(
    item: IMusic.IMusicItem,
    markLocalFileMissing = false,
): ExchangeTrack {
    const edited = library.edits(item);
    const editedFields = Object.keys(edited).filter((field): field is ExchangeMetadataField =>
        field === "title" || field === "artist" || field === "album" || field === "displaySource");
    const displayItem = library.apply(item);
    const pluginData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item)) {
        if (!MEDIA_FIELDS.has(key)) pluginData[key] = value;
    }
    const isLocal = item.platform === "本地";
    return {
        source: {
            platform: String(item.platform),
            id: String(item.id),
            pluginData: sanitizePluginData(pluginData),
        },
        metadata: {
            title: displayItem.title ?? "",
            artist: displayItem.artist ?? "",
            album: displayItem.album ?? "",
            ...(displayItem.displaySource ? { displaySource: displayItem.displaySource } : {}),
            ...(displayItem.artwork ? { artwork: displayItem.artwork } : {}),
            ...(Number.isFinite(displayItem.duration) ? { duration: displayItem.duration } : {}),
            editedFields,
        },
        ...(library.count(item) > 0 ? { playCount: library.count(item) } : {}),
        ...(isLocal && (markLocalFileMissing || item.$$exchangeNeedsLocalFile)
            ? { localAudio: { needsFile: true } }
            : {}),
    };
}

function getExchangePlugins(): ExchangePlugin[] {
    return PluginManager.getEnabledPlugins().map(plugin => ({
        id: plugin.instance.platform,
        ...(plugin.instance.version ? { version: plugin.instance.version } : {}),
        installSources: plugin.instance.srcUrl ? [plugin.instance.srcUrl] : [],
    }));
}

function sameMedia(a: { platform?: string; id?: string }, b: { platform?: string; id?: string }) {
    return a.platform === b.platform && String(a.id) === String(b.id);
}

export function createMobileExchangeDocument(sheets = MusicSheet.backupSheets()) {
    const starredSheets = MusicSheet.getStarredSheets();
    const devicePlatform = Platform.OS === "android" || Platform.OS === "ios"
        ? Platform.OS
        : "unknown";
    return createExchangeDocument({
        exportId: nanoid(),
        sourceDevice: {
            id: getDeviceId(),
            platform: devicePlatform,
            appVersion: DeviceInfo.getVersion(),
        },
        createdAt: new Date().toISOString(),
        plugins: getExchangePlugins(),
        attachments: [],
        playlists: sheets.map((sheet, order) => ({
            sourceSheetId: String(sheet.id),
            title: sheet.title || "未命名歌单",
            ...(sheet.coverImg ? { cover: sheet.coverImg } : {}),
            ...(sheet.description ? { description: sheet.description } : {}),
            order,
            isFavorite: sheet.id === MusicSheet.defaultSheet.id,
            isStarred: starredSheets.some(starred => sameMedia(starred, sheet)),
            tracks: (sheet.musicList || []).map(item => mobileItemToExchangeTrack(item, true)),
        })),
    });
}

export function exchangeTrackToMobileItem(track: ExchangeTrack, localAudioPath?: string): IMusic.IMusicItem {
    return {
        ...track.source.pluginData,
        id: track.source.id,
        platform: track.source.platform,
        title: track.metadata.title,
        artist: track.metadata.artist,
        album: track.metadata.album,
        ...(track.metadata.displaySource ? { displaySource: track.metadata.displaySource } : {}),
        artwork: track.metadata.artwork ?? "",
        duration: track.metadata.duration ?? 0,
        ...(localAudioPath ? { [internalSerializeKey]: { localPath: localAudioPath } } : {}),
        ...(track.localAudio?.needsFile && !localAudioPath ? { $$exchangeNeedsLocalFile: true } : {}),
    };
}

export interface PlaylistImportDecision {
    action: "create" | "merge" | "replace";
    targetSheetId?: string;
}

export interface MobileImportOptions {
    decisions?: Record<string, PlaylistImportDecision>;
    metadataConflict?: "keep-device" | "use-source";
    playCount?: "keep-device" | "use-source";
    installMissingPlugins?: boolean;
    onAttachmentProgress?: (progress: AttachmentProgress) => void;
}

export interface MobileImportPreview {
    document: ExchangeDocument;
    legacy: boolean;
    warnings: string[];
    legacyLibrary?: Record<string, string>;
    missingPlugins: Array<{ plugin: ExchangePlugin; installed: boolean; enabled: boolean }>;
    matchedPlaylists: Array<{ sourceSheetId: string; targetSheetId: string; title: string }>;
    remoteBaseUrl?: string;
}

const pendingPreviews = new Map<string, MobileImportPreview>();

export function saveMobileExchangePreview(preview: MobileImportPreview, remoteBaseUrl?: string) {
    if (remoteBaseUrl) preview.remoteBaseUrl = remoteBaseUrl.replace(/\/$/, "");
    const id = nanoid();
    pendingPreviews.set(id, preview);
    return id;
}

export function getMobileExchangePreview(id: string) {
    return pendingPreviews.get(id);
}

export function removeMobileExchangePreview(id: string) {
    pendingPreviews.delete(id);
}

export async function finishMobileExchangeSession(preview: MobileImportPreview) {
    if (!preview.remoteBaseUrl) return;
    const url = `${preview.remoteBaseUrl}/complete`;
    preview.remoteBaseUrl = undefined;
    try { await fetch(url, { method: "POST" }); } catch { /* Session expires automatically. */ }
}

function libraryKey(track: ExchangeTrack) {
    return JSON.stringify([track.source.platform, String(track.source.id)]);
}

function readEditedFields(snapshot: Record<string, string>, key: string) {
    try {
        const value = JSON.parse(snapshot[`edits:${key}`] || "{}");
        return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
        return {};
    }
}

function applyTrackLibraryData(
    snapshot: Record<string, string>,
    track: ExchangeTrack,
    options: Required<Pick<MobileImportOptions, "metadataConflict" | "playCount">>,
) {
    const key = libraryKey(track);
    const existingEdits = readEditedFields(snapshot, key);
    const nextEdits: Record<string, unknown> = { ...existingEdits };
    let hasEdits = false;
    for (const field of track.metadata.editedFields) {
        const existingValue = existingEdits[field];
        const sourceValue = track.metadata[field];
        if (sourceValue === undefined) continue;
        if (typeof existingValue === "string" && options.metadataConflict === "keep-device") continue;
        nextEdits[field] = sourceValue;
        hasEdits = true;
    }
    if (hasEdits) snapshot[`edits:${key}`] = JSON.stringify(nextEdits);
    if (options.playCount === "use-source" && track.playCount !== undefined) {
        snapshot[`count:${key}`] = String(track.playCount);
    }
}

function sourceMatch(sheet: IMusic.IMusicSheetItem, deviceId: string, playlist: ExchangePlaylist) {
    return sheet.exchangeSourceDeviceId === deviceId && sheet.exchangeSourceSheetId === playlist.sourceSheetId;
}

export function previewMobileExchange(input: string | unknown): MobileImportPreview {
    const parsed = parseExchangeInput(input);
    const sheets = MusicSheet.backupSheets();
    const plugins = parsed.document.plugins.map(plugin => {
        const installedPlugin = PluginManager.getByName(plugin.id);
        return {
            plugin,
            installed: Boolean(installedPlugin),
            enabled: installedPlugin ? PluginManager.isPluginEnabled(installedPlugin) : false,
        };
    });
    return {
        document: parsed.document,
        legacy: parsed.legacy,
        warnings: parsed.warnings,
        legacyLibrary: parsed.legacyLibrary,
        missingPlugins: plugins.filter(item => !item.installed || !item.enabled),
        matchedPlaylists: parsed.document.playlists.flatMap(playlist => {
            if (playlist.isFavorite) return [{
                sourceSheetId: playlist.sourceSheetId,
                targetSheetId: MusicSheet.defaultSheet.id,
                title: playlist.title,
            }];
            const found = sheets.find(sheet => sourceMatch(sheet, parsed.document.sourceDevice.id, playlist));
            return found ? [{ sourceSheetId: playlist.sourceSheetId, targetSheetId: found.id, title: found.title || playlist.title }] : [];
        }),
    };
}

/** Installs only after caller confirmation; installation failures are returned as warnings and never cancel playlist import. */
export async function importMobileExchange(
    preview: MobileImportPreview,
    options: MobileImportOptions = {},
) {
    const warnings = [...preview.warnings];
    let attachmentPaths = new Map<string, string>();
    if (preview.remoteBaseUrl && preview.document.attachments.length) {
        attachmentPaths = await downloadExchangeAttachments(
            preview.document.attachments,
            preview.remoteBaseUrl,
            options.onAttachmentProgress,
        );
    }
    if (options.installMissingPlugins) {
        for (const missing of preview.missingPlugins) {
            if (missing.installed) {
                const installed = PluginManager.getByName(missing.plugin.id);
                if (installed) PluginManager.setPluginEnabled(installed, true);
                continue;
            }
            if (!missing.plugin.installSources.length) {
                warnings.push(`插件 ${missing.plugin.id} 没有可用安装来源`);
                continue;
            }
            const source = missing.plugin.installSources[0];
            try {
                await PluginManager.installPluginFromUrl(source);
            } catch (error: any) {
                warnings.push(`插件 ${missing.plugin.id} 安装失败：${error?.message || error}`);
            }
        }
    }

    const originalSheets = MusicSheet.backupSheets();
    const nextSheets: IMusic.IMusicSheetItem[] = originalSheets.map(sheet => ({ ...sheet, musicList: [...(sheet.musicList || [])] }));
    const nextStarredSheets: IMusic.IMusicSheetItem[] = MusicSheet.getStarredSheets().map(sheet => ({ ...sheet }));
    const originalStarredSheets = MusicSheet.getStarredSheets();
    const previousLibrary = library.snapshot();
    const nextLibrary = { ...previousLibrary };
    const decisions = options.decisions || {};
    const mergeOptions = {
        metadataConflict: options.metadataConflict || "keep-device",
        playCount: options.playCount || "keep-device",
    } as const;
    for (const [key, value] of Object.entries(preview.legacyLibrary || {})) {
        if (key.startsWith("edits:") && (!nextLibrary[key] || mergeOptions.metadataConflict === "use-source")) {
            nextLibrary[key] = value;
        } else if (key.startsWith("count:") && mergeOptions.playCount === "use-source") {
            nextLibrary[key] = value;
        }
    }
    const imported: Array<{ sourceSheetId: string; targetSheetId: string; added: number; total: number }> = [];
    const usedTargets = new Set<string>();

    for (const playlist of preview.document.playlists) {
        const automaticMatch = playlist.isFavorite
            ? nextSheets.find(sheet => sheet.id === MusicSheet.defaultSheet.id)
            : nextSheets.find(sheet => sourceMatch(sheet, preview.document.sourceDevice.id, playlist));
        const requestedDecision = decisions[playlist.sourceSheetId];
        const decision = playlist.isFavorite
            ? {
                action: requestedDecision?.action === "replace" ? "replace" as const : "merge" as const,
                targetSheetId: MusicSheet.defaultSheet.id,
            }
            : requestedDecision || (automaticMatch
            ? { action: "merge" as const, targetSheetId: automaticMatch.id }
            : { action: "create" as const });
        let target = decision.targetSheetId
            ? nextSheets.find(sheet => sheet.id === decision.targetSheetId)
            : automaticMatch;
        if (decision.action !== "create" && !target) {
            throw new Error(`找不到歌单“${playlist.title}”的导入目标`);
        }
        if (decision.action === "create") {
            const id = nanoid();
            target = {
                id,
                platform: "本地",
                title: playlist.title,
                coverImg: playlist.cover,
                description: playlist.description,
                worksNum: 0,
                createAt: Date.now(),
                exchangeSourceDeviceId: preview.document.sourceDevice.id,
                exchangeSourceSheetId: playlist.sourceSheetId,
                musicList: [],
            } as IMusic.IMusicSheetItem;
            nextSheets.push(target);
        }
        if (!target) throw new Error(`无法准备歌单“${playlist.title}”`);
        if (usedTargets.has(target.id)) throw new Error("多个来源歌单不能同时写入同一个目标歌单");
        usedTargets.add(target.id);

        const existingItems = decision.action === "create" ? [] : [...(target.musicList || [])];
        const existingByIdentity = new Map(existingItems.map(item => [songIdentity(mobileItemToExchangeTrack(item)), item]));
        const deviceTracks = existingItems.map(item => mobileItemToExchangeTrack(item));
        const incomingTracks = playlist.tracks;
        const mergeResult = planPlaylistMerge(
            decision.action === "replace" ? [] : deviceTracks,
            incomingTracks,
            mergeOptions,
        );
        const incomingByIdentity = new Map(incomingTracks.map(track => [songIdentity(track), track]));
        const nextMusicList = mergeResult.tracks.map(track => {
            const identity = songIdentity(track);
            const existing = existingByIdentity.get(identity);
            const incoming = incomingByIdentity.get(identity);
            if (incoming) applyTrackLibraryData(nextLibrary, track, mergeOptions);
            const incomingAttachmentPath = track.localAudio?.attachmentId
                ? attachmentPaths.get(track.localAudio.attachmentId)
                : undefined;
            if (!existing) {
                return exchangeTrackToMobileItem(track, incomingAttachmentPath);
            }
            const merged = decision.action === "replace"
                ? exchangeTrackToMobileItem(track, incomingAttachmentPath)
                : incoming
                ? { ...existing, ...incoming.source.pluginData }
                : existing;
            if (existing.platform === "本地") {
                const existingLocalPath = getLocalPath(existing);
                const localPath = incomingAttachmentPath || existingLocalPath;
                if (localPath) {
                    merged[internalSerializeKey] = {
                        ...(existing[internalSerializeKey] || {}),
                        localPath,
                    };
                    delete merged.$$exchangeNeedsLocalFile;
                } else if (track.localAudio?.needsFile) {
                    merged.$$exchangeNeedsLocalFile = true;
                } else {
                    delete merged.$$exchangeNeedsLocalFile;
                }
            }
            return merged;
        });

        target.musicList = nextMusicList;
        target.worksNum = nextMusicList.length;
        if (decision.action === "replace") {
            target.title = playlist.title;
            target.coverImg = playlist.cover;
            target.description = playlist.description;
        }
        if (!playlist.isFavorite) {
            target.exchangeSourceDeviceId = preview.document.sourceDevice.id;
            target.exchangeSourceSheetId = playlist.sourceSheetId;
        }
        if (playlist.isStarred && !nextStarredSheets.some(item => sameMedia(item, target!))) {
            nextStarredSheets.push({
                id: target.id,
                platform: target.platform,
                title: target.title,
                coverImg: target.coverImg,
                musicList: target.musicList,
            } as unknown as IMusic.IMusicSheetItem);
        }
        imported.push({
            sourceSheetId: playlist.sourceSheetId,
            targetSheetId: target.id,
            added: mergeResult.added,
            total: nextMusicList.length,
        });
    }

    try {
        await MusicSheet.applyExchangeState(nextSheets, nextStarredSheets);
        library.replaceSnapshotExact(nextLibrary);
    } catch (error) {
        await MusicSheet.applyExchangeState(originalSheets, originalStarredSheets);
        library.replaceSnapshotExact(previousLibrary);
        throw error;
    }
    const unavailableAttachments = preview.document.attachments.filter(item => !attachmentPaths.has(item.id));
    if (unavailableAttachments.length && !preview.remoteBaseUrl) {
        warnings.push(`${unavailableAttachments.length} 个本地音频附件没有随文件提供；对应歌曲需要补充本地文件`);
    }
    await finishMobileExchangeSession(preview);
    return { imported, warnings };
}
