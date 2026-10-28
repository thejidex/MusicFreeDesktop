// Platform-independent persistence rules, also exercised without a native runtime.
export interface SongIdentity { platform: string; id: string | number }
export interface SongEdits { title?: string; artist?: string; album?: string; displaySource?: string }
export interface StringStorage {
    getString(key: string): string | undefined;
    getAllKeys?(): string[];
    set(key: string, value: string): void;
}
export const songKey = (song: SongIdentity) => JSON.stringify([song.platform, String(song.id)]);

export class LibraryData {
    constructor(private storage: StringStorage, private changed: () => void = () => {}) {}

    edits(song: SongIdentity): SongEdits {
        try {
            return JSON.parse(this.storage.getString(`edits:${songKey(song)}`) || "{}"); 
        } catch {
            return {}; 
        }
    }
    apply<T extends SongIdentity>(song: T): T & SongEdits {
        return { ...song, ...this.edits(song), id: song.id, platform: song.platform };
    }
    edit(song: SongIdentity, edits: SongEdits) {
        const valid: SongEdits = {};
        for (const field of ["title", "artist", "album", "displaySource"] as const) {
            if (typeof edits[field] === "string") valid[field] = edits[field]!.trim();
        }
        if (valid.title === "") throw new Error("歌名不能为空");
        this.storage.set(`edits:${songKey(song)}`, JSON.stringify({ ...this.edits(song), ...valid }));
        this.changed();
    }
    snapshot(): Record<string, string> {
        return Object.fromEntries((this.storage.getAllKeys?.() ?? []).filter(key => /^(edits|count):/.test(key)).map(key => [key, this.storage.getString(key) ?? ""]));
    }
    restore(snapshot: Record<string, string>) {
        for (const [key, value] of Object.entries(snapshot ?? {})) {
            if (typeof value !== "string") continue;
            try {
                const [kind, identity] = [key.slice(0, key.indexOf(":")), JSON.parse(key.slice(key.indexOf(":") + 1))];
                if (!Array.isArray(identity) || identity.length !== 2 || identity.some(item => typeof item !== "string")) continue;
                const song = { platform: identity[0], id: identity[1] };
                if (kind === "edits") this.edit(song, JSON.parse(value));
                if (kind === "count" && /^\d+$/.test(value) && Number.isSafeInteger(+value)) this.storage.set(key, String(Math.max(this.count(song), +value)));
            } catch { /* Ignore malformed records in older/imported backups. */ }
        }
        this.changed();
    }
    count(song: SongIdentity) {
        const count = Number(this.storage.getString(`count:${songKey(song)}`) || 0);
        return Number.isSafeInteger(count) && count >= 0 ? count : 0;
    }
    increment(song: SongIdentity) {
        // MMKV writes are synchronous: increments cannot interleave across awaits.
        const count = this.count(song) + 1;
        this.storage.set(`count:${songKey(song)}`, String(count));
        this.changed();
        return count;
    }
}

export class PlaybackSession {
    private key: string | null = null;
    private counted = false;
    begin(song: SongIdentity | null, restart = false) {
        const key = song ? songKey(song) : null;
        if (key !== this.key || restart) {
            this.key = key; this.counted = false; 
        }
    }
    played(song: SongIdentity) {
        if (this.key !== songKey(song) || this.counted) return false;
        this.counted = true;
        return true;
    }
}
