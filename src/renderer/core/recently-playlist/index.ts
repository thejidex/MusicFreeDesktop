import { isSameMedia } from "@/common/media-util";
import Store from "@/common/store";
import {
    getUserPreferenceIDB,
    setUserPreferenceIDB,
} from "@/renderer/utils/user-perference";
import { Immer } from "immer";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

const recentlyPlayListStore = new Store<IMusic.IMusicItem[]>([]);

const immer = new Immer({
    autoFreeze: false,
});

const HARD_LIMIT = 500;

async function fetchRecentlyPlaylist() {
    return (await getUserPreferenceIDB("recentlyPlayList")) || [];
}

async function setRecentlyPlaylist(musicItems: IMusic.IMusicItem[]) {
    recentlyPlayListStore.setValue(musicItems);
    return await setUserPreferenceIDB("recentlyPlayList", musicItems);
}

export async function setupRecentlyPlaylist() {
    const playList = (await fetchRecentlyPlaylist()).filter(it => !!it);

    recentlyPlayListStore.setValue(playList);
}

export async function addToRecentlyPlaylist(musicItem: IMusic.IMusicItem) {
    if (!musicItem || !musicItem.id || !musicItem.platform) {
        return;
    }

    const playList = recentlyPlayListStore.getValue();
    const existId = playList.findIndex((it) => isSameMedia(musicItem, it));
    let newPlayList = playList;

    if (existId !== -1) {
        newPlayList = immer.produce(playList, (draft) => {
            draft.splice(existId, 1);
        });
    }
    newPlayList = [musicItem].concat(newPlayList).slice(0, HARD_LIMIT);
    setRecentlyPlaylist(newPlayList);
}

export async function removeRecentlyPlayList(musicItem: IMusic.IMusicItem) {
    const playList = recentlyPlayListStore.getValue();
    const existId = playList.findIndex((it) => isSameMedia(musicItem, it));
    let newPlayList = playList;

    if (existId !== -1) {
        newPlayList = immer.produce(playList, (draft) => {
            draft.splice(existId, 1);
        });
        setRecentlyPlaylist(newPlayList);
    }
}

/** 同步已编辑的歌曲信息，保留最近播放的原有顺序。 */
export async function updateRecentlyPlayedMusicMetadata(musicItem: IMusic.IMusicItem) {
    const playList = recentlyPlayListStore.getValue();
    if (!playList.some((item) => isSameMedia(item, musicItem))) {
        return;
    }
    await setRecentlyPlaylist(playList.map((item) => isSameMedia(item, musicItem)
        ? { ...item, ...musicItem.$$metadataOverrides, $$metadataOverrides: musicItem.$$metadataOverrides }
        : item,
    ));
}

export async function clearRecentlyPlaylist() {
    setRecentlyPlaylist([]);
}

export function useRecentlyPlaylistSheet() {
    const recentlyPlayList = recentlyPlayListStore.useValue();
    const { t } = useTranslation();

    const musicSheet: IMusic.IMusicSheetItem = useMemo(() => {
        return {
            id: "recently-play",
            title: t("side_bar.recently_play"),
            platform: "recently-play",
            playCount: recentlyPlayList?.length || 0,
            artwork: recentlyPlayList?.[0]?.artwork,
            musicList: recentlyPlayList || [],
        };
    }, [recentlyPlayList, t]);

    return musicSheet;
}
