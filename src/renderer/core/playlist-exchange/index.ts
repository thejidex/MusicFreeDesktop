import { nanoid } from "nanoid";
import MusicSheet, { defaultSheet } from "@/renderer/core/music-sheet";
import PluginManager from "@shared/plugin-manager/renderer";
import playCounts from "@/renderer/core/play-counts";
import { createExchangeDocument, sanitizePluginData } from "@shared/playlist-exchange";
import type { ExchangeMetadataField, ExchangeTrack } from "@shared/playlist-exchange";

const DEVICE_ID_KEY = "musicfree.playlist-exchange.deviceId";

export interface DesktopExchangeFileReference {
    playlistId: string;
    trackIndex: number;
    path: string;
}

export interface DesktopExchangePayload {
    document: ReturnType<typeof createExchangeDocument>;
    files: DesktopExchangeFileReference[];
    missingLocalFiles: number;
}

function getDeviceId() {
    let id = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        id = nanoid();
        window.localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
}

export function trackToExchange(item: IMusic.IMusicItem): ExchangeTrack {
    const overrides = (item.$$metadataOverrides || {}) as NonNullable<IMusic.IMusicItem["$$metadataOverrides"]>;
    const editedFields = (Object.keys(overrides) as Array<keyof typeof overrides>).flatMap(field => {
        if (field === "title" || field === "artist" || field === "album") return [field as ExchangeMetadataField];
        if (field === "$$displayPlatform") return ["displaySource" as const];
        return [];
    });
    const excluded = new Set([
        "id", "platform", "title", "artist", "album", "duration", "artwork", "displaySource",
        "$$displayPlatform", "$$metadataOverrides", "url", "source", "headers", "qualities",
        "lyric", "lrc", "rawLrc", "playCount", "$$localPath", "localPath", "path",
        "downloadData", "$timestamp", "$sortIndex", "$$sortIndex", "$$musicRefCount",
    ]);
    const pluginData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item)) {
        if (!excluded.has(key)) pluginData[key] = value;
    }
    const isLocal = item.platform === "本地" || item.platform === "local" || item.platform === "localMusic";
    const count = playCounts.getCount(item);
    return {
        source: {
            platform: String(item.platform),
            id: String(item.id),
            pluginData: sanitizePluginData(pluginData),
        },
        metadata: {
            title: overrides.title ?? item.title ?? "",
            artist: overrides.artist ?? item.artist ?? "",
            album: overrides.album ?? item.album ?? "",
            ...((overrides.$$displayPlatform ?? item.$$displayPlatform)
                ? { displaySource: overrides.$$displayPlatform ?? item.$$displayPlatform }
                : {}),
            ...(item.artwork ? { artwork: item.artwork } : {}),
            ...(Number.isFinite(item.duration) ? { duration: item.duration } : {}),
            editedFields,
        },
        ...(count > 0 ? { playCount: count } : {}),
        ...(isLocal ? { localAudio: { needsFile: true } } : {}),
    };
}

/** Creates a clean exchange snapshot for only the selected local playlists. */
export async function createDesktopExchangeDocument(sheetIds: string[]) {
    if (!sheetIds.length) throw new Error("请至少选择一个歌单");
    await playCounts.setup();
    const [allSheets, allPlugins] = await Promise.all([
        MusicSheet.frontend.exportAllSheetDetails(),
        Promise.resolve(PluginManager.getAllPlugins()),
    ]);
    const selected = new Set(sheetIds);
    const starred = MusicSheet.frontend.getAllStarredSheets();
    const playlists = allSheets.flatMap((sheet, order) => {
        if (!selected.has(sheet.id)) return [];
        return [{
            sourceSheetId: String(sheet.id),
            title: sheet.title || "未命名歌单",
            ...(sheet.artwork ? { cover: sheet.artwork } : {}),
            ...(sheet.description ? { description: sheet.description } : {}),
            order,
            isFavorite: sheet.id === defaultSheet.id,
            isStarred: starred.some(item => item.id === sheet.id && item.platform === sheet.platform),
            tracks: (sheet.musicList || []).map(trackToExchange),
        }];
    });
    const requiredPluginIds = new Set(
        playlists.flatMap(playlist => playlist.tracks.map(track => track.source.platform))
            .filter(platform => !["本地", "local", "localMusic"].includes(platform)),
    );
    const plugins = [...requiredPluginIds].map(id => {
        const plugin = allPlugins.find(item => item.platform === id);
        return {
            id,
            ...(plugin?.version ? { version: plugin.version } : {}),
            installSources: plugin?.srcUrl ? [plugin.srcUrl] : [],
        };
    });
    return createExchangeDocument({
        exportId: nanoid(),
        sourceDevice: { id: getDeviceId(), platform: "desktop", appVersion: "1.5.0" },
        createdAt: new Date().toISOString(),
        plugins,
        attachments: [],
        playlists,
    });
}

/** Adds only paths belonging to selected local tracks; main process turns them into scoped attachments. */
export async function createDesktopExchangePayload(
    sheetIds: string[],
    includeLocalAudio: boolean,
): Promise<DesktopExchangePayload> {
    const document = await createDesktopExchangeDocument(sheetIds);
    if (!includeLocalAudio) return { document, files: [], missingLocalFiles: 0 };

    const allSheets = await MusicSheet.frontend.exportAllSheetDetails();
    const selectedSheets = new Map(allSheets.filter(sheet => sheetIds.includes(sheet.id)).map(sheet => [sheet.id, sheet]));
    const files: DesktopExchangeFileReference[] = [];
    let missingLocalFiles = 0;
    for (const playlist of document.playlists) {
        const sheet = selectedSheets.get(playlist.sourceSheetId);
        for (const [trackIndex, track] of playlist.tracks.entries()) {
            if (!track.localAudio?.needsFile) continue;
            const item = sheet?.musicList?.[trackIndex];
            const localPath = item?.$$localPath || item?.$?.localPath;
            if (typeof localPath === "string" && localPath.trim()) {
                files.push({ playlistId: playlist.sourceSheetId, trackIndex, path: localPath });
            } else {
                missingLocalFiles += 1;
            }
        }
    }
    return { document, files, missingLocalFiles };
}
