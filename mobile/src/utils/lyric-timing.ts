/** Restore explicit phrase boundaries for display; never create new onset times. */
export function formatLyricDisplayLines(text: string): string {
    return text.replace(/([\p{Script=Han}，。！？；：]{2,})[\t \u3000]+(?=[\p{Script=Han}]{2})/gu, "$1\n");
}

function timestamp(milliseconds: number): string {
    const ticks = Math.round(milliseconds / 10);
    return "[" + String(Math.floor(ticks / 6000)).padStart(2, "0") + ":" +
        String(Math.floor(ticks / 100) % 60).padStart(2, "0") + "." +
        String(ticks % 100).padStart(2, "0") + "]";
}

/** Convert source YRC word onsets to LRC phrases using only supplied timestamps. */
export function wordTimedLyricToLrc(raw?: string): string | null {
    if (!raw || !/^\[\d+,\d+\]/m.test(raw)) return null;
    const output: string[] = [...raw.matchAll(/\[offset:[+-]?\d+\]/gi)].map(match => match[0]);
    let emitted = 0;
    for (const line of raw.split(/\r\n?|\n/)) {
        const header = line.match(/^\[(\d+),(\d+)\]/);
        if (!header) continue;
        const words = [...line.matchAll(/\((\d+),(\d+),\d+\)(.*?)(?=\(\d+,\d+,\d+\)|$)/g)];
        if (!words.length) return null;
        let phrase = "";
        let onset = Number(words[0][1]);
        let pendingBreak = false;
        let lastStart = -1;
        const flush = () => {
            if (phrase.trim()) {
                output.push(timestamp(onset) + phrase.trim());
                emitted++;
            }
            phrase = "";
        };
        for (const word of words) {
            const start = Number(word[1]);
            const duration = Number(word[2]);
            // A malformed clock must not replace an otherwise usable ordinary lyric.
            if (start < lastStart || start < Number(header[1]) ||
                start + duration > Number(header[1]) + Number(header[2]) + 100) return null;
            lastStart = start;
            const text = word[3];
            if (pendingBreak && /[\p{Script=Han}]/u.test(text)) {
                flush();
                onset = start;
                pendingBreak = false;
            }
            if (!phrase) onset = start;
            phrase += text;
            pendingBreak = /[\p{Script=Han}，。！？；：]{2,}\s+$/u.test(phrase) ||
                /[。！？；]\s*$/u.test(phrase);
        }
        flush();
    }
    return emitted ? output.join("\n") : null;
}

/** A visual boundary alone is not evidence of the second phrase's onset. */
export function hasCompoundLyricLines(raw: string): boolean {
    return formatLyricDisplayLines(raw) !== raw;
}
