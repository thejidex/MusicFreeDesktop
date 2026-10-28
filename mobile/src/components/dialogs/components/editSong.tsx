import React, { useState } from "react";
import { View } from "react-native";
import Dialog from "./base";
import Input from "@/components/base/input";
import ThemeText from "@/components/base/themeText";
import { hideDialog } from "../useDialog";
import { library } from "@/core/library";
import Toast from "@/utils/toast";
import MusicSheet from "@/core/musicSheet";
import TrackPlayer from "@/core/trackPlayer";

export default function EditSong({ musicItem }: { musicItem: IMusic.IMusicItem }) {
    const song = library.apply(musicItem);
    const [title, setTitle] = useState(song.title || "");
    const [artist, setArtist] = useState(song.artist || "");
    const [album, setAlbum] = useState(song.album || "");
    const [displaySource, setSource] = useState(song.displaySource ?? song.platform);
    function save() {
        try {
            library.edit(musicItem, { title, artist, album, displaySource });
            MusicSheet.refreshEditedMetadata();
            void TrackPlayer.refreshEditedMetadata();
            hideDialog();
        } catch (error: any) {
            Toast.warn(error.message); 
        }
    }
    return <Dialog onDismiss={hideDialog}>
        <Dialog.Title>编辑歌曲信息</Dialog.Title>
        <Dialog.Content needScroll>
            {([
                ["歌名", title, setTitle], ["作者", artist, setArtist],
                ["专辑", album, setAlbum], ["显示来源", displaySource, setSource],
            ] as const).map(([label, value, onChange]) => <View key={label} style={{ marginBottom: 12 }}>
                <ThemeText>{label}</ThemeText>
                <Input value={value} onChangeText={onChange} onSubmitEditing={save} />
            </View>)}
            <ThemeText>保存到本机，同一首歌曲在其他歌单同步显示。显示来源不改变插件与实际音源。</ThemeText>
        </Dialog.Content>
        <Dialog.Actions actions={[
            { title: "取消", type: "normal", onPress: hideDialog },
            { title: "保存", type: "primary", onPress: save },
        ]} />
    </Dialog>;
}
