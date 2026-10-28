import axios from "axios";
import { compare } from "compare-versions";
import { Platform } from "react-native";
import DeviceInfo from "react-native-device-info";
export default async function checkUpdate() {
    try {
        const { data } = await axios.get("https://api.github.com/repos/thejidex/MusicFreeDesktop/releases/latest", { timeout: 8000 });
        const version = String(data.tag_name).replace(/^v/, "");
        const asset = data.assets?.find((item: any) => Platform.OS === "android" ? item.name.endsWith("-android-arm64.apk") : item.name.endsWith("-ios-unsigned.ipa"));
        if (asset && compare(version, DeviceInfo.getVersion(), ">")) return { needUpdate: true, data: { version, changeLog: [data.body || ""], download: [asset.browser_download_url, data.html_url] } };
    } catch { /* Offline operation is supported. */ }
}
