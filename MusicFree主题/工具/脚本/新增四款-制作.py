from pathlib import Path
from PIL import Image, ImageOps
import json, subprocess, zipfile, hashlib
base=Path(__file__).resolve().parents[2]
assets=Path(r'D:\86183\Pictures')
ffmpeg=base/'工具'/'imageio_ffmpeg'/'binaries'/'ffmpeg-win-x86_64-v7.1.exe'
template=(base/'工具'/'源文件'/'动态主题'/'暮色栏杆-海边女孩'/'index.css').read_text(encoding='utf-8')
items=[
 {'key':'06-二次元少女','name':'二次元少女 · 静态','file':'【哲风壁纸】二次元-宅-少女.jpg','accent':'#78586d','rgb':'244,241,245','position':'55%','light':True},
 {'key':'07-冷感花影','name':'冷感花影 · 静态','file':'【哲风壁纸】111111-冷感.jpg','accent':'#c1b9db','rgb':'15,15,21','position':'45%'},
 {'key':'08-未来世界-礼服女孩','name':'未来世界 · 礼服女孩 · 静态','file':'【哲风壁纸】未来世界-礼服女孩.png','accent':'#edc79d','rgb':'9,25,39','position':'52%'}
]
def css_for(accent,rgb,light=False,static=False,position='50%'):
 css=template.replace('#a9cbea',accent).replace('10,20,30',rgb)
 if light:
  for old,new in {'#f2f5f8':'#35303c','#cbd5df':'#66616d','rgba(235,243,255,.15)':'rgba(62,45,65,.18)','rgba(255,255,255,.035)':'rgba(95,60,85,.035)','rgba(255,255,255,.12)':'rgba(101,71,93,.09)','rgba(255,255,255,.19)':'rgba(101,71,93,.16)','rgba(0,0,0,.65)':'rgba(35,28,42,.36)','#bdc8d5':'#766e7b','rgba(220,235,250,.32)':'rgba(93,76,95,.35)'}.items():css=css.replace(old,new)
  css=css.replace('rgba('+rgb+',.55)','rgba('+rgb+',.78)').replace('rgba('+rgb+',.68)','rgba('+rgb+',.84)').replace('rgba('+rgb+',.82)','rgba('+rgb+',.91)')
  css=css.replace('color: #14202d','color: #ffffff')
 if static:
  gradient=(f'linear-gradient(90deg,rgba({rgb},.62),rgba({rgb},.28) 50%,rgba({rgb},.18))' if light else f'linear-gradient(90deg,rgba({rgb},.52),rgba({rgb},.30) 50%,rgba({rgb},.20))')
  css=css.replace(' background: rgb('+rgb+') !important;',f" background: {gradient}, url('@/background.webp') {position} center / cover no-repeat !important;")
  css=css.replace('/* MusicFree video theme: local silent looping background. */','/* Local static wallpaper theme. */')
 return css

def package(src,category,key):
 output=base/category/(key+'.mftheme')
 with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
  for p in sorted(src.iterdir()):
   if p.is_file():z.write(p,p.name)
 with zipfile.ZipFile(output) as z:
  assert z.testzip() is None
  assert {'config.json','index.css'}<=set(z.namelist())
 return {'path':str(output),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}
reports=[]
for item in items:
 src=base/'工具'/'源文件'/'静态主题'/item['key'];src.mkdir(parents=True,exist_ok=True)
 with Image.open(assets/item['file']) as original:
  im=ImageOps.exif_transpose(original).convert('RGB');original_size=im.size
  im.thumbnail((1920,1200),Image.Resampling.LANCZOS)
  im.save(src/'background.webp','WEBP',quality=90,method=6)
  preview=im.copy();preview.thumbnail((640,400),Image.Resampling.LANCZOS);preview.save(src/'preview.webp','WEBP',quality=85,method=6)
 cfg={'name':item['name'],'author':'个人定制','version':'1.0.0','preview':'@/preview.webp','description':'本地静态壁纸，半透明面板与配色适配；原素材版权归原作者。'}
 (src/'config.json').write_text(json.dumps(cfg,ensure_ascii=False,indent=2),encoding='utf-8')
 (src/'index.css').write_text(css_for(item['accent'],item['rgb'],item.get('light',False),True,item['position']),encoding='utf-8')
 reports.append({'name':item['name'],'type':'static','key':item['key'],'source':str(assets/item['file']),'originalSize':original_size,'displaySize':im.size,**package(src,'静态主题',item['key'])})
 print('Created',item['key'],flush=True)
key='冷峻表情-小白花'
src=base/'工具'/'源文件'/'动态主题'/key;src.mkdir(parents=True,exist_ok=True)
video=assets/'【哲风壁纸】冷峻表情-小白花.mp4'
subprocess.run([str(ffmpeg),'-hide_banner','-loglevel','error','-y','-i',str(video),'-vf','scale=1920:-2,setsar=1,fps=30','-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-an','-movflags','+faststart',str(src/'background.mp4')],check=True)
subprocess.run([str(ffmpeg),'-hide_banner','-loglevel','error','-y','-ss','3','-i',str(src/'background.mp4'),'-frames:v','1','-vf','scale=640:-2',str(src/'preview.jpg')],check=True)
(src/'index.css').write_text(css_for('#c1b9db','15,15,21'),encoding='utf-8')
html='''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>冷峻表情 · 小白花</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#0f0f15}video{display:block;width:100%;height:100%;object-fit:cover;object-position:45% 50%}body:after{content:"";position:fixed;inset:0;background:linear-gradient(90deg,rgba(15,15,21,.46),rgba(15,15,21,.30) 50%,rgba(15,15,21,.18));pointer-events:none}</style></head><body><video autoplay muted loop playsinline preload="auto" poster="@/preview.jpg"><source src="@/background.mp4" type="video/mp4"></video><script>const v=document.querySelector('video');v.muted=true;function resume(){if(!document.hidden)v.play().catch(()=>{});}document.addEventListener('visibilitychange',()=>{if(document.hidden)v.pause();else resume();});v.addEventListener('canplay',resume);resume();</script></body></html>'''
(src/'background.html').write_text(html,encoding='utf-8')
cfg={'name':'冷峻表情 · 小白花 · 动态','author':'个人定制','version':'1.0.0','preview':'@/preview.jpg','description':'1080p / 30fps 静音循环视频，冷灰色半透明面板；隐藏窗口暂停播放。','iframe':{'app':'@/background.html'}}
(src/'config.json').write_text(json.dumps(cfg,ensure_ascii=False,indent=2),encoding='utf-8')
reports.append({'name':cfg['name'],'type':'dynamic','key':key,'source':str(video),**package(src,'动态主题',key+'-动态')})
record=base/'工具'/'记录'/'新增四款-制作结果.json';record.write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf-8')
notes=base/'工具'/'说明'/'新增四款.txt'
notes.write_text('新增四款 MusicFree 主题\n\n动态主题：冷峻表情-小白花-动态.mftheme（1920×1080，30fps，10 秒静音循环）\n静态主题：06-二次元少女.mftheme、07-冷感花影.mftheme、08-未来世界-礼服女孩.mftheme。\n\n安装：将对应 .mftheme 拖入 MusicFree，或在主题包页面安装本地主题包后应用。\n主题目录只保存 .mftheme；源文件保存在工具\\源文件，应用截图在工具\\预览，制作与验证记录在工具\\记录。\n二次元少女使用浅色面板与深色文字；其余使用深色面板与浅色文字。\n原图未修改，静态主题图片等比例压缩，窗口比例不同可能裁切边缘。\n',encoding='utf-8')
for category in ['动态主题','静态主题']:
 assert all(p.is_file() and p.suffix=='.mftheme' for p in (base/category).iterdir())
print(json.dumps({'created':reports},ensure_ascii=False),flush=True)
