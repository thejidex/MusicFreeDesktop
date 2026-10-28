import React from "react";
import * as DocumentPicker from "expo-document-picker";
import RNFS from "react-native-fs";
import pathConst from "@/constants/pathConst";
import LocalMusicSheet from "@/core/localMusicSheet";
import { ROUTE_PATH, useNavigate } from "@/core/router";
import LocalMusicList from "./localMusicList";
import MusicBar from "@/components/musicBar";
import { localMusicSheetId } from "@/constants/commonConst";
import Toast from "@/utils/toast";
import { showDialog } from "@/components/dialogs/useDialog";
import AppBar from "@/components/base/appBar";
import { useI18N } from "@/core/i18n";

export default function MainPage() {
    const navigate = useNavigate();
    const { t } = useI18N();

    return (
        <>
            <AppBar
                withStatusBar
                actions={[
                    {
                        icon: "magnifying-glass",
                        onPress() {
                            navigate(ROUTE_PATH.SEARCH_MUSIC_LIST, {
                                musicList: LocalMusicSheet.getMusicList(),
                            });
                        },
                    },
                ]}
                menu={[
                    { icon: "folder-plus", title: "从文件导入音乐", async onPress() {
                        try {
                            const result = await DocumentPicker.getDocumentAsync({ type: "audio/*", multiple: true, copyToCacheDirectory: true });
                            if (result.canceled) return;
                            const folder = `${pathConst.basePath}/imported-music`;
                            await RNFS.mkdir(folder);
                            const files: string[] = [];
                            for (const [index, asset] of result.assets.entries()) {
                                const destination = `${folder}/${Date.now()}-${index}-${asset.name.replace(/[^\p{L}\p{N}._-]/gu, "_")}`;
                                await RNFS.copyFile(asset.uri, destination);
                                files.push(destination);
                            }
                            await LocalMusicSheet.importLocal(files);
                            Toast.success("本地音乐导入成功");
                        } catch (error: any) {
                            Toast.warn(`导入失败：${error.message}`); 
                        }
                    } },
                    {
                        icon: "magnifying-glass",
                        title: t("localMusic.scanLocalMusic"),
                        async onPress() {
                            navigate(ROUTE_PATH.FILE_SELECTOR, {
                                fileType: "folder",
                                multi: true,
                                actionText: t("localMusic.beginScan"),
                                async onAction(selectedFiles) {
                                    return new Promise(resolve => {
                                        showDialog("LoadingDialog", {
                                            title: t("localMusic.scanLocalMusic"),
                                            promise:
                                                LocalMusicSheet.importLocal(
                                                    selectedFiles.map(
                                                        _ => _.path,
                                                    ),
                                                ),
                                            onResolve(data, hideDialog) {
                                                Toast.success(t("toast.importSuccess"));
                                                hideDialog();
                                                resolve(true);
                                            },
                                            onCancel(hideDialog) {
                                                LocalMusicSheet.cancelImportLocal();
                                                hideDialog();
                                                resolve(false);
                                            },
                                        });
                                    });
                                },
                            });
                        },
                    },
                    {
                        icon: "pencil-square",
                        title: t("common.batchEdit"),
                        async onPress() {
                            navigate(ROUTE_PATH.MUSIC_LIST_EDITOR, {
                                musicList: LocalMusicSheet.getMusicList(),
                                musicSheet: {
                                    id: localMusicSheetId,
                                },
                            });
                        },
                    },
                    {
                        icon: "arrow-down-tray",
                        title: t("localMusic.downloadList"),
                        async onPress() {
                            navigate(ROUTE_PATH.DOWNLOADING);
                        },
                    },
                ]}>
                {t("home.localMusic")}
            </AppBar>
            <LocalMusicList />
            <MusicBar />
        </>
    );
}
