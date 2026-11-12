import {
    createMobileExchangeDocument,
    importMobileExchange,
    previewMobileExchange,
    saveMobileExchangePreview,
} from "./playlistExchange";
import { ResumeMode } from "@/constants/commonConst.ts";

function backup() {
    return JSON.stringify(createMobileExchangeDocument());
}

async function resume(
    raw: string | Object,
    resumeMode: ResumeMode = ResumeMode.Append,
) {
    const preview = previewMobileExchange(raw);
    const decisions: Record<string, { action: "merge" | "replace"; targetSheetId: string }> = Object.fromEntries(preview.matchedPlaylists.map(match => [match.sourceSheetId, {
        action: resumeMode === ResumeMode.Overwrite ? "replace" : "merge",
        targetSheetId: match.targetSheetId,
    }]));
    if (resumeMode === ResumeMode.OverwriteDefault) {
        const favorite = preview.document.playlists.find(playlist => playlist.isFavorite);
        if (favorite) {
            decisions[favorite.sourceSheetId] = {
                action: "replace",
                targetSheetId: decisions[favorite.sourceSheetId]?.targetSheetId ||
                    preview.matchedPlaylists.find(match => match.sourceSheetId === favorite.sourceSheetId)!.targetSheetId,
            };
        }
    }
    return importMobileExchange(preview, {
        decisions,
        metadataConflict: "keep-device",
        playCount: "keep-device",
        installMissingPlugins: true,
    });
}

const Backup = {
    backup,
    resume,
    previewExchange: previewMobileExchange,
    importExchange: importMobileExchange,
    saveExchangePreview: saveMobileExchangePreview,
};
export default Backup;
