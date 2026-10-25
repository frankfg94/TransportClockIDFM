// Android smoke adapter: same ADB + local WebView DevTools approach as scripts/transport-map/replay-android.ts.
// All interaction uses Android touchscreen/key events. DevTools only navigates the test host and reads DOM evidence.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const [port, operation, argument = ''] = process.argv.slice(2);
const adbPath = resolve(process.env.ANDROID_HOME || 'C:/Users/franc/AppData/Local/Android/Sdk', 'platform-tools/adb.exe');
const serial = process.env.LOT11_ANDROID_SERIAL || 'emulator-5554';
const proofDirectory = resolve('docs/tasks/2026-10-22/proofs/11');
const adb = (...args) => execFileSync(adbPath, ['-s', serial, ...args], { encoding: 'utf8', timeout: 20000 });
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find((item) => item.type === 'page');
if (!target) throw new Error('No Android WebView target');
const bounds = JSON.parse(target.description);
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((done, reject) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let id = 0;
const pending = new Map();
const diagnostics = [];
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(String(data));
  if (message.method === 'Runtime.exceptionThrown') diagnostics.push({method:message.method,exception:message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text});
  if (message.method === 'Log.entryAdded') diagnostics.push({method:message.method,level:message.params.entry.level,text:message.params.entry.text});
  if (message.method === 'Network.loadingFailed') diagnostics.push({method:message.method,error:message.params.errorText,requestId:message.params.requestId});
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timer);
  message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.done(message.result);
});
function send(method, params = {}) {
  const next = ++id;
  return new Promise((done, reject) => {
    const timer = setTimeout(() => { pending.delete(next); reject(new Error(`Timeout: ${method}`)); }, 20000);
    pending.set(next, { done, reject, timer });
    socket.send(JSON.stringify({ id: next, method, params }));
  });
}
async function read(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function state() {
  return read(`(() => {
    const rect = e => e ? Object.fromEntries(['x','y','width','height','top','bottom','left','right'].map(k=>[k,e.getBoundingClientRect()[k]])) : null;
    const list = document.querySelector('.fullscreen-station-panel__dense-list');
    const table = document.querySelector('.line-frequency-timetable table');
    const networks = document.querySelector('.global-transport-plan__networks-sheet');
    const networksBody = networks?.querySelector('.draggable-bottom-sheet__body');
    const style = e => e ? getComputedStyle(e) : null;
    return {
      href:location.href, viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
      body:{y:scrollY,overflow:document.body.style.overflow,htmlOverflow:document.documentElement.style.overflow},
      panel:!!document.querySelector('.fullscreen-station-panel'),
      networks:networks?{rect:rect(networks),classes:networks.className,bodyHeight:networksBody.clientHeight,bodyScrollHeight:networksBody.scrollHeight,bodyScrollTop:networksBody.scrollTop,headingCount:networks.querySelectorAll('.global-transport-plan__filter-heading').length,customization:!!networks.querySelector('[data-global-map-customization]'),lineList:!!networks.querySelector('[data-global-map-line-panel]')}:null,
      sheets:Array.from(document.querySelectorAll('.draggable-bottom-sheet')).map(e=>{const b=e.querySelector('.draggable-bottom-sheet__body,.global-map-picker-sidebar__content,.left-nearby-travel__routes');return {title:e.getAttribute('aria-label'),classes:e.className,stage:e.getAttribute('data-mobile-sidebar-sheet')||e.getAttribute('data-mobile-itinerary-sheet'),rect:rect(e),body:b?{height:b.clientHeight,scrollHeight:b.scrollHeight,scrollTop:b.scrollTop}:null,focused:document.activeElement===e,header:e.querySelector('header')?.textContent,footer:e.querySelector('footer')?.textContent,rows:e.querySelectorAll('li').length,input:e.querySelector('input')?.value};}),
      itinerary:(()=>{const e=document.querySelector('[data-mobile-itinerary-sheet]');return e?{stage:e.getAttribute('data-mobile-itinerary-sheet'),rect:rect(e),classes:e.className,inputs:Array.from(e.querySelectorAll('input[type=search]')).map(i=>({label:i.getAttribute('aria-label'),value:i.value})),routes:e.querySelectorAll('.left-nearby-travel__route').length,handle:!!e.querySelector('[data-global-map-itinerary-sheet-handle]')}:null;})(),
      sidePanels:Array.from(document.querySelectorAll('.responsive-side-panel')).map(e=>({title:e.getAttribute('aria-label'),rect:rect(e)})),
      list:list?{rows:list.children.length,scrollTop:list.scrollTop,scrollHeight:list.scrollHeight,height:list.clientHeight,rect:rect(list),last:rect(list.lastElementChild),firstText:list.firstElementChild?.textContent,lastText:list.lastElementChild?.textContent}:null,
      header:rect(document.querySelector('.fullscreen-station-panel__dense-header')),
      scrollAreas:Array.from(document.querySelectorAll('div,section,aside')).filter(e=>e.clientHeight>40 && e.scrollHeight>e.clientHeight+5 && /auto|scroll/u.test(style(e).overflowY)).slice(0,12).map(e=>({class:e.className,rect:rect(e),top:e.scrollTop,height:e.clientHeight,scrollHeight:e.scrollHeight})),
      controls:Array.from(document.querySelectorAll('button,input[type=radio],select')).filter(e=>e.getBoundingClientRect().width && !e.closest('[inert]') && !e.closest('.fullscreen-station-panel__dense-row')).map(e=>({tag:e.tagName,label:e.getAttribute('aria-label')||e.textContent?.trim().slice(0,100),rect:rect(e),value:e.value,checked:e.checked,expanded:e.getAttribute('aria-expanded'),disabled:e.disabled})),
      mapText:document.querySelector('.global-map-picker-sidebar')?.innerText,
      table:table?{text:table.innerText,rows:Array.from(table.rows).map(r=>Array.from(r.cells).map(c=>c.innerText)),rect:rect(table)}:null,
      serviceDate:document.querySelector('.line-frequency-timetable__service-date')?.textContent,
      selects:Array.from(document.querySelectorAll('.line-frequency-timetable select')).map(e=>({id:e.dataset.testid,value:e.value,options:Array.from(e.options).map(o=>({value:o.value,label:o.label}))})),
      fixture:{touch:document.querySelector('[data-testid=fullscreen-fixture-touch]')?.textContent,refreshes:document.querySelector('[data-testid=fullscreen-fixture-refreshes]')?.textContent,alarm:document.querySelector('[data-testid=fullscreen-fixture-alarm]')?.textContent},
      messages:Array.from(document.querySelectorAll('[role=alert],[role=status]')).map(e=>e.textContent),
      errorPage:location.protocol==='chrome-error:'?document.body.innerText:undefined,
    };
  })()`);
}
const pause = (ms) => new Promise(done => setTimeout(done, ms));
try {
  if (operation === 'diagnose') {
    await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');
    await send('Page.reload'); await pause(2500);
    console.log(JSON.stringify({diagnostics}));
  } else if (operation === 'navigate') {
    if (!/^http:\/\/localhost:3000\/(?:lot11-validation|map)(?:[?].*)?$/u.test(argument)) throw new Error('Only the authorized local smoke routes may be loaded');
    console.log(JSON.stringify({navigation:await send('Page.navigate', { url: argument })}));
    await pause(300);
  } else if (operation === 'tap' || operation === 'tap-text' || operation === 'choose') {
    const choice = operation === 'choose' ? JSON.parse(argument) : undefined;
    const selector = choice ? `[data-testid="${choice[0]}"]` : argument;
    const query = operation === 'tap-text'
      ? `Array.from(document.querySelectorAll('button')).filter(e=>e.textContent.trim()===${JSON.stringify(argument)})`
      : `Array.from(document.querySelectorAll(${JSON.stringify(selector)}))`;
    const data = await read(`(() => {const elements=${query};if(elements.length!==1)throw Error('Expected one target, found '+elements.length);const e=elements[0];const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:innerWidth,height:innerHeight,w:r.width,h:r.height,label:e.options?Array.from(e.options).find(o=>o.value===${JSON.stringify(choice?.[1] ?? '')})?.label:undefined};})()`);
    if (data.w <= 0 || data.h <= 0 || data.y < 0 || data.y >= data.height) throw new Error('Target is not in the visible viewport');
    const scale = bounds.width / data.width;
    adb('shell', 'input', 'touchscreen', 'tap', String(Math.round(bounds.screenX + data.x * scale)), String(Math.round(bounds.screenY + data.y * scale)));
    await pause(150);
    if (choice) {
      if (!data.label) throw new Error('Requested option missing');
      adb('shell','uiautomator','dump','/sdcard/Download/lot11-ui.xml');
      const xml = adb('exec-out','cat','/sdcard/Download/lot11-ui.xml');
      const attribute = (tag,name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1]?.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&apos;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>');
      const options = [...xml.matchAll(/<node\b[^>]*>/gu)].map(([tag])=>({text:attribute(tag,'text'),bounds:attribute(tag,'bounds')})).filter(item=>item.text===data.label);
      if (options.length!==1) throw new Error(`Expected one visible Android option ${data.label}, found ${options.length}`);
      const coordinates = options[0].bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/u).slice(1).map(Number);
      adb('shell','input','touchscreen','tap',String(Math.round((coordinates[0]+coordinates[2])/2)),String(Math.round((coordinates[1]+coordinates[3])/2)));
      await pause(200);
    }
  } else if (operation === 'drag-sheet') {
    const [selector, delta] = JSON.parse(argument);
    const point = await read(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e) throw Error('Handle missing'); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,width:innerWidth,height:innerHeight}; })()`);
    const endY = Math.max(4, Math.min(point.height-4, point.y+delta));
    const scale = bounds.width / point.width;
    adb('shell','input','touchscreen','swipe',String(Math.round(bounds.screenX+point.x*scale)),String(Math.round(bounds.screenY+point.y*scale)),String(Math.round(bounds.screenX+point.x*scale)),String(Math.round(bounds.screenY+endY*scale)),'550');
    await pause(350);
  } else if (operation === 'scroll-end' || operation === 'scroll-start') {
    const trace = [];
    for (let n = 0; n < 32; n++) {
      const current = await state();
      if (!current.list) throw new Error('Dense list missing');
      const { list, viewport } = current;
      trace.push({ n, top:list.scrollTop, height:list.height, scrollHeight:list.scrollHeight, bodyY:current.body.y, headerY:current.header?.y });
      if (operation === 'scroll-end' ? list.scrollTop >= list.scrollHeight - list.height - 1 : list.scrollTop <= 1) break;
      const scale = bounds.width / viewport.width;
      const x = bounds.screenX + (list.rect.x + list.rect.width / 2) * scale;
      const high = bounds.screenY + (list.rect.y + list.rect.height * .18) * scale;
      const low = bounds.screenY + (list.rect.y + list.rect.height * .85) * scale;
      const [from, to] = operation === 'scroll-end' ? [low, high] : [high, low];
      adb('shell','input','touchscreen','swipe',String(Math.round(x)),String(Math.round(from)),String(Math.round(x)),String(Math.round(to)),'400');
      await pause(180);
    }
    console.log(JSON.stringify({ trace }));
  } else if (operation === 'scroll-container') {
    const [selector,direction,count=1] = JSON.parse(argument);
    for (let n=0;n<Math.min(count,8);n++) {
      const geometry = await read(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing scroll area');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,top:Math.max(0,r.top),bottom:Math.min(innerHeight,r.bottom),width:innerWidth};})()`);
      if (geometry.bottom-geometry.top<40) throw new Error('Scroll area outside the viewport');
      const scale=bounds.width/geometry.width;
      const top=bounds.screenY+(geometry.top+(geometry.bottom-geometry.top)*.18)*scale;
      const bottom=bounds.screenY+(geometry.top+(geometry.bottom-geometry.top)*.85)*scale;
      const [from,to]=direction==='down'?[top,bottom]:[bottom,top];
      adb('shell','input','touchscreen','swipe',String(Math.round(bounds.screenX+geometry.x*scale)),String(Math.round(from)),String(Math.round(bounds.screenX+geometry.x*scale)),String(Math.round(to)),'400');
      await pause(200);
    }
  } else if (operation === 'background-swipe') {
    const current = await state();
    if (current.panel) throw new Error('Close the panel before verifying background restoration');
    const scale = bounds.width / current.viewport.width;
    const x = bounds.screenX + current.viewport.width * .5 * scale;
    const [from,to] = argument === 'down' ? [.25,.8] : [.8,.25];
    adb('shell','input','touchscreen','swipe',String(Math.round(x)),String(Math.round(bounds.screenY+current.viewport.height*from*scale)),String(Math.round(x)),String(Math.round(bounds.screenY+current.viewport.height*to*scale)),'400');
    await pause(200);
  } else if (operation === 'orient') {
    if (!['0','1'].includes(argument)) throw new Error('Expected portrait 0 or landscape 1');
    adb('shell','settings','put','system','accelerometer_rotation','0');
    adb('shell','settings','put','system','user_rotation',argument);
    await pause(400);
  } else if (operation === 'escape') {
    adb('shell','input','keyevent','KEYCODE_ESCAPE');
    await pause(150);
  } else if (operation !== 'read' && operation !== 'capture') throw new Error('Unsupported operation');
  const snapshot = await state();
  if (argument && operation === 'capture') {
    if (!/^[a-z0-9-]+$/u.test(argument)) throw new Error('Unsafe proof name');
    writeFileSync(resolve(proofDirectory, `${argument}.png`), execFileSync(adbPath, ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 16 * 1024 * 1024 }));
    writeFileSync(resolve(proofDirectory, `${argument}.json`), JSON.stringify({ runtime:'Capacitor debug test APK, Android WebView, ADB touchscreen input', target:{...bounds}, ...snapshot },null,2));
  }
  console.log(JSON.stringify(snapshot, null, 2));
} finally { socket.close(); }
