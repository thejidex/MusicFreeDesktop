/** Shared, platform-independent playlist exchange format and merge rules. */
export const EXCHANGE_FORMAT = "musicfree.playlist-exchange" as const;
export const EXCHANGE_VERSION = 1 as const;

export type ExchangePlatform = "desktop" | "android" | "ios" | "unknown";
export type ExchangeMetadataField = "title" | "artist" | "album" | "displaySource";

export interface ExchangeDevice {
    id: string;
    platform: ExchangePlatform;
    appVersion: string;
}

export interface ExchangePlugin {
    id: string;
    version?: string;
    installSources: string[];
}

export interface ExchangeAttachment {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    sha256: string;
}

export interface ExchangeTrack {
    source: {
        platform: string;
        id: string;
        /** Stable source-plugin fields only; runtime media URLs and local paths are excluded. */
        pluginData: Record<string, unknown>;
    };
    metadata: {
        title: string;
        artist: string;
        album: string;
        displaySource?: string;
        artwork?: string;
        duration?: number;
        editedFields: ExchangeMetadataField[];
    };
    playCount?: number;
    localAudio?: {
        attachmentId?: string;
        needsFile: boolean;
    };
}

export interface ExchangePlaylist {
    sourceSheetId: string;
    title: string;
    cover?: string;
    description?: string;
    order: number;
    isFavorite: boolean;
    isStarred: boolean;
    tracks: ExchangeTrack[];
}

export interface ExchangeDocument {
    format: typeof EXCHANGE_FORMAT;
    formatVersion: typeof EXCHANGE_VERSION;
    exportId: string;
    sourceDevice: ExchangeDevice;
    createdAt: string;
    plugins: ExchangePlugin[];
    attachments: ExchangeAttachment[];
    playlists: ExchangePlaylist[];
}

export interface ParsedExchangeDocument {
    document: ExchangeDocument;
    legacy: boolean;
    warnings: string[];
    legacyLibrary?: Record<string, string>;
}

export interface MergeOptions {
    /** Keep the phone's edited fields by default; use incoming edits only when requested. */
    metadataConflict: "keep-device" | "use-source";
    /** Counts are snapshots, so importing never adds the source count to the phone count. */
    playCount: "keep-device" | "use-source";
}

export interface PlaylistMergePlan {
    tracks: ExchangeTrack[];
    added: number;
    matched: number;
}

export class ExchangeFormatError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ExchangeFormatError";
    }
}

const RECORD = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);

function text(value: unknown, field: string, required = false): string {
    if (typeof value === "string") {
        const result = value.trim();
        if (result || !required) return result;
    }
    if (required) throw new ExchangeFormatError(`字段无效：${field}`);
    return "";
}

function finiteNumber(value: unknown, field: string, minimum = 0): number | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    const number = Number(value);
    if (!Number.isFinite(number) || number < minimum) {
        throw new ExchangeFormatError(`字段无效：${field}`);
    }
    return number;
}

function safePublicUrl(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
        url.username = "";
        url.password = "";
        for (const key of [...url.searchParams.keys()]) {
            if (/(token|auth|cookie|password|secret|credential|signature|sign)/i.test(key)) {
                url.searchParams.delete(key);
            }
        }
        return url.toString();
    } catch {
        return undefined;
    }
}

const FORBIDDEN_PLUGIN_KEY = /^(?:url|urls|headers?|cookies?|authorization|token|password|secret|credential|auth|path|filepath|localpath|download|cache|source|lyric|lrc|quality|playback|stream|requestHeaders|mediaSource)$/i;
const ABSOLUTE_PATH = /^(?:[a-z]:[\\/]|\\\\|\/|file:\/\/)/i;

function localTrackIdHash(value: string) {
    let hash = 2166136261;
    let second = 5381;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
        second = Math.imul(second, 33) ^ value.charCodeAt(index);
    }
    return `local-${(hash >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function safePluginValue(value: unknown, depth = 0): unknown {
    if (depth > 8) return undefined;
    if (value === null || typeof value === "boolean" || typeof value === "number") return value;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (ABSOLUTE_PATH.test(trimmed) || /^https?:\/\//i.test(trimmed)) return undefined;
        return trimmed.length > 4096 ? trimmed.slice(0, 4096) : trimmed;
    }
    if (Array.isArray(value)) {
        return value.slice(0, 256).map(item => safePluginValue(item, depth + 1)).filter(item => item !== undefined);
    }
    if (!RECORD(value)) return undefined;
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, 256)) {
        if (FORBIDDEN_PLUGIN_KEY.test(key)) continue;
        const safe = safePluginValue(item, depth + 1);
        if (safe !== undefined) output[key] = safe;
    }
    return output;
}

/** Removes runtime-only fields without discarding stable plugin identifiers such as bvid/cid. */
export function sanitizePluginData(value: unknown): Record<string, unknown> {
    if (!RECORD(value)) return {};
    const cleaned = safePluginValue(value);
    return RECORD(cleaned) ? cleaned : {};
}

export function songIdentity(track: Pick<ExchangeTrack, "source" | "localAudio">): string {
    // Attachment IDs describe transferred bytes, while song IDs describe library identity.
    // Keep repeated imports idempotent even when a newly exported file gets a fresh attachment ID.
    return JSON.stringify([track.source.platform, String(track.source.id)]);
}

export function playlistIdentity(deviceId: string, sheetId: string): string {
    return JSON.stringify([deviceId, sheetId]);
}

function normalizeTrack(raw: unknown, library: Record<string, unknown> = {}): ExchangeTrack {
    if (!RECORD(raw)) throw new ExchangeFormatError("歌单包含无效歌曲");
    const currentShape = RECORD(raw.source) && RECORD(raw.metadata);
    const source = currentShape ? raw.source as Record<string, unknown> : raw;
    const fields = currentShape ? raw.metadata as Record<string, unknown> : raw;
    const platform = text(source.platform, "track.source.platform", true);
    let id = text(source.id, "track.source.id", true);
    const isLocal = platform === "本地" || platform === "local" || platform === "Local" || platform === "localMusic";
    if (isLocal && ABSOLUTE_PATH.test(id)) id = localTrackIdHash(id);
    const libraryKey = JSON.stringify([platform, id]);
    const editValue = library[`edits:${libraryKey}`];
    let edits: Record<string, unknown> = {};
    if (typeof editValue === "string") {
        try {
            const parsed = JSON.parse(editValue);
            if (RECORD(parsed)) edits = parsed;
        } catch { /* Old snapshots may contain malformed records. */ }
    }
    const desktopEdits = RECORD(raw.$$metadataOverrides) ? raw.$$metadataOverrides : {};
    const allEdits = { ...desktopEdits, ...edits };
    const incomingEditedFields = Array.isArray(fields.editedFields)
        ? fields.editedFields.filter((field): field is ExchangeMetadataField =>
            field === "title" || field === "artist" || field === "album" || field === "displaySource")
        : [];
    const editedFields = (["title", "artist", "album", "displaySource"] as const)
        .filter(field => typeof allEdits[field] === "string" || incomingEditedFields.includes(field));
    const title = text(allEdits.title ?? fields.title, "track.title");
    const artist = text(allEdits.artist ?? fields.artist, "track.artist");
    const album = text(allEdits.album ?? fields.album, "track.album");
    const displaySource = text(allEdits.displaySource ?? fields.displaySource ?? raw.$$displayPlatform, "track.displaySource");
    const libraryCount = library[`count:${libraryKey}`];
    const playCount = finiteNumber(libraryCount ?? raw.playCount, "track.playCount");
    const artwork = safePublicUrl(fields.artwork ?? raw.artwork);
    const excluded = new Set([
        "id", "platform", "title", "artist", "album", "displaySource", "$$displayPlatform",
        "$$metadataOverrides", "duration", "artwork", "url", "source", "headers", "qualities",
        "lyric", "lrc", "rawLrc", "playCount", "$$localPath", "localPath", "path", "downloadData",
        "$$exchangeNeedsLocalFile", "$timestamp", "$sortIndex",
    ]);
    const pluginFields: Record<string, unknown> = {};
    const sourceFields = currentShape && RECORD(source.pluginData) ? source.pluginData : raw;
    for (const [key, value] of Object.entries(sourceFields)) {
        if (excluded.has(key) || key === "pluginData") continue;
        const safe = safePluginValue({ [key]: value });
        if (RECORD(safe) && key in safe) pluginFields[key] = safe[key];
    }

    return {
        source: { platform, id, pluginData: pluginFields },
        metadata: {
            title,
            artist,
            album,
            ...(displaySource ? { displaySource } : {}),
            ...(artwork ? { artwork } : {}),
            ...(finiteNumber(fields.duration ?? raw.duration, "track.duration") !== undefined
                ? { duration: finiteNumber(fields.duration ?? raw.duration, "track.duration") }
                : {}),
            editedFields,
        },
        ...(playCount !== undefined ? { playCount } : {}),
        ...(isLocal
            ? currentShape && RECORD(raw.localAudio)
                ? { localAudio: { needsFile: Boolean(raw.localAudio.needsFile), ...(text(raw.localAudio.attachmentId, "track.localAudio.attachmentId") ? { attachmentId: text(raw.localAudio.attachmentId, "track.localAudio.attachmentId") } : {}) } }
                : { localAudio: { needsFile: true } }
            : {}),
    };
}

function normalizePlaylist(raw: unknown, order: number, library: Record<string, unknown> = {}): ExchangePlaylist {
    if (!RECORD(raw)) throw new ExchangeFormatError("包含无效歌单");
    const tracks = Array.isArray(raw.musicList) ? raw.musicList : Array.isArray(raw.tracks) ? raw.tracks : [];
    return {
        sourceSheetId: text(raw.sourceSheetId ?? raw.id, "playlist.id", true),
        title: text(raw.title, "playlist.title", true),
        ...(safePublicUrl(raw.cover ?? raw.coverImg ?? raw.artwork)
            ? { cover: safePublicUrl(raw.cover ?? raw.coverImg ?? raw.artwork) }
            : {}),
        ...(text(raw.description, "playlist.description") ? { description: text(raw.description, "playlist.description") } : {}),
        order: finiteNumber(raw.order ?? order, "playlist.order") ?? order,
        isFavorite: Boolean(raw.isFavorite || raw.id === "favorite" || raw.sourceSheetId === "favorite"),
        isStarred: Boolean(raw.isStarred || raw.starred),
        tracks: tracks.map(item => normalizeTrack(item, library)),
    };
}

function normalizePlugin(raw: unknown): ExchangePlugin {
    if (!RECORD(raw)) throw new ExchangeFormatError("包含无效插件信息");
    const id = text(raw.id ?? raw.pluginId ?? raw.srcUrl, "plugin.id", true);
    const sources = Array.isArray(raw.installSources)
        ? raw.installSources
        : typeof raw.srcUrl === "string" ? [raw.srcUrl] : [];
    return {
        id,
        ...(text(raw.version, "plugin.version") ? { version: text(raw.version, "plugin.version") } : {}),
        installSources: sources.map(safePublicUrl).filter((item): item is string => Boolean(item)),
    };
}

export function validateCurrentDocument(input: unknown): ExchangeDocument {
    if (!RECORD(input)) throw new ExchangeFormatError("歌单交换文档必须是对象");
    const raw = input;
    if (raw.formatVersion !== EXCHANGE_VERSION) {
        throw new ExchangeFormatError(`不支持的歌单交换版本：${String(raw.formatVersion)}`);
    }
    if (!RECORD(raw.sourceDevice)) throw new ExchangeFormatError("缺少来源设备信息");
    if (!Array.isArray(raw.playlists)) throw new ExchangeFormatError("缺少有效歌单列表");
    const sourceDevice = raw.sourceDevice;
    const platform = text(sourceDevice.platform, "sourceDevice.platform", true) as ExchangePlatform;
    if (!["desktop", "android", "ios", "unknown"].includes(platform)) {
        throw new ExchangeFormatError("来源设备平台无效");
    }
    const attachments = Array.isArray(raw.attachments) ? raw.attachments : [];
    if (attachments.length > 10000) throw new ExchangeFormatError("本地附件数量超过限制");
    const normalizedAttachments = attachments.map(item => {
        if (!RECORD(item)) throw new ExchangeFormatError("包含无效附件");
        return {
            id: text(item.id, "attachment.id", true),
            filename: text(item.filename, "attachment.filename", true).replace(/[\\/]/g, "_"),
            mimeType: text(item.mimeType, "attachment.mimeType") || "application/octet-stream",
            size: finiteNumber(item.size, "attachment.size") ?? 0,
            sha256: validateSha256(item.sha256),
        };
    });
    if (new Set(normalizedAttachments.map(item => item.id)).size !== normalizedAttachments.length) {
        throw new ExchangeFormatError("本地附件 ID 重复");
    }
    const attachmentBytes = normalizedAttachments.reduce((sum, item) => sum + item.size, 0);
    if (!Number.isSafeInteger(attachmentBytes) || attachmentBytes > 8 * 1024 * 1024 * 1024) {
        throw new ExchangeFormatError("本地附件总大小超过 8 GB");
    }
    const document: ExchangeDocument = {
        format: EXCHANGE_FORMAT,
        formatVersion: EXCHANGE_VERSION,
        exportId: text(raw.exportId, "exportId", true),
        sourceDevice: {
            id: text(sourceDevice.id, "sourceDevice.id", true),
            platform,
            appVersion: text(sourceDevice.appVersion, "sourceDevice.appVersion") || "unknown",
        },
        createdAt: text(raw.createdAt, "createdAt", true),
        plugins: Array.isArray(raw.plugins) ? raw.plugins.map(normalizePlugin) : [],
        attachments: normalizedAttachments,
        playlists: raw.playlists.map((playlist, index) => normalizePlaylist(playlist, index)),
    };
    const attachmentIds = new Set(document.attachments.map(item => item.id));
    for (const playlist of document.playlists) {
        for (const track of playlist.tracks) {
            const attachmentId = track.localAudio?.attachmentId;
            if (attachmentId && !attachmentIds.has(attachmentId)) {
                throw new ExchangeFormatError(`歌曲引用了不存在的本地附件：${attachmentId}`);
            }
        }
    }
    return document;
}

function validateSha256(value: unknown): string {
    const hash = text(value, "attachment.sha256", true).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new ExchangeFormatError("附件 SHA-256 校验值无效");
    return hash;
}

export function createExchangeDocument(
    value: Omit<ExchangeDocument, "format" | "formatVersion">,
): ExchangeDocument {
    return validateCurrentDocument({
        ...value,
        format: EXCHANGE_FORMAT,
        formatVersion: EXCHANGE_VERSION,
    });
}

/** Parse the current exchange format or convert the older desktop/mobile JSON backup shape. */
export function parseExchangeInput(input: string | unknown): ParsedExchangeDocument {
    let value: unknown = input;
    if (typeof input === "string") {
        try {
            value = JSON.parse(input);
        } catch {
            throw new ExchangeFormatError("歌单文件不是有效 JSON");
        }
    }
    if (!RECORD(value)) throw new ExchangeFormatError("歌单文件格式无效");
    if (value.format === EXCHANGE_FORMAT) {
        return { document: validateCurrentDocument(value), legacy: false, warnings: [] };
    }
    if (!Array.isArray(value.musicSheets)) {
        throw new ExchangeFormatError("文件不包含受支持的歌单格式");
    }
    const library = RECORD(value.library) ? value.library : {};
    const document: ExchangeDocument = {
        format: EXCHANGE_FORMAT,
        formatVersion: EXCHANGE_VERSION,
        exportId: "legacy-import",
        sourceDevice: { id: "legacy-unknown-device", platform: "unknown", appVersion: "unknown" },
        createdAt: new Date(0).toISOString(),
        plugins: Array.isArray(value.plugins) ? value.plugins.map(normalizePlugin) : [],
        attachments: [],
        playlists: value.musicSheets.map((sheet, index) => normalizePlaylist(sheet, index, library)),
    };
    const legacyLibrary = Object.entries(library).reduce<Record<string, string>>((result, [key, entry]) => {
        if (/^(edits|count):/.test(key) && typeof entry === "string") result[key] = entry;
        return result;
    }, {});
    return {
        document,
        legacy: true,
        warnings: ["此旧备份不含来源设备标识或附件；同名歌单按独立来源处理，本地歌曲需要重新选择文件。"],
        ...(Object.keys(legacyLibrary).length ? { legacyLibrary } : {}),
    };
}

/** Build the deterministic merge result: preserve device order and append unseen source identities. */
export function planPlaylistMerge(
    deviceTracks: ExchangeTrack[],
    sourceTracks: ExchangeTrack[],
    options: MergeOptions,
): PlaylistMergePlan {
    const sourceByIdentity = new Map(sourceTracks.map(track => [songIdentity(track), track]));
    const seen = new Set<string>();
    let matched = 0;
    const tracks = deviceTracks.map(deviceTrack => {
        const key = songIdentity(deviceTrack);
        seen.add(key);
        const sourceTrack = sourceByIdentity.get(key);
        if (!sourceTrack) return deviceTrack;
        matched++;
        const metadata = { ...deviceTrack.metadata };
        for (const field of ["title", "artist", "album", "displaySource"] as const) {
            const deviceEdited = deviceTrack.metadata.editedFields.includes(field);
            const sourceEdited = sourceTrack.metadata.editedFields.includes(field);
            const conflict = deviceEdited && sourceEdited && deviceTrack.metadata[field] !== sourceTrack.metadata[field];
            if (!deviceEdited || options.metadataConflict === "use-source") {
                if (sourceTrack.metadata[field] !== undefined) {
                    Object.assign(metadata, { [field]: sourceTrack.metadata[field] });
                }
            } else if (conflict) {
                // The phone's hand-edited value wins unless the user explicitly chooses the source copy.
            }
        }
        metadata.editedFields = [...new Set([
            ...deviceTrack.metadata.editedFields,
            ...sourceTrack.metadata.editedFields,
        ])];
        // A newly transferred attachment must reach the importer even if the
        // existing entry is already marked as missing its local file.
        const localAudio = sourceTrack.localAudio?.attachmentId
            ? sourceTrack.localAudio
            : deviceTrack.localAudio?.needsFile
                ? deviceTrack.localAudio
                : sourceTrack.localAudio?.needsFile ? sourceTrack.localAudio : deviceTrack.localAudio;
        return {
            ...deviceTrack,
            metadata,
            ...(options.playCount === "use-source" && sourceTrack.playCount !== undefined
                ? { playCount: sourceTrack.playCount }
                : {}),
            ...(localAudio ? { localAudio } : {}),
        };
    });
    let added = 0;
    for (const sourceTrack of sourceTracks) {
        const key = songIdentity(sourceTrack);
        if (seen.has(key)) continue;
        seen.add(key);
        tracks.push(sourceTrack);
        added++;
    }
    return { tracks, added, matched };
}

export const PlaylistExchange = {
    parse: parseExchangeInput,
    playlistIdentity,
    songIdentity,
    planMerge: planPlaylistMerge,
    sanitizePluginData,
};
