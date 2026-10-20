import { KeyboardEvent, MutableRefObject } from "react";

interface IMusicListNavigationOptions {
    activeItems: ReadonlySet<number>;
    lastActiveIndexRef: MutableRefObject<number>;
    itemCount: number;
    setActiveItems: (items: Set<number>) => void;
    scrollToIndex: (index: number) => void;
}

/** Move the clicked list's selection without triggering playback shortcuts. */
export function handleMusicListNavigation(
    event: KeyboardEvent<HTMLElement>,
    options: IMusicListNavigationOptions,
) {
    const { activeItems, lastActiveIndexRef, itemCount, setActiveItems, scrollToIndex } = options;
    if (
        (event.key !== "ArrowUp" && event.key !== "ArrowDown") ||
        event.target !== event.currentTarget ||
        event.currentTarget.ownerDocument.activeElement !== event.currentTarget ||
        event.defaultPrevented || event.nativeEvent.isComposing ||
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        activeItems.size === 0 || itemCount === 0
    ) {
        return;
    }

    const direction = event.key === "ArrowDown" ? 1 : -1;
    let currentIndex = lastActiveIndexRef.current;
    if (!activeItems.has(currentIndex) || currentIndex < 0 || currentIndex >= itemCount) {
        currentIndex = -1;
        activeItems.forEach(index => {
            if (index >= 0 && index < itemCount &&
                (currentIndex < 0 || (direction > 0 ? index > currentIndex : index < currentIndex))) {
                currentIndex = index;
            }
        });
    }
    if (currentIndex < 0) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    const nextIndex = Math.max(0, Math.min(itemCount - 1, currentIndex + direction));
    lastActiveIndexRef.current = nextIndex;
    setActiveItems(new Set([nextIndex]));

    const row = event.currentTarget.querySelector<HTMLElement>(`[data-song-index="${nextIndex}"]`);
    if (row) {
        row.scrollIntoView({ block: "nearest", inline: "nearest" });
    } else {
        // Virtual rows outside the rendered window must be scrolled into it first.
        scrollToIndex(nextIndex);
    }
}
