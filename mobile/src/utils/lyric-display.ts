import { Converter } from "opencc-js";
let convert: ((text: string) => string) | undefined;
export function displayLyric(text: string | undefined, simplified: boolean) {
    if (!text || !simplified) return text;
    convert ??= Converter({ from: "tw", to: "cn" });
    return convert(text);
}
