import MusicSheet, { defaultSheet } from "@/renderer/core/music-sheet";
import playCounts from "@/renderer/core/play-counts";
import {
    parseExchangeInput,
    planPlaylistMerge,
    songIdentity,
} from "@shared/playlist-exchange";
import type {
    ExchangePlaylist,
    ExchangeTrack,
    MergeOptions,
} from "@shared/playlist-exchange";
import { trackToExchange } from "./index";

export interface DesktopImportOptions {
    decisions?: Record<string, { action: "create" | "merge" | "replace"; targetSheetId?: string }>;
    metadataConflict?: MergeOptions["metadataConflict"];
    playCount?: MergeOptions["playCount"];
}

function toMusicItem(track: ExchangeTrack): IMusic.IMusicItem {
    const item: IMusic.IMusicItem = {
        ...track.source.pluginData,
        id: track.source.id,
        platform: track.source.platform,
        title: track.metadata.title,
        artist: track.metadata.artist,
        album: track.metadata.album,
        duration: track.metadata.duration,
        artwork: track.metadata.artwork,
        ...(track.metadata.displaySource ? { $$displayPlatform: track.metadata.displaySource } : {}),
        ...(track.localAudio?.needsFile ? { $$exchangeNeedsLocalFile: true } : {}),
    };
    const overrides = {} as NonNullable<IMusic.IMusicItem["$$metadataOverrides"]> & Record<string, string>;
    for (const field of track.metadata.editedFields) {
        const value = field === "displaySource" ? track.metadata.displaySource : track.metadata[field];
        if (typeof value !== "string") continue;
        overrides[field === "displaySource" ? "$$displayPlatform" : field] = value;
    }
    if (Object.keys(overrides).length) item.$$metadataOverrides = overrides;
    return item;
}

function isSameSheetSource(
    sheet: { id: string; exchangeSourceDeviceId?: string; exchangeSourceSheetId?: string },
    deviceId: string,
    playlist: ExchangePlaylist,
) {
    return sheet.exchangeSourceDeviceId === deviceId && sheet.exchangeSourceSheetId === playlist.sourceSheetId;
}

function cloneWithTracks(sheets: IMusic.IMusicSheetItem[]) {
    return sheets.map(sheet => ({ ...sheet, musicList: [...(sheet.musicList || [])] }));
}

export async function previewDesktopExchange(input: string | unknown) {
    return parseExchangeInput(input);
}

/**
 * Stages every parsed playlist before touching storage. The public MusicSheet API persists each
 * selected sheet separately, so this function snapshots the affected sheets and restores them if
 * a write fails.
 */
export async function importDesktopExchange(
    input: string | unknown,
    options: DesktopImportOptions = {},
) {
    const parsed = parseExchangeInput(input);
    const originalSheets = cloneWithTracks(await MusicSheet.frontend.exportAllSheetDetails() as unknown as IMusic.IMusicSheetItem[]);
    const originalStars = [...MusicSheet.frontend.getAllStarredSheets()];
    const originalCounts = await playCounts.snapshot();
    const nextStars = [...originalStars];
    const mergeOptions: MergeOptions = {
        metadataConflict: options.metadataConflict || "keep-device",
        playCount: options.playCount || "keep-device",
    };
    const createdIds: string[] = [];
    const touchedIds = new Set<string>();
    const imported: Array<{ sourceSheetId: string; targetSheetId: string; added: number; total: number }> = [];

    try {
        for (const playlist of [...parsed.document.playlists].sort((a, b) => a.order - b.order)) {
            const sheets = MusicSheet.frontend.getAllSheets();
            const automaticTarget = playlist.isFavorite
                ? sheets.find(sheet => sheet.id === defaultSheet.id)
                : sheets.find(sheet => isSameSheetSource(sheet, parsed.document.sourceDevice.id, playlist));
            const requested = options.decisions?.[playlist.sourceSheetId];
            const decision = playlist.isFavorite
                ? { action: requested?.action === "replace" ? "replace" as const : "merge" as const, targetSheetId: defaultSheet.id }
                : requested || (automaticTarget
                    ? { action: "merge" as const, targetSheetId: automaticTarget.id }
                    : { action: "create" as const });
            let target = decision.targetSheetId
                ? sheets.find(sheet => sheet.id === decision.targetSheetId)
                : automaticTarget;
            if (decision.action !== "create" && !target) {
                throw new Error(`找不到歌单“${playlist.title}”的导入目标`);
            }
            if (decision.action === "create") {
                target = await MusicSheet.frontend.addSheet(playlist.title || "导入的歌单");
                if (!target) throw new Error(`无法创建歌单“${playlist.title}”`);
                createdIds.push(target.id);
            }
            if (!target) throw new Error(`无法准备歌单“${playlist.title}”`);
            if (touchedIds.has(target.id)) throw new Error("多个来源歌单不能同时写入同一个目标歌单");
            touchedIds.add(target.id);

            const existing = decision.action === "create"
                ? []
                : (originalSheets.find(sheet => sheet.id === target!.id)?.musicList || []);
            const sourceTracks = playlist.tracks;
            const planned = planPlaylistMerge(
                decision.action === "replace" ? [] : existing.map(trackToExchange),
                sourceTracks,
                mergeOptions,
            );
            const existingIds = new Set(existing.map(item => JSON.stringify([item.platform, String(item.id)])));
            const toAdd = (decision.action === "replace"
                ? planned.tracks
                : planned.tracks.filter(track => !existingIds.has(songIdentity(track)))).map(toMusicItem);
            if (decision.action === "replace") await MusicSheet.frontend.clearSheet(target.id);
            if (toAdd.length) await MusicSheet.frontend.addMusicToSheet(toAdd, target.id);
            const changed = {
                ...(decision.action === "replace" ? {
                    title: playlist.title,
                    artwork: playlist.cover,
                    description: playlist.description,
                } : {}),
                ...(!playlist.isFavorite ? {
                    exchangeSourceDeviceId: parsed.document.sourceDevice.id,
                    exchangeSourceSheetId: playlist.sourceSheetId,
                } : {}),
            };
            if (Object.keys(changed).length) await MusicSheet.frontend.updateSheet(target.id, changed);

            const verifiedSheets = await MusicSheet.frontend.exportAllSheetDetails();
            const verified = verifiedSheets.find(sheet => sheet.id === target!.id);
            const verifiedIds = new Set((verified?.musicList || [])
                .map(item => JSON.stringify([item.platform, String(item.id)])));
            if (planned.tracks.some(track => !verifiedIds.has(songIdentity(track)))) {
                throw new Error(`歌单“${playlist.title}”没有完整写入，请重试`);
            }

            if (playlist.isStarred && !nextStars.some(item => item.id === target!.id && item.platform === target!.platform)) {
                nextStars.push({ id: target.id, platform: target.platform });
            }
            if (mergeOptions.playCount === "use-source") {
                for (const track of planned.tracks) {
                    if (track.playCount !== undefined) {
                        await playCounts.setCount({ id: track.source.id, platform: track.source.platform }, track.playCount);
                    }
                }
            }
            const after = MusicSheet.frontend.getAllSheets().find(sheet => sheet.id === target!.id);
            imported.push({
                sourceSheetId: playlist.sourceSheetId,
                targetSheetId: target.id,
                added: toAdd.length,
                total: after?.musicList?.length || 0,
            });
        }
        await MusicSheet.frontend.setStarredMusicSheets(nextStars);
    } catch (error) {
        let rollbackError: unknown;
        try {
            for (const id of createdIds) await MusicSheet.frontend.removeSheet(id);
            for (const original of originalSheets) {
                if (!touchedIds.has(original.id) || createdIds.includes(original.id)) continue;
                await MusicSheet.frontend.clearSheet(original.id);
                if (original.musicList?.length) await MusicSheet.frontend.addMusicToSheet(original.musicList, original.id);
                const { musicList: _musicList, ...originalBase } = original;
                await MusicSheet.frontend.updateSheet(original.id, originalBase);
            }
            await MusicSheet.frontend.setStarredMusicSheets(originalStars);
            await playCounts.restoreExact(originalCounts);
        } catch (reason) {
            rollbackError = reason;
        }
        if (rollbackError) throw new Error(`导入失败且恢复快照未能完整写回：${String(rollbackError)}`);
        throw error;
    }
    return { imported, warnings: parsed.warnings, legacy: parsed.legacy };
}

