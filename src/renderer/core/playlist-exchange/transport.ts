interface ShareSession {
    id: string;
    expiresAt: number;
    urls: string[];
    totalBytes: number;
}

interface SharePayload {
    document: unknown;
    files: Array<{ playlistId: string; trackIndex: number; path: string }>;
}

interface ExchangeApi {
    start: (payload: SharePayload) => Promise<ShareSession>;
    stop: (sessionId: string) => Promise<boolean>;
}

const api = window["@shared/playlist-exchange" as any] as unknown as ExchangeApi;

export function startPlaylistShare(payload: SharePayload) {
    return api.start(payload);
}

export function stopPlaylistShare(sessionId: string) {
    return api.stop(sessionId);
}

export type { ShareSession };
