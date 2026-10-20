import { FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import MusicSheet from "@/renderer/core/music-sheet";
import useMounted from "@/hooks/useMounted";
import { hideModal } from "../..";
import Base from "../Base";
import "./index.scss";

interface IEditMusicProps {
    musicItem: IMusic.IMusicItem;
    sheetId: string;
}

export default function EditMusic({ musicItem, sheetId }: IEditMusicProps) {
    const { t } = useTranslation();
    const isMounted = useMounted();
    const returnFocusRef = useRef<{
        element: HTMLElement;
        selectionScope: string | null;
    }>();
    if (!returnFocusRef.current && document.activeElement instanceof HTMLElement) {
        const element = document.activeElement;
        returnFocusRef.current = { element, selectionScope: element.getAttribute("data-selection-scope") };
    }
    const [saving, setSaving] = useState(false);
    const [metadata, setMetadata] = useState<IMusic.IMusicMetadata>({
        title: musicItem.title ?? "",
        artist: musicItem.artist ?? "",
        album: musicItem.album ?? "",
        displayPlatform: musicItem.$$displayPlatform ?? musicItem.platform,
    });

    useEffect(() => () => {
        const origin = returnFocusRef.current;
        requestAnimationFrame(() => {
            const element = origin?.element;
            if (!element?.isConnected || !element.getClientRects().length ||
                element.getAttribute("data-selection-scope") !== origin.selectionScope ||
                document.getElementById("components--modal-base-container")) {
                return;
            }
            const focusedElement = document.activeElement;
            if (focusedElement && focusedElement !== document.body && focusedElement !== element && focusedElement.isConnected) {
                return;
            }
            element.focus({ preventScroll: true });
        });
    }, []);

    const fields: Array<{ key: keyof IMusic.IMusicMetadata; label: string }> = [
        { key: "title", label: t("media.media_title") },
        { key: "artist", label: t("media.media_type_artist") },
        { key: "album", label: t("media.media_type_album") },
        { key: "displayPlatform", label: t("media.media_platform") },
    ];

    const save = async (event: FormEvent) => {
        event.preventDefault();
        if (saving || !metadata.title.trim()) {
            return;
        }
        setSaving(true);
        try {
            await MusicSheet.frontend.updateMusicMetadata(musicItem, sheetId, metadata);
            toast.success(t("modal.edit_music_success"));
            if (isMounted.current) {
                hideModal();
            }
        } catch {
            toast.error(t("modal.edit_music_fail"));
        } finally {
            if (isMounted.current) {
                setSaving(false);
            }
        }
    };

    return (
        <Base withBlur={false}>
            <form
                className="modal--edit-music shadow backdrop-color"
                role="dialog"
                aria-modal="true"
                aria-labelledby="edit-music-title"
                onSubmit={save}
                onKeyDown={(event) => {
                    if (event.key === "Escape" && !saving) {
                        hideModal();
                    }
                }}
            >
                <Base.Header><span id="edit-music-title">{t("music_list_context_menu.edit_music")}</span></Base.Header>
                <div className="edit-music-fields">
                    {fields.map(({ key, label }) => (
                        <label key={key} htmlFor={`edit-music-${key}`}>
                            <span>{label}</span>
                            <input
                                id={`edit-music-${key}`}
                                autoFocus={key === "title"}
                                required={key === "title"}
                                disabled={saving}
                                value={metadata[key]}
                                aria-describedby={key === "displayPlatform" ? "edit-music-source-hint" : undefined}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    setMetadata((current) => ({ ...current, [key]: value }));
                                }}
                            />
                        </label>
                    ))}
                    <p id="edit-music-source-hint">{t("modal.edit_music_source_hint")}</p>
                    <p>{t("modal.edit_music_shared_hint")}</p>
                </div>
                <div className="edit-music-actions">
                    <button type="button" disabled={saving} onClick={hideModal}>{t("common.cancel")}</button>
                    <button type="submit" className="primary" disabled={saving || !metadata.title.trim()}>
                        {saving ? t("common.loading") : t("common.save")}
                    </button>
                </div>
            </form>
        </Base>
    );
}
