import React from "react";
import { ScrollView } from "react-native";
import ThemeText from "@/components/base/themeText";
import LinkText from "@/components/base/linkText";
import DeviceInfo from "react-native-device-info";
export default function AboutSetting() {
    return <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
        <ThemeText>MusicFree v{DeviceInfo.getVersion()}</ThemeText>
        <LinkText linkTo="https://github.com/maotoumao">原作者：猫头猫</LinkText>
        <LinkText linkTo="https://github.com/thejidex">thejidex GitHub</LinkText>
        <LinkText linkTo="https://github.com/thejidex/MusicFreeDesktop">本仓库（AGPL-3.0 源码与许可证）</LinkText>
    </ScrollView>;
}
