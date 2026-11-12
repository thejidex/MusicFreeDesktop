import { contextBridge, ipcRenderer } from "electron";

const mod = {
    start: (payload: unknown) => ipcRenderer.invoke("@shared/playlist-exchange/start", payload),
    stop: (sessionId: string) => ipcRenderer.invoke("@shared/playlist-exchange/stop", sessionId),
};

contextBridge.exposeInMainWorld("@shared/playlist-exchange", mod);
