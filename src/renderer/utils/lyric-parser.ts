import { formatLyricDisplayLines, wordTimedLyricToLrc } from "@/common/lyric-timing";
import { getLyricDisplayText } from "./lyric-display";

const timeReg = /\[(?:\d{1,3}:)?\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g;
const metaReg = /\[([a-z]+):([^\]]*)\]/gi;

type LyricMeta = Record<string, any>;

interface IOptions {
    musicItem?: IMusic.IMusicItem;
    translation?: string;
    language?: string;
}

export interface IParsedLrcItem {
    /** 时间 s */
    time: number;
    /** 歌词 */
    lrc: string;
    /** 翻译 */
    translation?: string;
    /** 位置 */
    index: number;
}

export default class LyricParser {
    private _musicItem?: IMusic.IMusicItem;

    private meta: LyricMeta;
    private lrcItems: Array<IParsedLrcItem>;
    private originalLrcItems: Array<IParsedLrcItem>;

    private hasTimeline = false;

    public hasTranslation = false;

    get musicItem() {
        return this._musicItem;
    }

    constructor(raw: string, options?: IOptions) {
    // init
        this._musicItem = options?.musicItem;
        raw = String(raw ?? "").trim();
        let translation = options?.translation?.trim();
        if (!raw && translation) {
            raw = translation;
            translation = undefined;
        }

        const { lrcItems, meta, hasTimeline } = this.parseLyricImpl(raw);
        this.hasTimeline = hasTimeline;
        this.meta = meta;
        this.lrcItems = lrcItems;

        if (translation) {
            const translated = this.parseLyricImpl(translation);
            const transLrcItems = translated.lrcItems;
            if (translated.meta.offset === undefined && this.meta.offset !== undefined) {
                transLrcItems.forEach(item => {
                    item.time -= this.meta.offset;
                });
            }
            this.hasTranslation = transLrcItems.length > 0;

            // 2 pointer
            let p1 = 0;
            let p2 = 0;

            while (p1 < this.lrcItems.length) {
                const lrcItem = this.lrcItems[p1];
                while (
                    p2 < transLrcItems.length - 1 &&
                    transLrcItems[p2].time < lrcItem.time
                ) {
                    ++p2;
                }
                if (transLrcItems[p2]?.time === lrcItem.time) {
                    lrcItem.translation = transLrcItems[p2].lrc;
                } else {
                    lrcItem.translation = "";
                }

                ++p1;
            }
        }
        this.originalLrcItems = this.lrcItems;
        this.setLanguage(options?.language);
    }

    setLanguage(language?: string): void {
        this.lrcItems = this.originalLrcItems.map(item => ({
            ...item,
            lrc: getLyricDisplayText(formatLyricDisplayLines(item.lrc), language),
            translation: item.translation === undefined
                ? undefined
                : getLyricDisplayText(formatLyricDisplayLines(item.translation), language),
        }));
    }

    getPosition(position: number): IParsedLrcItem | null {
        if (!this.hasTimeline || !Number.isFinite(position) || !this.lrcItems.length
            || position < this.lrcItems[0].time) return null;
        // Find the last line whose onset has passed, including after backward seeks.
        let low = 0;
        let high = this.lrcItems.length;
        while (low < high) {
            const mid = (low + high) >>> 1;
            if (this.lrcItems[mid].time <= position) low = mid + 1;
            else high = mid;
        }
        return this.lrcItems[low - 1] ?? null;
    }

    getLyricItems() {
        return this.lrcItems;
    }

    getMeta() {
        return this.meta;
    }

    toString(options?: {
        withTimestamp?: boolean;
        type?: "raw" | "translation";
    }) {
        const { type = "raw", withTimestamp = true } = options || {};

        if (withTimestamp) {
            return this.lrcItems
                .map(
                    (item) =>
                        `${this.timeToLrctime(item.time)} ${
                            type === "raw" ? item.lrc : item.translation
                        }`,
                )
                .join("\r\n");
        } else {
            return this.lrcItems
                .map((item) => (type === "raw" ? item.lrc : item.translation))
                .join("\r\n");
        }
    }

    /** [xx:xx.xx] => x s */
    private parseTime(timeStr: string): number {
        let result = 0;
        const nums = timeStr.slice(1, timeStr.length - 1).split(":");
        for (let i = 0; i < nums.length; ++i) {
            result = result * 60 + +nums[i];
        }
        return result;
    }
    /** x s => [xx:xx.xx] */
    private timeToLrctime(sec: number) {
        const ticks = Math.round(Math.max(0, sec) * 100);
        const minutes = Math.floor(ticks / 6000);
        const seconds = Math.floor(ticks / 100) % 60;
        const fraction = ticks % 100;
        return "[" + String(minutes).padStart(2, "0") + ":" +
            String(seconds).padStart(2, "0") + "." + String(fraction).padStart(2, "0") + "]";
    }

    private parseMetaImpl(metaStr: string) {
        if (metaStr === "") {
            return {};
        }
        const metaArr = metaStr.match(metaReg) ?? [];
        const meta: any = {};
        let k, v;
        for (const m of metaArr) {
            k = m.substring(1, m.indexOf(":")).toLowerCase();
            v = m.substring(k.length + 2, m.length - 1);
            if (k === "offset") {
                const offset = Number(v) / 1000;
                if (Number.isFinite(offset)) meta[k] = offset;
            } else {
                meta[k] = v;
            }
        }
        return meta;
    }

    private parseLyricImpl(raw: string) {
        // Some plugins return escaped newlines rather than physical line breaks.
        raw = String(raw ?? "").replace(/\\r\\n|\\n|\\r/g, "\n").trim();
        raw = wordTimedLyricToLrc(raw) ?? raw;
        const meta = this.parseMetaImpl(raw);
        const lrcItems: Array<IParsedLrcItem> = [];
        let previousLineStart = 0;
        for (const line of raw.split(/\r\n?|\n/)) {
            const times = [...line.matchAll(timeReg)];
            if (!times.length) {
                const text = line.replace(metaReg, "").trim();
                // Preserve an explicit continuation instead of collapsing it to spaces.
                if (text && lrcItems.length) {
                    for (let i = previousLineStart; i < lrcItems.length; i++) lrcItems[i].lrc += "\n" + text;
                }
                continue;
            }
            previousLineStart = lrcItems.length;
            const pendingTimes: number[] = [];
            for (let i = 0; i < times.length; i++) {
                const match = times[i];
                pendingTimes.push(this.parseTime(match[0]));
                const end = i + 1 < times.length ? times[i + 1].index : line.length;
                const text = line.slice(match.index + match[0].length, end).trim();
                // Adjacent leading timestamps repeat a line, not a blank phrase.
                if (!text && i + 1 < times.length) continue;
                for (const time of pendingTimes.splice(0)) {
                    lrcItems.push({ time: time - (meta.offset ?? 0), lrc: text, index: 0 });
                }
            }
        }
        if (!lrcItems.length && raw) {
            return {
                lrcItems: raw.split(/\r\n?|\n/).map(line => line.replace(metaReg, "").trim())
                    .filter(Boolean).map((lrc, index) => ({ time: 0, lrc, index })),
                meta,
                hasTimeline: false,
            };
        }
        // Indices describe the sorted timeline shared by both lyric windows.
        lrcItems.sort((a, b) => a.time - b.time);
        lrcItems.forEach((item, index) => {
            item.index = index;
        });
        return { lrcItems, meta, hasTimeline: lrcItems.length > 0 };
    }
}
