export class BrowserEngine {
  constructor(onProgress) {this.onProgress=onProgress;this.pending=new Map();this.nextId=0;}
  reset() {
    this.worker?.terminate();
    for(const {reject,timer} of this.pending.values()) {clearTimeout(timer);reject(new Error('Обработка отменена.'));}
    this.pending.clear();this.worker=null;
  }
  call(type,data,transfer=[]) {
    if(typeof SharedArrayBuffer==='undefined') return Promise.reject(new Error('Видеодвижок ещё не готов. Обновите страницу. Если ошибка повторится, откройте ссылку в обычном современном браузере вне мессенджера.'));
    if(!this.worker) {
      this.worker=new Worker(new URL('./encoder-worker.js',import.meta.url));
      this.worker.onmessage=({data})=>{
        const task=this.pending.get(data.id);if(!task)return;
        if(data.type==='progress') return this.onProgress?.(data);
        clearTimeout(task.timer);this.pending.delete(data.id);
        data.error?task.reject(new Error(data.error)):task.resolve(data.result);
      };
      this.worker.onerror=()=>{this.reset();this.onProgress?.({error:'Браузер не смог запустить обработку. Обновите страницу или попробуйте другой браузер.'});};
    }
    return new Promise((resolve,reject)=>{
      const id=++this.nextId;
      const timer=setTimeout(()=>{this.reset();},600000);
      this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({id,type,data},transfer);
    });
  }
  async upload(file) {
    // Release the previous WASM heap when selecting a new source.
    this.reset();
    const bytes=await file.arrayBuffer();return this.call('upload',bytes,[bytes]);
  }
}
