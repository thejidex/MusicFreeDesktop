import { atom, getDefaultStore, useAtomValue } from "jotai";
import getOrCreateMMKV from "@/utils/getOrCreateMMKV";
import { LibraryData } from "./library-data";

const revision = atom(0);
export const library = new LibraryData(getOrCreateMMKV("musicfree.library"), () => {
    const store = getDefaultStore();
    store.set(revision, store.get(revision) + 1);
});
export function useLibraryRevision() {
    return useAtomValue(revision); 
}
export function useEditedSong<T extends IMusic.IMusicItem>(song: T) {
    useLibraryRevision();
    return library.apply(song);
}
