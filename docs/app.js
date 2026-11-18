import {BrowserEngine} from './browser-engine.js?v=3';
import {loadMetadata} from './media.js?v=3';
const $ = id => document.getElementById(id);
const engine = new BrowserEngine(update=>status(update.error || `${update.message} ${update.progress}%`,Boolean(update.error)));
let sourceUrl, previewUrl, downloadUrl, operation=0;
const video = $('video');
let source = null, start = 0, end = 3, circle = false, busy = false, loading = false;
const dec = value => value.toFixed(2).replace('.', ',');
function status(message, error = false) { $('status').hidden = !message; $('status').textContent = message; $('status').className = error ? 'error' : ''; }
function setBusy(value) { busy = value;window.stickerBoot.busy=value; $('export').disabled = value || !source; for(const id of ['replace','drop','start','end','circle','original']) $(id).disabled = value; $('cancel').hidden=!value; }
function invalidate() { $('result').hidden = true; }
function update(seek = false, preserveInputs = false) {
  if(!preserveInputs) { $('start').value = start.toFixed(2); $('end').value = end.toFixed(2); }
  $('start').max = Math.max(0, source.duration-.1); $('end').max = source.duration;
  $('selection').style.left = `${start/source.duration*100}%`;
  $('selection').style.width = `${(end-start)/source.duration*100}%`;
  $('duration-badge').textContent = `${dec(end-start)} с / 3 с`;
  for (const [id, value] of [['handle-start',start],['handle-end',end]]) { $(id).setAttribute('aria-valuemin','0'); $(id).setAttribute('aria-valuemax',String(source.duration)); $(id).setAttribute('aria-valuenow',String(value)); $(id).setAttribute('aria-valuetext',`${dec(value)} секунд`); }
  if (seek) { video.pause(); video.currentTime = start; invalidate(); }
}
function once(target, event,timeout=30000) { return new Promise((resolve, reject) => { const done = () => { cleanup(); resolve(); }; const fail = () => { cleanup(); reject(new Error('Не удалось показать предпросмотр.')); }; const timer=setTimeout(fail,timeout); const cleanup = () => { clearTimeout(timer);target.removeEventListener(event, done); target.removeEventListener('error', fail); }; target.addEventListener(event, done, { once: true }); target.addEventListener('error', fail, { once: true }); }); }
async function thumbnails(url) {
  const token=operation,duration=source.duration;
  const helper = document.createElement('video'); helper.muted = true; helper.preload = 'auto';
  helper.playsInline=true;
  await loadMetadata(helper,url,5000);
  $('thumbs').replaceChildren();
  try{for (let i = 0; i < 12; i++) {
    if(token!==operation)return;
    const at = Math.max(.001, duration * (i+.5)/12);
    const seek = once(helper, 'seeked',1500); helper.currentTime = Math.min(at, helper.duration-.02); await seek;
    if(token!==operation)return;
    const canvas = document.createElement('canvas'); canvas.width=90; canvas.height=62;
    const ctx = canvas.getContext('2d'), scale = Math.max(90/helper.videoWidth,62/helper.videoHeight);
    ctx.drawImage(helper,(90-helper.videoWidth*scale)/2,(62-helper.videoHeight*scale)/2,helper.videoWidth*scale,helper.videoHeight*scale);
    $('thumbs').append(canvas);
  }}finally{helper.removeAttribute('src'); helper.load();}
}
async function upload(file) {
  if (!file || busy) return;
  if (file.size > 100*1024*1024) return status('Для браузерной версии выберите файл меньше 100 МБ.', true);
  const token=++operation;
  setBusy(true); loading = true; invalidate(); video.pause(); source=null;
  status(`Открываем «${file.name}»…`);
  try {
    for(const url of [sourceUrl,previewUrl,downloadUrl]) if(url) URL.revokeObjectURL(url);
    sourceUrl=previewUrl=downloadUrl=null;
    engine.reset();
    let next;
    sourceUrl=URL.createObjectURL(file);
    $('stage').hidden=false;
    try{next=await loadMetadata(video,sourceUrl);next.preview=sourceUrl;}catch{
      status('Готовим совместимый предпросмотр… Это может занять несколько минут.');
      await engine.upload(file);
      const converted=await engine.call('preview');previewUrl=URL.createObjectURL(new Blob([converted.bytes],{type:'video/mp4'}));
      next=await loadMetadata(video,previewUrl);next.preview=previewUrl;
    }
    if(token!==operation)return;
    source = {...next,file}; start = 0; end = Math.min(3,source.duration);
    if (end < .1) throw new Error('Видео должно быть не короче 0,1 секунды.');
    if(source.duration>600)throw new Error('Выберите видео длительностью до 10 минут.');
    $('drop').hidden=true; $('stage').hidden=false; $('timeline-panel').hidden=false; $('replace').hidden=false; $('empty-footer').hidden=true;
    $('total-time').textContent = `${Math.floor(source.duration/60)}:${String(Math.floor(source.duration%60)).padStart(2,'0')}`;
    update(true);status(`Видео «${file.name}» открыто. Выберите отрезок и нажмите «Создать стикер».`);
    // Thumbnails are optional: blocked frame decoding must not lock the editor.
    thumbnails(next.preview).catch(()=>{});
  } catch(error) { if(token===operation){source=null;status(error.message,true);} }
  finally { if(token===operation){loading = false; setBusy(false); $('file').value='';} }
}
window.stickerBoot.handler=upload;
for (const name of ['dragenter','dragover']) $('drop').addEventListener(name,event => { event.preventDefault(); $('drop').classList.add('dragover'); });
$('drop').addEventListener('dragleave',()=> $('drop').classList.remove('dragover'));
function shape(value) { if (busy) return; circle=value; $('stage').classList.toggle('circle',circle); for(const [id, selected] of [['circle',circle],['original',!circle]]) { $(id).classList.toggle('active',selected); $(id).setAttribute('aria-pressed',String(selected)); } $('shape-note').textContent = circle ? 'Круг по центру видео. Углы станут прозрачными.' : 'Видео целиком, без обрезки по краям.'; invalidate(); }
$('circle').onclick=()=>shape(true); $('original').onclick=()=>shape(false);
function changeStart(preserve=false){ if(busy) return; const value=$('start').valueAsNumber; if(!Number.isFinite(value)) return; const length=end-start; start=Math.max(0,Math.min(source.duration-.1,value)); if(start>=end-.1) end=Math.min(source.duration,start+length); if(end-start>3) end=start+3; update(true,preserve); }
function changeEnd(preserve=false){ if(busy) return; const value=$('end').valueAsNumber; if(!Number.isFinite(value)) return; end=Math.min(source.duration,Math.max(start+.1,value)); if(end-start>3) start=end-3; update(true,preserve); }
$('start').oninput=()=>changeStart(true); $('start').onchange=()=>changeStart();
$('end').oninput=()=>changeEnd(true); $('end').onchange=()=>changeEnd();
let drag = null;
$('timeline').onpointerdown=event=>{
  if(!source || busy) return;
  const bounds=$('timeline').getBoundingClientRect(), time=Math.max(0,Math.min(source.duration,(event.clientX-bounds.left)/bounds.width*source.duration));
  const mode=event.target.closest('#handle-start')?'start':event.target.closest('#handle-end')?'end':event.target.closest('#selection')?'move':'seek';
  if(mode==='seek') { video.currentTime=Math.max(start,Math.min(end-.02,time)); return; }
  drag={mode,x:event.clientX,start,end,width:bounds.width}; $('timeline').setPointerCapture(event.pointerId); video.pause(); event.preventDefault();
};
$('timeline').onpointermove=event=>{
  if(!drag) return;
  const delta=(event.clientX-drag.x)/drag.width*source.duration;
  if(drag.mode==='start') start=Math.max(0,end-3,Math.min(end-.1,drag.start+delta));
  if(drag.mode==='end') end=Math.min(source.duration,start+3,Math.max(start+.1,drag.end+delta));
  if(drag.mode==='move') { const length=drag.end-drag.start; start=Math.max(0,Math.min(source.duration-length,drag.start+delta)); end=start+length; }
  update(true);
};
$('timeline').onpointerup=$('timeline').onpointercancel=()=>{drag=null;};
for(const [id,mode] of [['handle-start','start'],['handle-end','end']]) $(id).onkeydown=event=>{ if(busy || !['ArrowLeft','ArrowRight'].includes(event.key)) return; event.preventDefault(); const delta=(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?.5:.05); if(mode==='start') start=Math.max(0,end-3,Math.min(end-.1,start+delta)); else end=Math.min(source.duration,start+3,Math.max(start+.1,end+delta)); update(true); };
async function play() { if(!source || loading) return; try { if(video.paused){if(video.currentTime<start || video.currentTime>=end-.04) video.currentTime=start; await video.play();} else video.pause(); } catch { status('Не удалось воспроизвести видео.',true); } }
$('play').onclick=play;
$('preview').onclick=async()=>{video.pause();video.currentTime=start;await play();};
video.onplay=()=>{$('play').textContent='Ⅱ';$('play').setAttribute('aria-label','Пауза');};
video.onpause=()=>{$('play').textContent='▶';$('play').setAttribute('aria-label','Воспроизвести');};
function tick(){if(source){$('playhead').style.left=`${video.currentTime/source.duration*100}%`;if(!video.paused && video.currentTime>=end){video.currentTime=start;}}requestAnimationFrame(tick);}tick();
$('export').onclick=async()=>{
  if(busy || !source) return;
  const token=++operation;
  setBusy(true);invalidate();video.pause();status('Загружаем видеодвижок (24 МБ при первом экспорте)…');
  try {
    await engine.upload(source.file);
    if(token!==operation)return;
    const result=await engine.call('export',{start,end,circle});
    if(token!==operation)return;
    if(downloadUrl)URL.revokeObjectURL(downloadUrl);
    downloadUrl=URL.createObjectURL(new Blob([result.bytes],{type:'video/webm'}));
    $('result-info').textContent=`${dec(result.size/1024)} КБ · ${dec(result.duration)} с · ${result.fps} кадр/с · WEBM / VP9${result.circle?' · прозрачные углы':''}`;
    $('download').href=downloadUrl;$('result').hidden=false;status('');$('result').scrollIntoView({behavior:'smooth',block:'nearest'});
  } catch(error) {if(token===operation)status(error.message,true);}
  finally{if(token===operation)setBusy(false);}
};
$('cancel').onclick=()=>{operation++;engine.reset();source=null;video.pause();setBusy(false);loading=false;$('file').value='';status('Обработка отменена. Выберите видео заново.');};
