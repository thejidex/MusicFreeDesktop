import "./index.scss";
import MusicSheet from "@/renderer/core/music-sheet";
import { toast } from "react-toastify";
import InputSettingItem from "../../components/InputSettingItem";
import { AuthType, createClient } from "webdav";
import BackupResume from "@/renderer/core/backup-resume";
import { useTranslation } from "react-i18next";
import AppConfig from "@shared/app-config/renderer";
import { dialogUtil, fsUtil } from "@shared/utils/renderer";
import { createDesktopExchangeDocument } from "@/renderer/core/playlist-exchange";
import { showModal } from "@/renderer/components/Modal";



export default function Backup() {
    const { t } = useTranslation();

    async function createBackupJson() {
        const sheets = MusicSheet.frontend.getAllSheets();
        return JSON.stringify(await createDesktopExchangeDocument(sheets.map(sheet => sheet.id)));
    }


    async function onBackupClick() {
        const url = AppConfig.getConfig("backup.webdav.url");
        const username = AppConfig.getConfig("backup.webdav.username");
        const password = AppConfig.getConfig("backup.webdav.password");

        try {
            if (
                url && username && password
            ) {
                const client = createClient(url, {
                    authType: AuthType.Password,
                    username: username,
                    password: password,
                });
                const backUp = await createBackupJson();
                if (!(await client.exists("/MusicFree"))) {
                    await client.createDirectory("/MusicFree");
                }
                // 临时文件
                await client.putFileContents(
                    "/MusicFree/MusicFreeBackup.json",
                    backUp,
                    {
                        overwrite: true,
                    },
                );
                toast.success(t("settings.backup.backup_success"));
            } else {
                toast.error(t("settings.backup.webdav_data_not_complete"));
            }
        } catch (e) {
            toast.error(
                t("settings.backup.backup_fail", {
                    reason: e?.message,
                }),
            );
        }
    }

    async function onResumeClick() {
        const url = AppConfig.getConfig("backup.webdav.url");
        const username = AppConfig.getConfig("backup.webdav.username");
        const password = AppConfig.getConfig("backup.webdav.password");
        try {
            if (
                url &&
                username &&
                password
            ) {
                const client = createClient(url, {
                    authType: AuthType.Password,
                    username: username,
                    password: password,
                });

                if (!(await client.exists("/MusicFree/MusicFreeBackup.json"))) {
                    throw new Error(
                        t("settings.backup.webdav_backup_file_not_exist"),
                    );
                }
                const resumeData = await client.getFileContents(
                    "/MusicFree/MusicFreeBackup.json",
                    {
                        format: "text",
                    },
                );
                await BackupResume.resume(
                                    resumeData,
                );
                toast.success(t("settings.backup.resume_success"));
            } else {
                toast.error(t("settings.backup.webdav_data_not_complete"));
            }
        } catch (e) {
            toast.error(
                t("settings.backup.resume_fail", {
                    reason: e?.message,
                }),
            );
        }

    }

    return (
        <div className="setting-view--backup-container">
            <div className={"label-container"}>
                {t("settings.backup.backup_by_file")}
            </div>
            <div className="setting-row backup-row">
                <div
                    role="button"
                    data-type="normalButton"
                    onClick={async () => {
                        const result = await dialogUtil.showSaveDialog({
                            properties: ["showOverwriteConfirmation", "createDirectory"],
                            filters: [
                                {
                                    name: t("settings.backup.musicfree_backup_file"),
                                    extensions: ["json", "txt"],
                                },
                            ],
                            title: t("settings.backup.backup_to"),
                        });
                        if (!result.canceled && result.filePath) {
                            const backUp = await createBackupJson();
                            await fsUtil.writeFile(result.filePath, backUp, "utf-8");
                            toast.success(t("settings.backup.backup_success"));
                        }
                    }}
                >
                    {t("settings.backup.backup_music_sheet")}
                </div>
                <div
                    role="button"
                    data-type="normalButton"
                    onClick={() => showModal("SendToPhone")}
                >
                    发送歌单到手机
                </div>
                <div
                    role="button"
                    data-type="normalButton"
                    onClick={async () => {
                        const result = await dialogUtil.showOpenDialog({
                            properties: ["openFile"],
                            filters: [
                                {
                                    name: t("settings.backup.musicfree_backup_file"),
                                    extensions: ["json", "txt"],
                                },
                            ],
                            title: t("common.open"),
                        });
                        if (!result.canceled && result.filePaths) {
                            try {
                                const rawSheets = (await fsUtil.readFile(
                                    result.filePaths[0],
                                    "utf-8",
                                )) as string;

                                await BackupResume.resume(
                                    rawSheets,
                                );

                                toast.success(t("backup.backup_success"));
                            } catch (e) {
                                toast.error(
                                    t("backup.backup_fail", {
                                        reason: e?.message,
                                    }),
                                );
                            }
                        }
                    }}
                >
                    {t("settings.backup.resume_music_sheet")}
                </div>
            </div>
            <div className={"label-container setting-row"}>
                {t("settings.backup.backup_by_webdav")}
            </div>
            <div className="webdav-backup-container">
                <InputSettingItem
                    width="100%"
                    label={t("settings.backup.webdav_server_url")}
                    trim
                    keyPath="backup.webdav.url"
                ></InputSettingItem>
                <InputSettingItem
                    width="100%"
                    label={t("settings.backup.username")}
                    trim
                    keyPath="backup.webdav.username"
                ></InputSettingItem>
                <InputSettingItem
                    width="100%"
                    label={t("settings.backup.password")}
                    type="password"
                    trim
                    keyPath="backup.webdav.password"
                ></InputSettingItem>
            </div>
            <div className="setting-row backup-row">
                <div
                    role="button"
                    data-type="normalButton"
                    onClick={onBackupClick}
                >
                    {t("settings.backup.backup_music_sheet")}
                </div>
                <div
                    role="button"
                    data-type="normalButton"
                    onClick={onResumeClick}
                >
                    {t("settings.backup.resume_music_sheet")}
                </div>
            </div>
        </div>
    );
}
