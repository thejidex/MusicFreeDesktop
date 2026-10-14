from pathlib import Path
from PIL import Image
import json, zipfile
root=Path(__file__).resolve().parents[2]/'静态主题'
items=[('01-暮山剪影','IMG_20240121_182430.jpg','#eab394','12,22,32','35%'),('02-青禾微风','IMG_20240121_182503.jpg','#d1de9f','20,29,30','58%'),('03-云海余晖','【哲风壁纸】WLOP-云彩.png','#f2bd91','12,24,37','65%'),('04-风拂青禾','IMG_20240121_182419.jpg','#b8dbd9','17,28,33','60%'),('05-蓝调山岚','【哲风壁纸】夜景-山峦-山峰.png','#96c8ff','9,22,39','50%')]
for name,file,accent,rgb,pos in items:
    folder=root.parent/'工具'/'源文件'/'静态主题'/name
    folder.mkdir(parents=True,exist_ok=True)
    im=Image.open(Path(r'D:\86183\Pictures')/file).convert('RGB')
    im.thumbnail((1920,1200),Image.Resampling.LANCZOS)
    im.save(folder/'background.webp','WEBP',quality=86,method=6)
    thumb=im.copy(); thumb.thumbnail((480,300),Image.Resampling.LANCZOS)
    thumb.save(folder/'preview.webp','WEBP',quality=80)
    cfg={'name':name[3:]+' · 静态','author':'个人定制','version':'1.0.0','preview':'@/preview.webp','description':'用户提供图片；原图版权归原作者。静态背景、无动画、无脚本、无模糊滤镜，仅供个人使用。'}
    (folder/'config.json').write_text(json.dumps(cfg,ensure_ascii=False,indent=2),encoding='utf-8')
    css='''/* Static local assets only. No iframe, scripts, remote fonts or animation. */
:root {
 --primaryColor: ACCENT !important;
 --backgroundColor: rgb(RGB) !important;
 --textColor: #f2f5f8 !important;
 --textSecondaryColor: #cbd5df !important;
 --headerTextColor: #f2f5f8 !important;
 --linkColor: ACCENT !important;
 --dividerColor: rgba(235,243,255,.15) !important;
 --listEvenColor: rgba(255,255,255,.035) !important;
 --listHoverColor: rgba(255,255,255,.12) !important;
 --listActiveColor: rgba(255,255,255,.19) !important;
 --maskColor: rgba(0,0,0,.65) !important;
 --shadowColor: rgba(0,0,0,.25) !important;
 --placeholderColor: rgba(255,255,255,.12) !important;
 --backdropColor: rgb(RGB) !important;
}
.app-container {
 background: linear-gradient(90deg,rgba(RGB,.78),rgba(RGB,.48) 48%,rgba(RGB,.28)), url('@/background.webp') POS center / cover no-repeat !important;
 color: var(--textColor) !important;
}
.body-container, .page-container {background: transparent !important;}
.side-bar-container {background: rgba(RGB,.62) !important; border-right: 1px solid var(--dividerColor);}
.header-container {background: rgba(RGB,.78) !important; border-bottom: 1px solid var(--dividerColor);}
.music-bar-container {background: rgba(RGB,.9) !important; border-top: 1px solid var(--dividerColor);}
.header-container, .side-bar-container, .music-bar-container, .app-container, .body-container, .music-detail-container {
 backdrop-filter: none !important; -webkit-backdrop-filter: none !important;
}
.right-part {--headerTextColor: #f2f5f8 !important;}
.music-detail-container {background: rgba(RGB,.94) !important;}
a {color: ACCENT;}
input {color: var(--textColor); caret-color: ACCENT;}
input::placeholder {color: #bdc8d5;}
::selection {background: ACCENT; color: #14202d;}
::-webkit-scrollbar-thumb {background-color: rgba(220,235,250,.32); border-radius: 8px;}
'''.replace('ACCENT',accent).replace('RGB',rgb).replace('POS',pos)
    (folder/'index.css').write_text(css,encoding='utf-8')
    package=root/(name+'.mftheme')
    with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED) as z:
        for p in folder.iterdir(): z.write(p,p.name)
    with zipfile.ZipFile(package) as z:
        assert z.testzip() is None
        assert {'config.json','index.css','background.webp','preview.webp'}==set(z.namelist())
        assert 'iframe' not in json.loads(z.read('config.json'))
    print(name, im.size, round(package.stat().st_size/1024),'KB')
(root.parent/'工具'/'说明'/'静态主题.txt').write_text('五款主题分别对应所提供的五张图片。\n安装：MusicFree → 本地主题 → ＋ → 选择一个 .mftheme 文件 → 应用。\n也可尝试将 .mftheme 文件拖入播放器。无需解压。\n只应用其中一款，不会同时加载五张背景。\n背景等比例缩小到最长约1920像素，保留原构图与署名；窗口比例不同可能裁切边缘。\n仅包含本地静态图片和CSS，无视频、JS、iframe、远程资源或模糊滤镜。\n原图未改动，主题中的图片为用于显示的压缩副本。\n已验证压缩包结构和资源路径，尚未在你的播放器中实际应用核验。\n',encoding='utf-8')
