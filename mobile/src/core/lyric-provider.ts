import RNFS from "react-native-fs";
import CryptoJS from "crypto-js";
import pathConst from "@/constants/pathConst";
import { Converter } from "opencc-js";
import axios from "axios";
import { hasLyric } from "../utils/lyric-util";
import { hasCompoundLyricLines, wordTimedLyricToLrc } from "../utils/lyric-timing";

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

interface MatchedLyric extends ILyric.ILyricSource {
    match: Pick<Candidate, "source" | "id" | "title" | "artists" | "duration">;
}

interface CachedLyric {
    version: number;
    savedAt: number;
    value: ILyric.ILyricSource;
}

// Older automatic matches may use coarser timings from a different provider.
const lyricCacheVersion = 3;
const maxAge = 7 * 86400000;
const pending = new Map<string, Promise<ILyric.ILyricSource | null>>();
const memory = new Map<string, CachedLyric>();
let normalizeChinese: (text: string) => string;

function normalize(value: string) {
    // Providers may spell the same artist/title in Traditional or Simplified Chinese.
    normalizeChinese ??= Converter({ from: "tw", to: "cn" });
    return normalizeChinese(String(value || "").normalize("NFKC"))
        .toLowerCase().replace(/ø/g, "o")
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
    // The same song in a live/remixed/slowed recording has a different timeline.
    const versions = [/live|现场|現場/i, /remix|混音/i, /伴奏|instrumental|karaoke/i,
        /slowed|降调|降調|慢速/i, /sped.?up|升调|升調|加速/i];
    if (versions.some(pattern => pattern.test(candidate.title) !== pattern.test(item.title))) return -100;
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
        // Identical titles/artists can still describe edits of different recordings.
        // Do not attach their timestamps to ordinary tracks with a known mismatch.
        if (!video && delta > 8) return -100;
        score += delta <= 4 ? 25 : delta <= 12 ? 18 : delta <= 25 ? 6 : -25;
    }
    if (/伴奏|instrumental|karaoke/i.test(candidate.title) && !/伴奏|instrumental|karaoke/i.test(item.title)) return -100;
    if (/live|现场|remix|dj版|降调|升调|slowed/i.test(candidate.title) && !/live|现场|remix|dj版|降调|升调|slowed/i.test(item.title)) return -100;
    return score;
}

async function json(url: string) {
    return (await axios.get(url, {
        timeout: 6500, maxContentLength: 2000000,
        headers: { "User-Agent": "MusicFree/1.4", Accept: "application/json", Referer: "https://music.163.com/" },
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
    const result = await json("https://music.163.com/api/song/lyric?" + new URLSearchParams({ id: String(candidate.id), lv: "-1", kv: "-1", tv: "-1", rv: "-1", yv: "-1" }));
    const rawLrc = wordTimedLyricToLrc(result.yrc?.lyric) ?? result.lrc?.lyric;
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
            if (lyric) return {
                ...lyric,
                match: {
                    source: candidate.source, id: candidate.id, title: candidate.title,
                    artists: candidate.artists, duration: candidate.duration,
                },
            };
        } catch {
            // Try another confident match, never fabricate lyrics.
        }
    }
    return null;
}

function lyricTimeline(raw: string) {
    const text: string[] = [];
    const times = new Set<string>();
    for (const row of String(raw || "").split(/\r\n?|\n/)) {
        const content = row.replace(/\[[^\]]*\]/g, "").trim();
        if (!content || /^(?:作词|作曲|编曲|編曲|制作|製作|词曲|詞曲|词[:：]|詞[:：]|曲[:：]|演唱|录音|錄音|混音|监制|監製|出品|发行|發行|制作人|製作人)/.test(content)) continue;
        text.push(content);
        for (const time of row.match(/\[\d{1,3}:\d{2}(?:\.\d+)?\]/g) || []) times.add(time);
    }
    return { text: normalize(text.join("")), cues: times.size };
}

export function preferFinerLyric(primary: MatchedLyric, alternative?: MatchedLyric | null) {
    if (!alternative?.rawLrc || !primary.rawLrc || primary.translation) return primary;
    if (!primary.match || !alternative.match ||
        normalize(primary.match.artists.join("/")) !== normalize(alternative.match.artists.join("/")) ||
        !(primary.match.duration > 0 && alternative.match.duration > 0) ||
        Math.abs(primary.match.duration - alternative.match.duration) > 2) return primary;
    const one = lyricTimeline(primary.rawLrc);
    const two = lyricTimeline(alternative.rawLrc);
    // Compare the same lyrics, not merely a same-title cover or another performance.
    return one.text && one.text === two.text && two.cues > one.cues
        ? alternative : primary;
}

async function find(item: IMusic.IMusicItem) {
    for (const title of getTitleQueries(item)) {
        let primary: MatchedLyric | null = null;
        try {
            primary = await choose(item, title, await searchNetease(title));
            if (primary && !hasCompoundLyricLines(primary.rawLrc || "")) return primary;
        } catch { /* Try the alternative provider. */ }
        try {
            const artist = ["bilibili", "Youtube"].includes(item.platform) ? undefined : item.artist;
            const alternative = await choose(item, title, await searchLrclib(title, artist));
            if (primary) return preferFinerLyric(primary, alternative);
            if (alternative) return alternative;
        } catch { /* Keep the known match when an optional comparison is unavailable. */ }
        if (primary) return primary;
    }
    return null;
}

export async function resolveMissingLyric(item: IMusic.IMusicItem): Promise<ILyric.ILyricSource | null> {
    if (!item?.title) return null;
    const key = CryptoJS.SHA256(JSON.stringify([item.platform, item.id, item.title, item.artist, item.duration])).toString();
    const cached = memory.get(key);
    if (cached?.version === lyricCacheVersion && cached.savedAt > Date.now() - maxAge) return cached.value;
    if (pending.has(key)) return pending.get(key)!;
    const file = pathConst.lrcCachePath + "fallback-" + key + ".json";
    const work = (async () => {
        try {
            const cached: CachedLyric = JSON.parse(await RNFS.readFile(file, "utf8"));
            if (cached.version === lyricCacheVersion && cached.savedAt > Date.now() - maxAge && hasLyric(cached.value)) {
                if (memory.size >= 256) memory.delete(memory.keys().next().value!);
                memory.set(key, cached);
                return cached.value;
            }
        } catch { /* Cache is optional. */ }
        const value = await find(item);
        if (value) {
            const cached: CachedLyric = { version: lyricCacheVersion, savedAt: Date.now(), value };
            if (memory.size >= 256) memory.delete(memory.keys().next().value!);
            memory.set(key, cached);
            try {
                await RNFS.mkdir(pathConst.lrcCachePath);
                await RNFS.writeFile(file, JSON.stringify(cached), "utf8");
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
