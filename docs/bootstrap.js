/* Register native file events before loading any modules or WASM. */
(() => {
  const state=window.stickerBoot={file:null,handler:null,busy:false};
  let closePicker;
  function pickerClosed(){closePicker?.();closePicker=null;state.pickerDone=null;}
  function message(text,error=false){const box=document.getElementById('status');if(box){box.hidden=false;box.textContent=text;box.className=error?'error':'';}}
  function accept(file){
    if(!file||state.busy)return;
    state.file=file;
    message(`Открываем «${file.name}»…`);
    if(state.handler){state.delivered=file;state.handler(file);}
  }
  window.addEventListener('dragover',event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect=state.busy?'none':'copy';},{capture:true,passive:false});
  window.addEventListener('drop',event=>{
    event.preventDefault();event.stopPropagation();
    const file=event.dataTransfer?.files?.[0];
    document.getElementById('drop')?.classList.remove('dragover');
    if(file)accept(file);else message('Перетащите сам видеофайл из папки или выберите его кнопкой.',true);
  },{capture:true,passive:false});
  document.addEventListener('change',event=>{if(event.target.id==='file'){accept(event.target.files?.[0]);pickerClosed();}},true);
  document.addEventListener('cancel',event=>{if(event.target.id==='file')pickerClosed();},true);
  window.addEventListener('focus',()=>{if(closePicker)setTimeout(pickerClosed,250);});
  document.addEventListener('click',event=>{
    if(event.target.closest?.('#drop,#replace')&&!state.busy){event.preventDefault();state.pickerDone=new Promise(resolve=>{closePicker=resolve;});document.getElementById('file').click();}
  });
  // One local temporary file survives only the isolation reload and is consumed
  // immediately afterwards. No file is sent to a network endpoint.
  async function pendingFile(mode,file){
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('sticker-reload',1);request.onupgradeneeded=()=>request.result.createObjectStore('files');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    try{return await new Promise((resolve,reject)=>{
      const tx=db.transaction('files','readwrite'),store=tx.objectStore('files');let value;
      if(mode==='save')store.put(file,'pending');
      else {const request=store.get('pending');request.onsuccess=()=>{value=request.result;store.delete('pending');};}
      tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });}finally{db.close();}
  }
  state.saveForReload=async()=>{if(state.file)await pendingFile('save',state.file);};
  async function start(){
    try{
      await import('./app.js?v=3');
      const restored=await Promise.race([pendingFile('take').catch(()=>null),new Promise(resolve=>setTimeout(()=>resolve(null),2000))]);
      if(restored&&!state.file)state.file=restored;
      if(state.file&&!state.busy&&state.delivered!==state.file){state.delivered=state.file;state.handler?.(state.file);}
    }catch(error){console.error(error);message('Не удалось загрузить редактор. Обновите страницу или откройте ссылку в обычном браузере.',true);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
