import { NativeModule, NativeModules, Dimensions } from "react-native";

interface INativeUtils extends NativeModule {
    exitApp: () => void;
    checkStoragePermission: () => Promise<boolean>;
    requestStoragePermission: () => void;
    getWindowDimensions: () => { width: number, height: number }; // Fix bug: https://github.com/facebook/react-native/issues/47080
}

const NativeUtils: INativeUtils = NativeModules.NativeUtils ?? {
    exitApp: () => {}, // iOS closes playback; applications cannot terminate themselves.
    checkStoragePermission: async () => true, // Files selected through the system picker.
    requestStoragePermission: () => {},
    getWindowDimensions: () => Dimensions.get("window"),
};

export default NativeUtils as INativeUtils;
