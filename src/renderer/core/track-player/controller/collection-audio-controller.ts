import { PlayerState } from "@/common/constant";
import { CurrentTime, ErrorReason } from "../enum";
import { Collection, CollectionSource, ResolveSource } from "../collection";
import AudioController from "./audio-controller";

interface CollectionSession extends Collection {
    item: IMusic.IMusicItem;
    index: number;
    request: number;
    loading: boolean;
    failed: boolean;
    targetLocal: number;
    wantPlaying: boolean;
    cancelWait?: () => void;
}

export default class CollectionAudioController extends AudioController {
    private collection: CollectionSession | null = null;
    private loop = false;

    constructor(private resolveSource: ResolveSource) {
        super();
        const onEnded = this.audio.onended;
        const onPause = this.audio.onpause;
        const onPlaying = this.audio.onplaying;
        const onError = this.audio.onerror;
        this.audio.onended = event => {
            const session = this.collection;
            if (session?.loading) {
                return;
            }
            if (session && session.index < session.parts.length - 1) {
                session.wantPlaying = true;
                void this.switchPart(session, session.index + 1, 0);
            } else {
                onEnded?.call(this.audio, event);
            }
        };
        this.audio.onpause = event => {
            if (!this.collection?.loading) onPause?.call(this.audio, event);
        };
        this.audio.onplaying = event => {
            if (!this.collection?.loading) onPlaying?.call(this.audio, event);
        };
        this.audio.onerror = event => {
            if (!this.collection?.loading) onError?.call(this.audio, event);
        };
        this.audio.addEventListener("loadedmetadata", () => this.reportProgress());
    }

    private clearCollection() {
        if (this.collection) {
            this.collection.request++;
            this.collection.cancelWait?.();
        }
        this.collection = null;
        super.setLoop(this.loop);
    }

    protected getProgress(): CurrentTime {
        const session = this.collection;
        if (!session) return super.getProgress();
        const local = session.loading || session.failed ? session.targetLocal : this.audio.currentTime;
        return {
            currentTime: session.offsets[session.index] + Math.max(0, Math.min(local || 0, session.parts[session.index].duration)),
            duration: session.total,
        };
    }

    private reportProgress() {
        if (this.collection) this.onProgressUpdate?.(this.getProgress());
    }

    private isActive(session: CollectionSession, request: number) {
        return this.collection === session && session.request === request;
    }

    private waitForMetadata(session: CollectionSession): Promise<void> {
        return new Promise((resolve, reject) => {
            const cleanup = () => {
                clearTimeout(timer);
                this.audio.removeEventListener("loadedmetadata", loaded);
                this.audio.removeEventListener("error", failed);
                if (session.cancelWait === cancel) session.cancelWait = undefined;
            };
            const loaded = () => {
                cleanup(); resolve(); 
            };
            const failed = () => {
                cleanup(); reject(new Error(this.audio.error?.message || "Collection audio metadata failed")); 
            };
            const cancel = () => {
                cleanup(); resolve(); 
            };
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error("Collection audio metadata timeout"));
            }, 20000);
            session.cancelWait = cancel;
            this.audio.addEventListener("loadedmetadata", loaded);
            this.audio.addEventListener("error", failed);
        });
    }

    private async switchPart(session: CollectionSession, index: number, localTime: number) {
        const request = ++session.request;
        session.cancelWait?.();
        session.index = index;
        session.targetLocal = localTime;
        session.loading = true;
        session.failed = false;
        super.pause();
        this.playerState = session.wantPlaying ? PlayerState.Buffering : PlayerState.Paused;
        this.reportProgress();
        try {
            const result = await this.resolveSource(session.parts[index], session.quality);
            if (!this.isActive(session, request)) return;
            if (!result.mediaSource?.url) throw new Error("Collection part has no playable source");
            const ready = this.waitForMetadata(session);
            super.setTrackSource(result.mediaSource, session.item);
            this.audio.load();
            await ready;
            if (!this.isActive(session, request)) return;
            super.seekTo(localTime);
            session.loading = false;
            this.reportProgress();
            if (session.wantPlaying) super.play();
            else this.playerState = PlayerState.Paused;
        } catch (error) {
            if (!this.isActive(session, request)) return;
            session.cancelWait?.();
            session.loading = false;
            session.failed = true;
            super.pause();
            this.playerState = PlayerState.Paused;
            this.onError?.(ErrorReason.EmptyResource, error);
        }
    }

    setTrackSource(source: CollectionSource, item: IMusic.IMusicItem): void {
        this.clearCollection();
        if (source.collection) {
            this.collection = {
                ...source.collection, item, index: 0, request: 0, loading: false,
                failed: false, targetLocal: 0, wantPlaying: false,
            };
        }
        super.setTrackSource(source, item);
        if (this.collection) {
            super.setLoop(false);
            this.reportProgress();
        }
    }

    seekTo(time: number): void {
        const session = this.collection;
        if (!session) return super.seekTo(time);
        if (!Number.isFinite(time)) return;
        time = Math.max(0, Math.min(time, session.total));
        let index = session.parts.length - 1;
        for (let i = 0; i < session.parts.length - 1; i++) {
            if (time < session.offsets[i + 1]) {
                index = i; break; 
            }
        }
        const localTime = time - session.offsets[index];
        if (index === session.index && !session.loading && !session.failed) {
            super.seekTo(localTime);
            this.reportProgress();
        } else {
            void this.switchPart(session, index, localTime);
        }
    }

    play(): void {
        if (this.collection) {
            this.collection.wantPlaying = true;
            if (this.collection.loading) return;
            if (this.collection.failed) {
                void this.switchPart(this.collection, this.collection.index, this.collection.targetLocal);
                return;
            }
        }
        super.play();
    }

    pause(): void {
        if (this.collection) this.collection.wantPlaying = false;
        super.pause();
        if (this.collection?.loading) this.playerState = PlayerState.Paused;
    }

    prepareTrack(item: IMusic.IMusicItem): void {
        this.clearCollection();
        super.prepareTrack(item);
    }

    reset(): void {
        this.clearCollection();
        super.reset();
    }

    setLoop(loop: boolean): void {
        this.loop = loop;
        super.setLoop(this.collection ? false : loop);
    }
}
