import { Converter } from "opencc-js";

let toSimplified: (text: string) => string;

/** Convert display text only; retain original lyrics for other UI languages. */
export function getLyricDisplayText(text: string, language?: string): string {
    if (!text || !/^zh[-_](?:cn|sg|hans)(?:[-_]|$)/i.test(language || "")) return text;
    toSimplified ??= Converter({ from: "tw", to: "cn" });
    // The Taiwan feminine pronoun is normally written as 你 in Simplified Chinese.
    return toSimplified(text).replace(/妳/g, "你");
}
