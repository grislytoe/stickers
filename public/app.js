const $ = id => document.getElementById(id);
const video = $('video');
let source = null, start = 0, end = 3, circle = false, busy = false, loading = false;
const dec = value => value.toFixed(2).replace('.', ',');
function status(message, error = false) { $('status').hidden = !message; $('status').textContent = message; $('status').className = error ? 'error' : ''; }
function setBusy(value) { busy = value; $('export').disabled = value || !source; for(const id of ['replace','drop','start','end','circle','original']) $(id).disabled = value; }
async function api(url, options) { const response = await fetch(url, options); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Ошибка обработки'); return data; }
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
function once(target, event) { return new Promise((resolve, reject) => { const done = () => { cleanup(); resolve(); }; const fail = () => { cleanup(); reject(new Error('Не удалось показать предпросмотр.')); }; const cleanup = () => { target.removeEventListener(event, done); target.removeEventListener('error', fail); }; target.addEventListener(event, done, { once: true }); target.addEventListener('error', fail, { once: true }); }); }
async function thumbnails(url) {
  const helper = document.createElement('video'); helper.muted = true; helper.preload = 'auto';
  const ready = once(helper, 'loadeddata'); helper.src = url; await ready;
  $('thumbs').replaceChildren();
  for (let i = 0; i < 12; i++) {
    const at = Math.max(.001, source.duration * (i+.5)/12);
    const seek = once(helper, 'seeked'); helper.currentTime = Math.min(at, helper.duration-.02); await seek;
    const canvas = document.createElement('canvas'); canvas.width=90; canvas.height=62;
    const ctx = canvas.getContext('2d'), scale = Math.max(90/helper.videoWidth,62/helper.videoHeight);
    ctx.drawImage(helper,(90-helper.videoWidth*scale)/2,(62-helper.videoHeight*scale)/2,helper.videoWidth*scale,helper.videoHeight*scale);
    $('thumbs').append(canvas);
  }
  helper.removeAttribute('src'); helper.load();
}
async function upload(file) {
  if (!file || busy) return;
  if (file.size > 250*1024*1024) return status('Выберите файл меньше 250 МБ.', true);
  setBusy(true); loading = true; invalidate(); video.pause(); status('Открываем видео и готовим предпросмотр…');
  try {
    const next = await api('/api/upload', { method: 'POST', headers: {'Content-Type':'application/octet-stream'}, body:file });
    const ready = once(video,'loadeddata'); video.src = next.preview; await ready;
    source = next; start = 0; end = Math.min(3,source.duration);
    if (end < .1) throw new Error('Видео должно быть не короче 0,1 секунды.');
    $('drop').hidden=true; $('stage').hidden=false; $('timeline-panel').hidden=false; $('replace').hidden=false; $('empty-footer').hidden=true;
    $('total-time').textContent = `${Math.floor(source.duration/60)}:${String(Math.floor(source.duration%60)).padStart(2,'0')}`;
    update(true); await thumbnails(next.preview); status('');
  } catch(error) { status(error.message,true); }
  finally { loading = false; setBusy(false); $('file').value=''; }
}
$('drop').onclick = $('replace').onclick = () => $('file').click();
$('file').onchange = event => upload(event.target.files[0]);
for (const name of ['dragenter','dragover']) $('drop').addEventListener(name,event => { event.preventDefault(); $('drop').classList.add('dragover'); });
for (const name of ['dragleave','drop']) $('drop').addEventListener(name,event => { event.preventDefault(); $('drop').classList.remove('dragover'); if(name==='drop') upload(event.dataTransfer.files[0]); });
// Prevent accidental navigation when a video is dropped outside the upload box.
window.addEventListener('dragover', event => event.preventDefault()); window.addEventListener('drop', event => event.preventDefault());
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
  setBusy(true);invalidate();video.pause();status('Подготовка стикера…');
  try {
    const job=await api('/api/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:source.id,start,end,circle})});
    for(;;){await new Promise(resolve=>setTimeout(resolve,650));const result=await api(`/api/jobs/${job.id}`);if(result.state==='error') throw new Error(result.error);if(result.state==='done'){$('result-info').textContent=`${dec(result.size/1024)} КБ · ${dec(result.duration)} с · ${result.fps} кадр/с · WEBM / VP9${result.circle?' · прозрачные углы':''}`;$('download').href=`/api/download/${job.id}`;$('result').hidden=false;status('');$('result').scrollIntoView({behavior:'smooth',block:'nearest'});break;}status(`${result.message} ${result.progress}%`);}
  } catch(error) {status(error.message,true);}
  finally{setBusy(false);}
};
