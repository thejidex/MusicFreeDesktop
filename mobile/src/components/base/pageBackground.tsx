import React, { memo, useEffect, useRef } from "react";
import { StyleSheet, View, AppState } from "react-native";
import WebView from "react-native-webview";
import { useAppConfig } from "@/core/appConfig";
import Image from "./image";
import useColors from "@/hooks/useColors";
import Theme from "@/core/theme";

function PageBackground() {
    const theme = Theme.useTheme();
    const background = Theme.useBackground();
    const colors = useColors();
    const packHtml = useAppConfig("theme.packHtml");
    const packRoot = useAppConfig("theme.packRoot");
    const web = useRef<WebView>(null);
    useEffect(() => {
        const listener = AppState.addEventListener("change", state => {
            web.current?.injectJavaScript(`document.querySelectorAll('video').forEach(v=>v.${state === "active" ? "play" : "pause"}());true;`);
        });
        return () => listener.remove();
    }, []);

    return (
        <>
            <View
                style={[
                    style.wrapper,
                    {
                        backgroundColor:
                            colors?.pageBackground ?? colors.background,
                    },
                ]}
            />
            {theme.id.startsWith("pack-") && packHtml && packRoot ? <View pointerEvents="none" style={style.wrapper}>
                <WebView ref={web} source={{ uri: `file://${packHtml}` }} style={{ flex: 1, backgroundColor: "transparent" }}
                    originWhitelist={["file://*"]} allowFileAccess allowingReadAccessToURL={`file://${packRoot}`}
                    allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} scrollEnabled={false}
                    onShouldStartLoadWithRequest={request => request.url.startsWith(`file://${packRoot}`)} />
            </View> : null}
            {!theme.id.startsWith("p-") && background?.url ? (
                <Image
                    uri={background.url}
                    style={[
                        style.wrapper,
                        {
                            opacity: background?.opacity ?? 0.6,
                        },
                    ]}
                    blurRadius={background?.blur ?? 20}
                />
            ) : null}
        </>
    );
}
export default memo(PageBackground, () => true);

const style = StyleSheet.create({
    wrapper: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
    },
});
