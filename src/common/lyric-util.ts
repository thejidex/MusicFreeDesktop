function isLyricText(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0
        && !/<(?:!doctype|html|body)\b/i.test(value);
}

export function hasLyric(source?: ILyric.ILyricSource | null): boolean {
    return isLyricText(source?.rawLrc) || isLyricText(source?.translation);
}
