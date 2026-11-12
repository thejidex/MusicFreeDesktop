import ListItem, { ListItemHeader } from "@/components/base/listItem";
import Backup from "@/core/backup";
import { ROUTE_PATH, useNavigate } from "@/core/router";
import Toast from "@/utils/toast";
import React from "react";
import { ScrollView, StyleSheet } from "react-native";

import { showDialog } from "@/components/dialogs/useDialog";
import { showPanel } from "@/components/panels/usePanel";
import axios from "axios";

import Config, { useAppConfig } from "@/core/appConfig";
import { useI18N } from "@/core/i18n";
import { writeInChunks } from "@/utils/fileUtils.ts";
import { errorLog } from "@/utils/log.ts";
import { getDocumentAsync } from "expo-document-picker";
import { readAsStringAsync } from "expo-file-system/legacy";
import { AuthType, createClient } from "webdav";

export default function BackupSetting() {
    const { t } = useI18N();
    const navigate = useNavigate();

    const webdavUrl = useAppConfig("webdav.url");
    const webdavUsername = useAppConfig("webdav.username");
    const webdavPassword = useAppConfig("webdav.password");

    function openImportPreview(raw: string | unknown) {
        const preview = Backup.previewExchange(raw);
        const previewId = Backup.saveExchangePreview(preview);
        navigate(ROUTE_PATH.PLAYLIST_EXCHANGE_PREVIEW, { previewId });
    }


    const onBackupToLocal = async () => {
        navigate(ROUTE_PATH.FILE_SELECTOR, {
            fileType: "folder",
            multi: false,
            actionText: t("backupAndResume.beginBackup"),
            async onAction(selectedFiles) {
                const raw = Backup.backup();
                const folder = selectedFiles[0]?.path;
                return new Promise(resolve => {
                    showDialog("LoadingDialog", {
                        title: t("backupAndResume.backupDialogTitle"),
                        loadingText: t("backupAndResume.backuping"),
                        promise: writeInChunks(
                            `${folder}${folder?.endsWith("/") ? "" : "/"
                            }backup.json`,
                            raw,
                        ),
                        onResolve(_, hideDialog) {
                            Toast.success(t("toast.backupSuccess"));
                            hideDialog();
                            resolve(true);
                        },
                        onCancel(hideDialog) {
                            hideDialog();
                            resolve(false);
                        },
                        onReject(reason, hideDialog) {
                            hideDialog();
                            resolve(false);
                            console.log(reason);
                            Toast.warn(t("toast.backupFail", { reason: reason?.message ?? reason }));
                        },
                    });
                });
            },
        });
    };

    async function onResumeFromLocal() {
        try {
            const pickResult = await getDocumentAsync({
                copyToCacheDirectory: true,
                type: "application/json",
            });
            if (pickResult.canceled) {
                return;
            }
            const result = await readAsStringAsync(pickResult.assets[0].uri);
            openImportPreview(result);
        } catch (e: any) {
            errorLog("恢复失败", e);
            Toast.warn(t("toast.resumeFail", { reason: e?.message ?? e }));
        }
    }

    async function onResumeFromUrl() {
        showPanel("SimpleInput", {
            title: t("backupAndResume.resumeFromUrlDialogTitle"),
            placeholder: t("backupAndResume.resumeFromUrlDialogPlaceHolder"),
            maxLength: 1024,
            async onOk(text, closePanel) {
                try {
                    const url = text.trim();
                    if (!/^https?:\/\//i.test(url)) {
                        throw "无效的URL";
                    }
                    const raw = (await axios.get(url)).data;
                    openImportPreview(raw);
                    closePanel();
                } catch (e: any) {
                    Toast.warn(t("toast.resumeFail", { reason: e?.message ?? e }));
                }
            },
        });
    }

    async function onResumeFromWebdav() {
        const url = Config.getConfig("webdav.url");
        const username = Config.getConfig("webdav.username");
        const password = Config.getConfig("webdav.password");

        if (!(username && password && url)) {
            Toast.warn(t("toast.resumePreCheckFailed"));
            return;
        }
        const client = createClient(url, {
            authType: AuthType.Password,
            username: username,
            password: password,
        });

        if (!(await client.exists("/MusicFree/MusicFreeBackup.json"))) {
            Toast.warn(t("toast.backupFileNotFound"));
            return;
        }

        try {
            const resumeData = await client.getFileContents(
                "/MusicFree/MusicFreeBackup.json",
                {
                    format: "text",
                },
            );
            openImportPreview(resumeData);
        } catch (e: any) {
            Toast.warn(t("toast.resumeFail", { reason: e?.message ?? e }));
        }
    }

    async function onBackupToWebdav() {
        const username = Config.getConfig("webdav.username");
        const password = Config.getConfig("webdav.password");
        const url = Config.getConfig("webdav.url");
        if (!(username && password && url)) {
            Toast.warn(t("toast.resumePreCheckFailed"));
            return;
        }
        try {
            const client = createClient(url, {
                authType: AuthType.Password,
                username: username,
                password: password,
            });

            const raw = Backup.backup();
            if (!(await client.exists("/MusicFree"))) {
                await client.createDirectory("/MusicFree");
            }
            // 临时文件
            await client.putFileContents(
                "/MusicFree/MusicFreeBackup.json",
                raw,
                {
                    overwrite: true,
                },
            );
            Toast.success(t("toast.backupSuccess"));
        } catch (e: any) {
            Toast.warn(t("toast.backupFail", { reason: e?.message ?? e }));
        }
    }

    return (
        <ScrollView style={style.wrapper}>
            <ListItemHeader>{t("sidebar.backupAndResume")}</ListItemHeader>

            <ListItemHeader>电脑歌单接收</ListItemHeader>
            <ListItem withHorizontalPadding onPress={() => navigate(ROUTE_PATH.PLAYLIST_EXCHANGE_RECEIVE)}>
                <ListItem.Content title="从电脑接收（扫码或粘贴连接地址）" />
            </ListItem>

            <ListItemHeader>{t("backupAndResume.localBackup")}</ListItemHeader>
            <ListItem withHorizontalPadding onPress={onBackupToLocal}>
                <ListItem.Content title={t("backupAndResume.backupToLocal")} />
            </ListItem>
            <ListItem withHorizontalPadding onPress={onResumeFromLocal}>
                <ListItem.Content title={t("backupAndResume.resumeFromLocalFile")} />
            </ListItem>
            <ListItem withHorizontalPadding onPress={onResumeFromUrl}>
                <ListItem.Content title={t("backupAndResume.resumeFromUrlDialogTitle")} />
            </ListItem>
            <ListItemHeader>Webdav</ListItemHeader>
            <ListItem
                withHorizontalPadding
                onPress={() => {
                    showPanel("SetUserVariables", {
                        title: t("backupAndResume.webdavSettings"),
                        initValues: {
                            url: webdavUrl ?? "",
                            username: webdavUsername ?? "",
                            password: webdavPassword ?? "",
                        },
                        variables: [
                            {
                                key: "url",
                                name: "URL",
                                hint: t("backupAndResume.webdavUrl"),
                            },
                            {
                                key: "username",
                                name: t("common.username"),
                            },
                            {
                                key: "password",
                                name: t("common.password"),
                            },
                        ],
                        onOk(values, closePanel) {
                            Config.setConfig("webdav.url", values?.url);
                            Config.setConfig("webdav.username", values?.username);
                            Config.setConfig("webdav.password", values?.password);

                            Toast.success(t("toast.saveSuccess"));
                            closePanel();
                        },
                    });
                }}>
                <ListItem.Content title={t("backupAndResume.webdavSettings")} />
            </ListItem>
            <ListItem withHorizontalPadding onPress={onBackupToWebdav}>
                <ListItem.Content title={t("backupAndResume.backupToWebdav")} />
            </ListItem>
            <ListItem withHorizontalPadding onPress={onResumeFromWebdav}>
                <ListItem.Content title={t("backupAndResume.resumeFromWebdav")} />
            </ListItem>
        </ScrollView>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: "100%",
        flex: 1,
    },
});
