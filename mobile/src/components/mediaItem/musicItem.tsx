import React from "react";
import timeformat from "@/utils/timeformat";
import { useEditedSong, library } from "@/core/library";
import { useAppConfig } from "@/core/appConfig";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import rpx from "@/utils/rpx";
import ListItem from "../base/listItem";

import LocalMusicSheet from "@/core/localMusicSheet";
import { showPanel } from "../panels/usePanel";
import TitleAndTag from "./titleAndTag";
import ThemeText from "../base/themeText";
import TrackPlayer from "@/core/trackPlayer";
import Icon from "@/components/base/icon.tsx";

interface IMusicItemProps {
    index?: string | number;
    showMoreIcon?: boolean;
    musicItem: IMusic.IMusicItem;
    musicSheet?: IMusic.IMusicSheetItem;
    onItemPress?: (musicItem: IMusic.IMusicItem) => void;
    onItemLongPress?: () => void;
    itemPaddingRight?: number;
    left?: () => JSX.Element;
    containerStyle?: StyleProp<ViewStyle>;
    highlight?: boolean
}
export default function MusicItem(props: IMusicItemProps) {
    const {
        musicItem: originalSong,
        index,
        onItemPress,
        onItemLongPress,
        musicSheet,
        itemPaddingRight,
        showMoreIcon = true,
        left: Left,
        containerStyle,
        highlight = false,
    } = props;

    const musicItem = useEditedSong(originalSong);
    const hideAlbum = useAppConfig("library.hideAlbum");
    const hideDuration = useAppConfig("library.hideDuration");
    const hideSource = useAppConfig("library.hideSource");
    const showCounts = useAppConfig("library.showPlayCounts");
    return (
        <ListItem
            heightType="big"
            style={containerStyle}
            withHorizontalPadding
            leftPadding={index !== undefined ? 0 : undefined}
            rightPadding={itemPaddingRight}
            onLongPress={onItemLongPress}
            onPress={() => {
                if (onItemPress) {
                    onItemPress(musicItem);
                } else {
                    TrackPlayer.play(musicItem);
                }
            }}>
            {Left ? <Left /> : null}
            {index !== undefined ? (
                <ListItem.ListItemText
                    width={rpx(82)}
                    position="none"
                    fixedWidth
                    fontColor={highlight ? "primary" : "text"}
                    contentStyle={styles.indexText}>
                    {index}
                </ListItem.ListItemText>
            ) : null}
            <ListItem.Content
                title={
                    <TitleAndTag
                        title={musicItem.title}
                        titleFontColor={highlight ? "primary": "text"}
                        tag={hideSource ? undefined : (musicItem.displaySource ?? musicItem.platform)}
                    />
                }
                description={
                    <View style={styles.descContainer}>
                        {LocalMusicSheet.isLocalMusic(musicItem) && (
                            <Icon
                                style={styles.icon}
                                color="#11659a"
                                name="check-circle"
                                size={rpx(22)}
                            />
                        )}
                        <ThemeText
                            numberOfLines={1}
                            fontSize="description"
                            fontColor={highlight ? "primary" : "textSecondary"}>
                            {musicItem.artist}
                            {!hideAlbum && musicItem.album ? ` - ${musicItem.album}` : ""}
                            {!hideDuration && Number(musicItem.duration) > 0 ? ` · ${timeformat(Number(musicItem.duration))}` : ""}
                            {showCounts ? ` · 播放 ${library.count(musicItem)} 次` : ""}
                        </ThemeText>
                    </View>
                }
            />
            {showMoreIcon ? (
                <ListItem.ListItemIcon
                    width={rpx(48)}
                    position="none"
                    icon="ellipsis-vertical"
                    onPress={() => {
                        showPanel("MusicItemOptions", {
                            musicItem: originalSong,
                            musicSheet,
                        });
                    }}
                />
            ) : null}
        </ListItem>
    );
}

const styles = StyleSheet.create({
    icon: {
        marginRight: rpx(6),
    },
    descContainer: {
        flexDirection: "row",
        marginTop: rpx(16),
    },

    indexText: {
        fontStyle: "italic",
        textAlign: "center",
        padding: rpx(2),
    },
});
