import React, { useMemo, useState } from "react";
import { Pressable } from "react-native";
import ThemeText from "@/components/base/themeText";
import { library, useLibraryRevision } from "@/core/library";
import { useAppConfig } from "@/core/appConfig";
import Header from "./header";
import MusicList from "@/components/musicList";
import { useParams } from "@/core/router";
import HorizontalSafeAreaView from "@/components/base/horizontalSafeAreaView.tsx";
import globalStyle from "@/constants/globalStyle";
import { useSheetItem } from "@/core/musicSheet";
import { RequestStateCode } from "@/constants/commonConst";
import { useCurrentMusic } from "@/core/trackPlayer";

export default function SheetMusicList() {
    const { id = "favorite" } = useParams<"local-sheet-detail">();
    const musicSheet = useSheetItem(id);
    const currentMusic = useCurrentMusic();

    const revision = useLibraryRevision();
    const showCounts = useAppConfig("library.showPlayCounts");
    const [countSort, setCountSort] = useState(0);
    const musicList = useMemo(() => countSort && showCounts
        ? [...(musicSheet?.musicList ?? [])].sort((a,b) => countSort === 1 ? library.count(a)-library.count(b) : library.count(b)-library.count(a))
        : musicSheet?.musicList, [musicSheet?.musicList, countSort, showCounts, revision]);
    return (
        <HorizontalSafeAreaView style={globalStyle.flex1}>
            <MusicList
                Header={<><Header />{showCounts ? <Pressable onPress={() => setCountSort((countSort + 1) % 3)} style={{ padding: 16 }}><ThemeText>播放次数：{["原顺序", "升序", "降序"][countSort]}（点击切换）</ThemeText></Pressable> : null}</>}
                musicList={musicList}
                musicSheet={musicSheet}
                showIndex
                state={RequestStateCode.IDLE}
                highlightMusicItem={currentMusic}

            />
        </HorizontalSafeAreaView>
    );
}
