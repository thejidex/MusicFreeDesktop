import { importDesktopExchange, type DesktopImportOptions } from "@/renderer/core/playlist-exchange/import";
import { previewDesktopExchange } from "@/renderer/core/playlist-exchange/import";

/** Reads the unified format and converts legacy musicSheets backups before staging the import. */
async function resume(data: string | Record<string, any>, _overwrite?: boolean) {
    return importDesktopExchange(data);
}

const BackupResume = {
    resume,
    preview: previewDesktopExchange,
    importExchange: (data: string | Record<string, any>, options?: DesktopImportOptions) =>
        importDesktopExchange(data, options),
};

export default BackupResume;
