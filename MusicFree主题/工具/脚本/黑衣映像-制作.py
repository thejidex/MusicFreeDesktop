import sys, subprocess, pathlib, json, zipfile
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
import imageio_ffmpeg
root=pathlib.Path(__file__).resolve().parents[2]/'动态主题'; src=root.parent/'工具'/'源文件'/'动态主题'/'girl-black'; src.mkdir(parents=True,exist_ok=True)
f=imageio_ffmpeg.get_ffmpeg_exe()
subprocess.run([f,'-y','-i',r'D:\86183\Pictures\【哲风壁纸】-girl-black.mp4','-vf','scale=1920:-2,fps=30','-c:v','libx264','-preset','fast','-crf','25','-pix_fmt','yuv420p','-an','-movflags','+faststart',str(src/'background.mp4')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
subprocess.run([f,'-y','-ss','5','-i',str(src/'background.mp4'),'-frames:v','1','-vf','scale=640:-2',str(src/'preview.jpg')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
css=(root.parent/'工具'/'源文件'/'静态主题'/'05-蓝调山岚'/'index.css').read_text(encoding='utf-8')
css=css.replace("linear-gradient(90deg,rgba(9,22,39,.78),rgba(9,22,39,.48) 48%,rgba(9,22,39,.28)), url('@/background.webp') 50% center / cover no-repeat",'rgb(12,14,20)').replace('#96c8ff','#c6b7e9').replace('9,22,39','12,14,20')
css += '\n.app-container > iframe { pointer-events: none !important; }\n'
(src/'index.css').write_text(css,encoding='utf-8')
html='''<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#0c0e14}video{width:100%;height:100%;object-fit:cover}body:after{content:"";position:fixed;inset:0;background:linear-gradient(90deg,rgba(12,14,20,.62),rgba(12,14,20,.3));pointer-events:none}</style></head><body><video autoplay muted loop playsinline poster="@/preview.jpg"><source src="@/background.mp4" type="video/mp4"></video><script>const v=document.querySelector('video');document.addEventListener('visibilitychange',()=>{if(document.hidden)v.pause();else v.play().catch(()=>{});});</script></body></html>'''
(src/'background.html').write_text(html,encoding='utf-8')
config={'name':'黑衣映像 · 动态','author':'个人定制','version':'1.0.0','preview':'@/preview.jpg','description':'用户提供视频，1080p/30fps静音循环；深色面板、淡紫点缀。原素材版权归原作者。','iframe':{'app':'@/background.html'}}
(src/'config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf-8')
package=root/'黑衣映像-动态.mftheme'
with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED) as z:
 for p in src.iterdir(): z.write(p,p.name)
with zipfile.ZipFile(package) as z:
 assert z.testzip() is None
 assert set(z.namelist())=={'config.json','index.css','background.html','background.mp4','preview.jpg'}
print('Validated package:',package,'MB:',round(package.stat().st_size/1048576,2))
