import React, { useEffect, useRef, useState } from "react";
import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import bootstrap from "./bootstrap/bootstrap";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Dialogs from "@/components/dialogs";
import Panels from "@/components/panels";
import PageBackground from "@/components/base/pageBackground";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Debug from "@/components/debug";
import { PortalHost } from "@/components/base/portal";
import globalStyle from "@/constants/globalStyle";
import Theme from "@/core/theme";
import { BootstrapComponent } from "./bootstrap/BootstrapComponent";
import { ToastBaseComponent } from "@/components/base/toast";
import { DeviceEventEmitter, NativeModules, StatusBar } from "react-native";
import { ReduceMotion, ReducedMotionConfig } from "react-native-reanimated";
import { routes } from "@/core/router/routes.tsx";
import ErrorBoundary from "@/components/errorBoundary";
import { useAtomValue } from "jotai";
import bootstrapAtom from "./bootstrap/bootstrap.atom";
import Backup from "@/core/backup";
import { ROUTE_PATH } from "@/core/router";
import Toast from "@/utils/toast";

/**
 * 字体颜色
 */

StatusBar.setBackgroundColor("transparent");
StatusBar.setTranslucent(true);

bootstrap();
const Stack = createNativeStackNavigator<any>();

export default function Pages() {
    const theme = Theme.useTheme();

    return (
        <ErrorBoundary>
            <BootstrapComponent />
            <ReducedMotionConfig mode={ReduceMotion.Never} />
            <GestureHandlerRootView style={globalStyle.flex1}>
                <SafeAreaProvider>
                    <NavigationContainer theme={theme}>
                        <PageBackground />
                        <Stack.Navigator
                            initialRouteName={routes[0].path}
                            screenOptions={{
                                headerShown: false,
                                animation: "slide_from_right",
                                animationDuration: 100,
                            }}>
                            {routes.map(route => (
                                <Stack.Screen
                                    key={route.path}
                                    name={route.path}
                                    component={route.component}
                                />
                            ))}
                        </Stack.Navigator>                        
                        <SharedPlaylistIntentBridge />
                        <Panels />
                        <Dialogs />
                        <Debug />
                        <ToastBaseComponent />
                        <PortalHost />
                    </NavigationContainer>
                </SafeAreaProvider>
            </GestureHandlerRootView>
        </ErrorBoundary>
    );
}

function SharedPlaylistIntentBridge() {
    const navigation = useNavigation<any>();
    const bootstrapState = useAtomValue(bootstrapAtom);
    const [sharedContent, setSharedContent] = useState<string | null>(null);
    const handled = useRef(false);

    useEffect(() => {
        const module = NativeModules.PlaylistShare;
        if (!module) return;
        const subscription = DeviceEventEmitter.addListener("MusicFreeSharedPlaylist", (raw: string) => {
            handled.current = false;
            setSharedContent(raw);
        });
        const errorSubscription = DeviceEventEmitter.addListener("MusicFreeSharedPlaylistError", (message: string) => {
            Toast.warn(`无法读取分享文件：${message}`);
        });
        module.getInitialSharedPlaylist()
            .then((raw: string | null) => { if (raw) setSharedContent(raw); })
            .catch((error: any) => Toast.warn(`无法读取分享文件：${error?.message || error}`));
        return () => {
            subscription.remove();
            errorSubscription.remove();
        };
    }, []);

    useEffect(() => {
        if (!sharedContent || bootstrapState.state !== "Done" || handled.current) return;
        handled.current = true;
        try {
            const preview = Backup.previewExchange(sharedContent);
            const previewId = Backup.saveExchangePreview(preview);
            navigation.navigate(ROUTE_PATH.PLAYLIST_EXCHANGE_PREVIEW, { previewId });
            NativeModules.PlaylistShare?.clearInitialSharedPlaylist?.().catch(() => {});
        } catch (error: any) {
            Toast.warn(`分享文件无法导入：${error?.message || error}`);
        } finally {
            setSharedContent(null);
        }
    }, [bootstrapState.state, navigation, sharedContent]);

    return null;
}
