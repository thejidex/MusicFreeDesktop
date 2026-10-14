import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const records=path.join(base,'工具','记录');
const previews=path.join(base,'工具','预览');
const items=JSON.parse(fs.readFileSync(path.join(records,'新增四款-制作结果.json'),'utf8'));
const targets=await(await fetch('http://127.0.0.1:19229/json/list')).json();
const target=targets.find(t=>t.type==='page'&&t.url.includes('main_window'));
if(!target)throw new Error('MusicFree main window not found');
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
let id=0;const pending=new Map();
ws.addEventListener('message',event=>{const d=JSON.parse(event.data);const p=pending.get(d.id);if(p){clearTimeout(p.timer);pending.delete(d.id);if(d.error)p.reject(new Error(JSON.stringify(d.error)));else p.resolve(d.result);}});
function call(method,params={}){return new Promise((resolve,reject)=>{const current=++id;const timer=setTimeout(()=>{pending.delete(current);reject(new Error('CDP timeout: '+method));},15000);pending.set(current,{resolve,reject,timer});ws.send(JSON.stringify({id:current,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const stateExpression=`(()=>{const f=document.querySelector('.app-container > iframe');const v=f?.contentDocument?.querySelector('video');const app=document.querySelector('.app-container');const s=getComputedStyle(app);return {path:localStorage.getItem('themepack-path'),hidden:document.hidden,iframeCount:document.querySelectorAll('.app-container > iframe').length,background:s.backgroundImage,textColor:s.color,primaryColor:getComputedStyle(document.documentElement).getPropertyValue('--primaryColor').trim(),video:v?{time:v.currentTime,duration:v.duration,width:v.videoWidth,height:v.videoHeight,paused:v.paused,muted:v.muted,loop:v.loop,readyState:v.readyState,seeking:v.seeking,error:v.error?.message||null}:null};})()`;
const report=[];
try{
 for(let attempt=0;attempt<30;attempt++){if(await evaluate('!!window["@shared/themepack"] && !!document.querySelector("#themepack-node")'))break;await delay(200);}
 await evaluate(`window['@shared/utils'].appWindow.showMainWindow()`);await delay(800);
 const previous=await evaluate(`localStorage.getItem('themepack-path')`);
 const before=path.join(records,'新增四款-应用前主题.json');if(!fs.existsSync(before))fs.writeFileSync(before,JSON.stringify({path:previous},null,2));
 for(const item of items){
  const installed=await evaluate(`(async()=>{const api=window['@shared/themepack'];const all=await api.loadThemePacks();const theme=all.find(t=>t.name===${JSON.stringify(item.name)})||await api.installThemePack(${JSON.stringify(item.path)});if(!theme)throw new Error('Cannot install theme');await api.selectTheme(theme);return {name:theme.name,path:theme.path,hash:theme.hash};})()`);
  await call('Page.reload');await delay(1400);
  await evaluate(`window['@shared/utils'].appWindow.showMainWindow()`);await delay(400);
  let state=await evaluate(stateExpression);
  if(state.path!==installed.path)throw new Error('Theme persistence check failed');
  if(item.type==='static'){
   if(state.iframeCount!==0||state.video||!state.background.includes('background.webp'))throw new Error('Static background check failed: '+JSON.stringify(state));
   const cssImage=await evaluate(`(async()=>{const style=getComputedStyle(document.querySelector('.app-container'));const match=style.backgroundImage.match(/url\\("?([^"\\)]+)"?\\)/);if(!match)throw new Error('Missing image URL');const img=new Image();img.src=match[1];await img.decode();return {width:img.naturalWidth,height:img.naturalHeight};})()`);
   state.image=cssImage;
  }else{
   for(let attempt=0;attempt<30&&(!state.video||state.video.paused||state.video.readyState<3);attempt++){await delay(300);state=await evaluate(stateExpression);}
   const first=state.video;await delay(900);state=await evaluate(stateExpression);
   if(!first||!state.video||state.video.time<=first.time||state.video.paused||state.video.error||!state.video.muted||!state.video.loop||state.video.width!==1920||state.video.height!==1080)throw new Error('Video playback check failed: '+JSON.stringify(state));
   await evaluate(`(()=>{const v=document.querySelector('.app-container > iframe').contentDocument.querySelector('video');v.currentTime=v.duration-0.3;return true;})()`);
   await delay(750);let loop=await evaluate(stateExpression);
   for(let attempt=0;attempt<20&&(loop.video.seeking||loop.video.time>2||loop.video.paused);attempt++){await delay(300);loop=await evaluate(stateExpression);}
   if(loop.video.time>2||loop.video.paused)throw new Error('Video loop check failed');
   state.loopVerified=true;state.loopTime=loop.video.time;
   await evaluate(`(()=>{const v=document.querySelector('.app-container > iframe').contentDocument.querySelector('video');v.currentTime=3;return true;})()`);await delay(400);
  }
  const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  const output=path.join(previews,item.key+'-应用效果.png');fs.writeFileSync(output,Buffer.from(screenshot.data,'base64'));
  report.push({name:item.name,installed,checked:state,screenshot:output});console.log(JSON.stringify({name:item.name,verified:true,screenshot:output}));
 }
 const final=await evaluate(stateExpression);
 fs.writeFileSync(path.join(records,'新增四款-应用验证.json'),JSON.stringify({previous,items:report,final,verifiedAt:new Date().toISOString()},null,2));
 console.log(JSON.stringify({allVerified:true,finalTheme:items.at(-1).name}));
}finally{ws.close();}
