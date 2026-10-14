import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = path.join(base, '动态主题');
const records = path.join(base, '工具', '记录');
const previews = path.join(base, '工具', '预览');
fs.mkdirSync(previews, {recursive:true});
fs.mkdirSync(records, {recursive:true});
const targets = await (await fetch('http://127.0.0.1:19229/json/list')).json();
const target = targets.find(t => t.type === 'page' && t.url.includes('main_window'));
if (!target) throw new Error('MusicFree main window not found');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {ws.addEventListener('open', resolve, {once:true});ws.addEventListener('error', reject, {once:true});});
let sequence = 0;
const pending = new Map();
ws.addEventListener('message', event => {const data = JSON.parse(event.data);if(data.id && pending.has(data.id)){const p=pending.get(data.id);pending.delete(data.id);if(data.error)p.reject(new Error(JSON.stringify(data.error)));else p.resolve(data.result);}});
function call(method, params={}){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try {
  for(let n=0;n<30;n++){if(await evaluate('!!window["@shared/themepack"] && !!document.querySelector("#themepack-node")')) break;await delay(300);}
  await evaluate(`window['@shared/utils'].appWindow.showMainWindow()`);
  await delay(800);
  const previous=await evaluate('({path:localStorage.getItem("themepack-path"),iframeCount:document.querySelectorAll(".app-container > iframe").length})');
  if(!fs.existsSync(path.join(records,'应用前主题.json')))fs.writeFileSync(path.join(records,'应用前主题.json'),JSON.stringify(previous,null,2));
  const packagePath=path.join(root,'暮色栏杆-海边女孩-动态.mftheme');
  const installed=await evaluate(`(async()=>{const api=window['@shared/themepack'];const all=await api.loadThemePacks();const t=all.find(t=>t.name==='暮色栏杆 · 海边女孩 · 动态')||await api.installThemePack(${JSON.stringify(packagePath)});if(!t)throw new Error('Theme install failed');await api.selectTheme(t);return {name:t.name,path:t.path,hash:t.hash,selectedPath:localStorage.getItem('themepack-path')};})()`);
  console.log(JSON.stringify({installed}));
  await call('Page.reload');
  await delay(3000);
  await evaluate(`window['@shared/utils'].appWindow.showMainWindow()`);
  await delay(500);
  const statusExpression=`(()=>{const frame=document.querySelector('.app-container > iframe');const v=frame?.contentDocument?.querySelector('video');return {selectedPath:localStorage.getItem('themepack-path'),primaryColor:getComputedStyle(document.documentElement).getPropertyValue('--primaryColor').trim(),iframeCount:document.querySelectorAll('.app-container > iframe').length,video:v?{currentTime:v.currentTime,duration:v.duration,width:v.videoWidth,height:v.videoHeight,muted:v.muted,loop:v.loop,paused:v.paused,readyState:v.readyState,error:v.error?.message||null,source:v.currentSrc}:null};})()`;
  const first=await evaluate(statusExpression);
  await delay(1300);
  const second=await evaluate(statusExpression);
  if(!second.video || second.video.paused || !second.video.muted || !second.video.loop || second.video.error || second.video.currentTime<=first.video.currentTime || second.selectedPath!==installed.path) throw new Error('Video playback or theme persistence check failed: '+JSON.stringify({first,second}));
  await evaluate(`(()=>{const v=document.querySelector('.app-container > iframe').contentDocument.querySelector('video');v.currentTime=v.duration-0.3;return true;})()`);
  await delay(1000);
  let loop=await evaluate(statusExpression);
  for(let n=0;n<20 && (loop.video.currentTime>2 || loop.video.paused);n++){await delay(300);loop=await evaluate(statusExpression);}
  if(loop.video.currentTime>2 || loop.video.paused)throw new Error('Loop validation failed: '+JSON.stringify(loop));
  await evaluate(`(()=>{const v=document.querySelector('.app-container > iframe').contentDocument.querySelector('video');v.currentTime=5;return true;})()`);
  await delay(500);
  const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(previews,'MusicFree-应用效果.png'),Buffer.from(screenshot.data,'base64'));
  const report={installed,previous,playback:{first:first.video,second:second.video},loop:loop.video,selectedAfterReload:second.selectedPath,verifiedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(records,'验证结果.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({verified:true,video:second.video,loopTime:loop.video.currentTime,screenshot:path.join(previews,'MusicFree-应用效果.png')}));
} finally {ws.close();}
