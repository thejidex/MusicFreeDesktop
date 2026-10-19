import Store from "@/common/store";
import Dexie, { Table } from "dexie";

interface PlayCountRecord {
    platform: string;
    id: string;
    count: number;
}

class PlayCountDB extends Dexie {
    counts: Table<PlayCountRecord, [string, string]>;

    constructor() {
        super("musicPlayCountDB");
        this.version(1).stores({ counts: "[platform+id]" });
    }
}

/** Keep local listening statistics separate from song metadata and plugin popularity. */
export function playCountKey(item: IMedia.IMediaBase) {
    return JSON.stringify([item.platform, item.id]);
}

export class PlayCounts {
    readonly db = new PlayCountDB();
    private countsStore = new Store<ReadonlyMap<string, number>>(new Map());
    private ready: Promise<void> | null = null;

    setup() {
        if (!this.ready) {
            this.ready = this.db.counts.toArray().then(records => {
                this.countsStore.setValue(new Map(records.map(item => [playCountKey(item), item.count])));
            }).catch(error => {
                this.ready = null;
                throw error;
            });
        }
        return this.ready;
    }

    useCounts = () => this.countsStore.useValue();

    getCount(item: IMedia.IMediaBase) {
        return this.countsStore.getValue().get(playCountKey(item)) ?? 0;
    }

    async recordPlay(item: IMedia.IMediaBase) {
        if (!item?.platform || item.id === undefined || item.id === null) return;
        const { platform, id } = item;
        await this.setup();
        // A transaction prevents rapid replays from losing increments.
        const count = await this.db.transaction("rw", this.db.counts, async () => {
            const previous = await this.db.counts.get([platform, id]);
            const next = (previous?.count ?? 0) + 1;
            await this.db.counts.put({ platform, id, count: next });
            return next;
        });
        const key = playCountKey(item);
        this.countsStore.setValue(previous => new Map(previous).set(key, Math.max(count, previous.get(key) ?? 0)));
    }
}

export default new PlayCounts();
