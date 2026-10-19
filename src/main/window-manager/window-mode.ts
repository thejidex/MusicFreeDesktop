import type { BrowserWindow } from "electron";

const changingWindows = new WeakSet<BrowserWindow>();

/** Restore the normal window after leaving native fullscreen. */
export function exitWindowFullscreen(window: BrowserWindow) {
    if (!window.isFullScreen() || changingWindows.has(window)) return;
    changingWindows.add(window);
    window.once("leave-full-screen", () => {
        // Windows restores the pre-fullscreen maximized state after this event.
        // Unmaximize on the next turn, once the native transition has finished.
        setImmediate(() => {
            changingWindows.delete(window);
            if (!window.isDestroyed()) {
                window.unmaximize();
            }
        });
    });
    window.setFullScreen(false);
}

/** Normal → maximized (taskbar visible) → native fullscreen → normal. */
export function cycleWindowMode(window: BrowserWindow) {
    if (window.isDestroyed() || changingWindows.has(window)) return;
    if (window.isFullScreen()) {
        exitWindowFullscreen(window);
    } else if (window.isMaximized()) {
        changingWindows.add(window);
        window.once("enter-full-screen", () => changingWindows.delete(window));
        window.setFullScreen(true);
    } else {
        window.maximize();
    }
}
