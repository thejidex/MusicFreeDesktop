import RNFS from "react-native-fs";
import { unzipSync } from "fflate";
import Base64 from "@/utils/base64";
import pathConst from "@/constants/pathConst";
import Theme from "./theme";
import Config from "./appConfig";
import CryptoJS from "crypto-js";

const root = `${pathConst.basePath}/themes`;
export async function installThemePack(uri: string) {
    const info = await RNFS.stat(uri);
    if (Number(info.size) > 20 * 1024 * 1024) throw new Error("主题包超过 20 MB，请使用适合手机的主题");
    const encoded = await RNFS.readFile(uri, "base64");
    const binary = Base64.atob(encoded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    let total = 0;
    const files = unzipSync(bytes, { filter(entry) {
        if (entry.name.startsWith("/") || /(^|[\\/])\.\.([\\/]|$)|:|\\/.test(entry.name)) throw new Error("主题包路径无效");
        total += entry.originalSize;
        if (total > 80 * 1024 * 1024) throw new Error("主题解压后超过 80 MB");
        return !entry.name.endsWith("/");
    } });
    const configName = Object.keys(files).find(name => name === "config.json" || /^[^/]+\/config\.json$/.test(name));
    if (!configName) throw new Error("主题缺少 config.json");
    const decode = (value: Uint8Array) => decodeURIComponent(Array.from(value, n => `%${n.toString(16).padStart(2, "0")}`).join(""));
    const config = JSON.parse(decode(files[configName]));
    if (typeof config.name !== "string") throw new Error("主题名称无效");
    const prefix = configName.slice(0, -"config.json".length);
    const id = CryptoJS.SHA256(encoded).toString().slice(0, 24);
    const destination = `${root}/${id}`;
    await RNFS.mkdir(destination);
    for (const [name, data] of Object.entries(files)) {
        const file = `${destination}/${name}`;
        await RNFS.mkdir(file.slice(0, file.lastIndexOf("/")));
        // Chunk conversion avoids argument/stack limits for video theme assets.
        let raw = "";
        for (let i = 0; i < data.length; i += 8192) raw += String.fromCharCode(...data.subarray(i, i + 8192));
        await RNFS.writeFile(file, Base64.btoa(raw), "base64");
    }
    const base = `${destination}/${prefix}`;
    const css = files[`${prefix}index.css`] ? decode(files[`${prefix}index.css`]) : "";
    const variables = Object.fromEntries(Array.from(css.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g), match => [match[1], match[2].replace(/\s*!important\s*$/i, "").trim()]));
    const colors: Record<string, string> = {};
    const mapping: Record<string, string> = { primaryColor: "primary", backgroundColor: "pageBackground", textColor: "text", textSecondaryColor: "textSecondary", backdropColor: "backdrop", dividerColor: "divider", placeholderColor: "placeholder", "primary-color": "primary", "text-color": "text", "background-color": "pageBackground", "music-bar-background-color": "musicBar", "app-background-color": "pageBackground" };
    for (const [desktop, native] of Object.entries(mapping)) if (variables[desktop] && /^(#|rgb|hsl)/.test(variables[desktop])) colors[native] = variables[desktop];
    const background = css.match(/url\(["']?@\/([^)'"\s]+)["']?\)/)?.[1];
    let htmlFile: string | undefined;
    if (config.iframe?.app?.startsWith("@/")) {
        const name = config.iframe.app.slice(2);
        if (!files[prefix + name]) throw new Error("主题动态背景文件缺失");
        const html = decode(files[prefix + name]).replaceAll("@/", `file://${base}`);
        htmlFile = `${base}mobile-background.html`;
        await RNFS.writeFile(htmlFile, html, "utf8");
    }
    Config.setConfig("theme.packHtml", htmlFile);
    Config.setConfig("theme.packRoot", base);
    Theme.setTheme(`pack-${id}`, { colors, background: { url: background ? `file://${base}${background}` : undefined, blur: 0, opacity: 0.65 } });
    return config.name;
}
