import PluginManager from "@shared/plugin-manager/renderer";

export interface Collection {
    parts: IMusic.IMusicItem[];
    offsets: number[];
    total: number;
    quality: IMusic.IQualityKey;
}

export interface CollectionSource extends IMusic.IMusicSource {
    collection?: Collection;
}

export interface ResolvedSource {
    quality: IMusic.IQualityKey;
    mediaSource: CollectionSource | null;
}

export type ResolveSource = (item: IMusic.IMusicItem, quality?: IMusic.IQualityKey) => Promise<ResolvedSource>;

/** Multi-page videos stay one queue item; resolve signed URLs only when needed. */
export async function resolveBilibiliCollection(
    item: IMusic.IMusicItem,
    quality: IMusic.IQualityKey | undefined,
    resolveSource: ResolveSource,
): Promise<ResolvedSource> {
    if (!item || item.platform !== "bilibili" || item.cid || !(item.bvid || item.aid)) {
        return resolveSource(item, quality);
    }

    let parts: IMusic.IMusicItem[];
    let offsets: number[];
    let total = 0;
    try {
        const album = await PluginManager.callPluginDelegateMethod(
            { platform: item.platform }, "getAlbumInfo", { ...item, description: item.description ?? "" }, 1,
        );
        if (album?.isEnd === false || !Array.isArray(album?.musicList) || album.musicList.length < 2) {
            return resolveSource(item, quality);
        }
        parts = album.musicList.map(part => ({
            ...item,
            id: part.id ?? item.id,
            cid: part.cid,
            bvid: part.bvid ?? item.bvid,
            aid: part.aid ?? item.aid,
            title: part.title ?? item.title,
            duration: Number(part.duration),
        }));
        if (parts.some(part => !part.cid || !Number.isFinite(part.duration) || part.duration <= 0)) {
            return resolveSource(item, quality);
        }
        offsets = parts.map(part => {
            const offset = total;
            total += part.duration;
            return offset;
        });
        if (!Number.isFinite(total)) {
            return resolveSource(item, quality);
        }
    } catch {
        // A plugin without album metadata must still be usable as before.
        return resolveSource(item, quality);
    }
    const result = await resolveSource(parts[0], quality);
    if (!result.mediaSource?.url) {
        return result;
    }
    return {
        ...result,
        mediaSource: {
            ...result.mediaSource,
            collection: { parts, offsets, total, quality: result.quality },
        },
    };
}
