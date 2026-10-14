from pathlib import Path
import json, subprocess, zipfile
root=Path(__file__).resolve().parents[2]/'动态主题'
source_root=root.parent/'工具'/'源文件'/'动态主题'
src=source_root/'暮色栏杆-海边女孩'
src.mkdir(parents=True,exist_ok=True)
f=str(Path(__file__).resolve().parents[1]/'imageio_ffmpeg'/'binaries'/'ffmpeg-win-x86_64-v7.1.exe')
video=r'D:\86183\Pictures\【哲风壁纸】暮色栏杆-海边女孩.mp4'
cmd=[f,'-hide_banner','-loglevel','error','-y','-i',video,'-vf','scale=1920:-2,setsar=1,fps=30','-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-an','-movflags','+faststart',str(src/'background.mp4')]
subprocess.run(cmd,check=True)
css=(source_root/'girl-black'/'index.css').read_text(encoding='utf-8')
css=css.replace('/* Static local assets only. No iframe, scripts, remote fonts or animation. */','/* MusicFree video theme: local silent looping background. */').replace('#c6b7e9','#a9cbea').replace('12,14,20','10,20,30').replace('rgba(10,20,30,.62)','rgba(10,20,30,.55)').replace('rgba(10,20,30,.78)','rgba(10,20,30,.68)').replace('rgba(10,20,30,.9)','rgba(10,20,30,.82)')
(src/'index.css').write_text(css,encoding='utf-8')
html='''<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>暮色栏杆 · 海边女孩</title>
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#0a141e}video{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 50%}body:after{content:"";position:fixed;inset:0;background:linear-gradient(90deg,rgba(10,20,30,.38),rgba(10,20,30,.24) 45%,rgba(10,20,30,.14));pointer-events:none}</style>
</head><body><video autoplay muted loop playsinline preload="auto" poster="@/preview.jpg"><source src="@/background.mp4" type="video/mp4"></video>
<script>const video=document.querySelector('video');video.muted=true;function resume(){if(!document.hidden)video.play().catch(()=>{});}document.addEventListener('visibilitychange',()=>{if(document.hidden)video.pause();else resume();});video.addEventListener('canplay',resume);resume();</script>
</body></html>'''
(src/'background.html').write_text(html,encoding='utf-8')
config={'name':'暮色栏杆 · 海边女孩 · 动态','author':'个人定制','version':'1.0.0','preview':'@/preview.jpg','description':'海边暮色视频背景，1080p / 30fps 静音循环，蓝灰色半透明面板。','iframe':{'app':'@/background.html'}}
(src/'config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf-8')
package=root/'暮色栏杆-海边女孩-动态.mftheme'
with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(src.iterdir()):
        z.write(p,p.name)
with zipfile.ZipFile(package) as z:
    assert z.testzip() is None
    assert set(z.namelist())=={'config.json','index.css','background.html','background.mp4','preview.jpg'}
(root.parent/'工具'/'说明'/'暮色栏杆-使用说明.txt').write_text('主题：暮色栏杆 · 海边女孩 · 动态\n\n可导入文件：暮色栏杆-海边女孩-动态.mftheme\n安装：MusicFree → 主题包 → 安装本地主题包 → 选择此文件，再点击主题卡片应用。也可将主题包拖入 MusicFree 窗口自动安装并应用。\n背景为 1920×1080、30fps、27.33 秒静音循环；窗口隐藏时暂停，恢复显示后继续。\n源文件位于“工具\\源文件\\动态主题\\暮色栏杆-海边女孩”文件夹，背景位置与遮罩可在 background.html 中调整。\n',encoding='utf-8')
print(json.dumps({'package':str(package),'bytes':package.stat().st_size,'files':[p.name for p in src.iterdir()]},ensure_ascii=False))
