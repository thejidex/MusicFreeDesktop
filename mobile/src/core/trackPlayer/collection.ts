export interface CollectionPlan {
    parts: IMusic.IMusicItem[];
    offsets: number[];
    total: number;
    part: number;
}
export async function resolveCollection(song: IMusic.IMusicItem, getAlbum: (item: any, page: number) => Promise<any>): Promise<CollectionPlan | null> {
    if (song.platform !== "bilibili" || song.cid || !(song.bvid || song.aid)) return null;
    try {
        const album = await getAlbum({ ...song, description: song.description ?? "" }, 1);
        if (album?.isEnd === false || !Array.isArray(album?.musicList) || album.musicList.length < 2) return null;
        const parts = album.musicList.map((item: any) => ({ ...song, ...item, url: item.url, source: item.source, platform: song.platform, duration: Number(item.duration) }));
        if (parts.some((part: any) => !part.cid || !Number.isFinite(part.duration) || part.duration <= 0)) return null;
        let total = 0;
        const offsets = parts.map((part: any) => {
            const offset = total; total += part.duration; return offset; 
        });
        return Number.isFinite(total) ? { parts, offsets, total, part: 0 } : null;
    } catch {
        return null; 
    }
}
export function collectionPosition(plan: CollectionPlan, seconds: number) {
    const clamped = Math.max(0, Math.min(plan.total - 0.01, seconds));
    let part = plan.parts.length - 1;
    while (part > 0 && plan.offsets[part] > clamped) part--;
    return { part, position: clamped - plan.offsets[part] };
}
