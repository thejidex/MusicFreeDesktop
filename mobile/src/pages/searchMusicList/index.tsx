import AppBar from "@/components/base/appBar";
import Input from "@/components/base/input";
import StatusBar from "@/components/base/statusBar";
import VerticalSafeAreaView from "@/components/base/verticalSafeAreaView";
import MusicBar from "@/components/musicBar";
import globalStyle from "@/constants/globalStyle";
import { fontSizeConst } from "@/constants/uiConst";
import { useI18N } from "@/core/i18n";
import { useParams } from "@/core/router";
import useColors from "@/hooks/useColors";
import rpx from "@/utils/rpx";
import React, { useState, useMemo } from "react";
import { library, useLibraryRevision } from "@/core/library";
import { StyleSheet } from "react-native";
import SearchResult from "./searchResult";

function filterMusic(query: string, musicList: IMusic.IMusicItem[]) {
    if (query?.length === 0) {
        return musicList;
    }
    return musicList.filter(_ =>
        `${_.title} ${_.artist} ${_.album} ${_.displaySource ?? _.platform}`
            .toLowerCase()
            .includes(query.toLowerCase()),
    );
}

export default function SearchMusicList() {
    const { musicList, musicSheet } = useParams<"search-music-list">();
    const [query, setQuery] = useState("");
    const revision = useLibraryRevision();
    const result = useMemo(() => filterMusic(query.trim(), (musicList ?? []).map(song => library.apply(song))), [musicList, query, revision]);

    const colors = useColors();
    const { t } = useI18N();

    const onChangeSearch = (_: string) => {
        setQuery(_);
    };

    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <StatusBar />
            <AppBar>
                <Input
                    style={style.searchBar}
                    fontColor={colors.appBarText}
                    placeholder={t("searchMusicList.searchPlaceHolder")}
                    accessible
                    autoFocus
                    accessibilityLabel="搜索框"
                    accessibilityHint={t("searchMusicList.searchLabel.a11y")}
                    value={query}
                    onChangeText={onChangeSearch}
                />
            </AppBar>
            <SearchResult result={result} musicSheet={musicSheet} />
            <MusicBar />
        </VerticalSafeAreaView>
    );
}

const style = StyleSheet.create({
    appbar: {
        shadowColor: "transparent",
        backgroundColor: "#2b333eaa",
    },
    searchBar: {
        minWidth: rpx(375),
        flex: 1,
        borderRadius: rpx(64),
        height: rpx(64),
        fontSize: rpx(32),
    },
    input: {
        padding: 0,
        color: "#666666",
        height: rpx(64),
        fontSize: fontSizeConst.subTitle,
        textAlignVertical: "center",
        includeFontPadding: false,
    },
});
