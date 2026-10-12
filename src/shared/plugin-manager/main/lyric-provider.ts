import { app } from "electron";
import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import axios from "./network/axios";
import { hasLyric } from "@/common/lyric-util";

interface Candidate {
    source: "netease" | "lrclib";
    id: number;
    title: string;
    artists: string[];
    duration: number;
    artwork?: string;
    rawLrc?: string;
    instrumental?: boolean;
}

interface CachedLyric {
    savedAt: number;
    value: ILyric.ILyricSource;
}

const maxAge = 7 * 86400000;
const pending = new Map<string, Promise<ILyric.ILyricSource | null>>();
const memory = new Map<string, CachedLyric>();
const traditional: Record<string, string> = {
    "倫": "伦", "傑": "杰", "陳": "陈", "鄧": "邓", "學": "学", "孫": "孙",
    "韓": "韩", "劉": "刘", "愛": "爱", "後": "后", "遺": "遗",
};

function normalize(value: string) {
    return String(value || "").normalize("NFKC").toLowerCase().replace(/ø/g, "o")
        .replace(/[倫傑陳鄧學孫韓劉愛後遺]/g, value => traditional[value])
        .replace(/[^\p{L}\p{N}]/gu, "");
}

function clean(value: string) {
    return value.normalize("NFKC").replace(/\.(flac|mp3|m4a|wav)$/i, "")
        .replace(/【[^】]*】|\[[^\]]*\]/g, "")
        .replace(/\([^)]*(?:无损|纯享|Hi.?Res|音质)[^)]*\)/ig, "").trim();
}

export function getTitleQueries(item: IMusic.IMusicItem): string[] {
    const raw = String(item.title || "").normalize("NFKC");
    const quoted = [...raw.matchAll(/《([^》]+)》/g)].map(match => clean(match[1]));
    if (quoted.length) return [...new Set(quoted)].filter(Boolean).slice(0, 2);
    const text = clean(raw).split(/[「『“”]/)[0]
        .replace(/(?:动态歌词|百万豪装录音棚.*|高清无损音质.*|无损音质.*|最高音质.*|\s*MV\b.*)$/ig, "").trim();
    const parts = text.split(/\s*[-—–]\s*/).filter(Boolean);
    if (parts.length > 1 && (item.platform === "bilibili"
        || (item.artist && normalize(parts[0]).includes(normalize(item.artist))))) {
        return [clean(parts[1]), clean(parts[0])].filter(Boolean).slice(0, 2);
    }
    return [text.replace(/^[|｜\s]+|[|｜\s]+$/g, "")].filter(Boolean);
}

export function rankLyricCandidate(item: IMusic.IMusicItem, candidate: Candidate, title: string): number {
    const name = normalize(candidate.title);
    const query = normalize(title);
    const base = normalize(candidate.title.replace(/[（(].*?[)）]/g, ""));
    let score = name === query ? 55 : base === query ? 49 : -100;
    if (score < 0) return score;
    const video = ["bilibili", "Youtube"].includes(item.platform);
    const hint = normalize(video ? item.title : item.artist);
    const matched = !!hint && candidate.artists.some(artist => {
        const name = normalize(artist);
        return !!name && (hint.includes(name) || name.includes(hint));
    });
    if (matched) score += 30;
    else if (!video && item.artist) score -= 45;
    const delta = Math.abs(Number(item.duration) - candidate.duration);
    if (Number.isFinite(delta) && item.duration > 0 && candidate.duration > 0) {
        score += delta <= 4 ? 25 : delta <= 12 ? 18 : delta <= 25 ? 6 : -25;
    }
    if (/伴奏|instrumental|karaoke/i.test(candidate.title) && !/伴奏|instrumental|karaoke/i.test(item.title)) return -100;
    if (/live|现场|remix|dj版|降调|升调|slowed/i.test(candidate.title) && !/live|现场|remix|dj版|降调|升调|slowed/i.test(item.title)) return -100;
    return score;
}

async function json(url: string) {
    return (await axios.get(url, {
        timeout: 6500, maxContentLength: 2000000,
        headers: { "User-Agent": "MusicFree/0.0.8", Accept: "application/json", Referer: "https://music.163.com/" },
    })).data;
}

async function searchNetease(query: string): Promise<Candidate[]> {
    const result = await json("https://music.163.com/api/search/get?" + new URLSearchParams({ s: query, type: "1", limit: "30" }));
    return (result.result?.songs || []).map((song: any) => ({
        source: "netease", id: song.id, title: song.name,
        artists: (song.artists || []).map((artist: any) => artist.name),
        duration: song.duration / 1000, artwork: song.album?.picUrl,
    }));
}

async function searchLrclib(title: string, artist?: string): Promise<Candidate[]> {
    const params = new URLSearchParams({ track_name: title });
    if (artist) params.set("artist_name", artist);
    const result = await json("https://lrclib.net/api/search?" + params);
    return (Array.isArray(result) ? result : []).map(song => ({
        source: "lrclib", id: song.id, title: song.trackName, artists: [song.artistName],
        duration: song.duration, rawLrc: song.syncedLyrics, instrumental: song.instrumental,
    }));
}

async function fetchLyrics(candidate: Candidate): Promise<ILyric.ILyricSource | null> {
    if (candidate.source === "lrclib") {
        if (candidate.rawLrc === undefined) {
            const result = await json("https://lrclib.net/api/get/" + candidate.id);
            candidate = { ...candidate, rawLrc: result.syncedLyrics, instrumental: result.instrumental };
        }
        if (hasLyric({ rawLrc: candidate.rawLrc })) return { rawLrc: candidate.rawLrc };
        return candidate.instrumental ? { rawLrc: "[00:00.00]纯音乐，请欣赏" } : null;
    }
    const result = await json("https://music.163.com/api/song/lyric?" + new URLSearchParams({ id: String(candidate.id), lv: "-1", kv: "-1", tv: "-1" }));
    const rawLrc = result.lrc?.lyric;
    if (hasLyric({ rawLrc }) && /\[\d{1,3}:\d{2}/.test(rawLrc)) {
        return { rawLrc, translation: result.tlyric?.lyric || undefined };
    }
    return result.nolyric ? { rawLrc: "[00:00.00]纯音乐，请欣赏" } : null;
}

async function choose(item: IMusic.IMusicItem, title: string, candidates: Candidate[]) {
    const ranked = candidates.map(candidate => ({ candidate, score: rankLyricCandidate(item, candidate, title) }))
        .filter(result => result.score >= 75).sort((a, b) => b.score - a.score);
    // Do not guess between equally likely recordings by different artists.
    if (ranked.length > 1 && ranked[0].score === ranked[1].score
        && normalize(ranked[0].candidate.artists.join("/")) !== normalize(ranked[1].candidate.artists.join("/"))) return null;
    for (const { candidate } of ranked.slice(0, 3)) {
        try {
            const lyric = await fetchLyrics(candidate);
            if (lyric) return lyric;
        } catch {
            // Try another confident match, never fabricate lyrics.
        }
    }
    return null;
}

async function find(item: IMusic.IMusicItem) {
    for (const title of getTitleQueries(item)) {
        try {
            const lyric = await choose(item, title, await searchNetease(title));
            if (lyric) return lyric;
        } catch { /* Try the alternative provider. */ }
        try {
            const artist = ["bilibili", "Youtube"].includes(item.platform) ? undefined : item.artist;
            const lyric = await choose(item, title, await searchLrclib(title, artist));
            if (lyric) return lyric;
        } catch { /* No confidently matched lyric available. */ }
    }
    return null;
}

export async function resolveMissingLyric(item: IMusic.IMusicItem): Promise<ILyric.ILyricSource | null> {
    if (!item?.title) return null;
    const key = createHash("sha256").update(JSON.stringify([item.platform, item.id, item.title, item.artist, item.duration])).digest("hex");
    const cached = memory.get(key);
    if (cached?.savedAt > Date.now() - maxAge) return cached.value;
    if (pending.has(key)) return pending.get(key);
    const file = path.join(app.getPath("userData"), "lyric-cache", key + ".json");
    const work = (async () => {
        try {
            const cached: CachedLyric = JSON.parse(await fs.readFile(file, "utf8"));
            if (cached.savedAt > Date.now() - maxAge && hasLyric(cached.value)) {
                if (memory.size >= 256) memory.delete(memory.keys().next().value);
                memory.set(key, cached);
                return cached.value;
            }
        } catch { /* Cache is optional. */ }
        const value = await find(item);
        if (value) {
            const cached = { savedAt: Date.now(), value };
            if (memory.size >= 256) memory.delete(memory.keys().next().value);
            memory.set(key, cached);
            try {
                await fs.mkdir(path.dirname(file), { recursive: true });
                await fs.writeFile(file, JSON.stringify(cached), "utf8");
            } catch { /* Read-only data folders must not prevent lyrics. */ }
        }
        return value;
    })().finally(() => pending.delete(key));
    pending.set(key, work);
    return work;
}

export async function searchFallbackLyrics(query: string, page: number) {
    if (page > 1 || !query.trim()) return { isEnd: true, data: [] };
    let candidates: Candidate[] = [];
    try {
        candidates = await searchNetease(query); 
    } catch { /* Try LRCLIB. */ }
    if (!candidates.length) {
        try {
            candidates = await searchLrclib(query); 
        } catch { /* Return an empty result. */ }
    }
    return {
        isEnd: true,
        data: candidates.map(candidate => ({
            id: `mf-lyric:${candidate.source}:${candidate.id}`, title: candidate.title,
            artist: candidate.artists.join(" / "), duration: candidate.duration, artwork: candidate.artwork,
        })),
    };
}

export function getFallbackLyricById(item: IMusic.IMusicItem): Promise<ILyric.ILyricSource | null> | undefined {
    const match = String(item?.id).match(/^mf-lyric:(netease|lrclib):(\d+)$/);
    if (!match) return;
    return fetchLyrics({ source: match[1] as Candidate["source"], id: Number(match[2]), title: "", artists: [], duration: 0 });
}
