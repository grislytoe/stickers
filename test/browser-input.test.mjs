import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {loadMetadata} from '../docs/media.js';
test('file drop is cancelled and retained even before the editor module loads',async()=>{
  const window=new EventTarget(),document=new EventTarget();
  const status={hidden:true,textContent:'',className:''};
  document.readyState='loading';document.getElementById=id=>id==='status'?status:null;
  vm.runInNewContext(await readFile(new URL('../docs/bootstrap.js',import.meta.url),'utf8'),{window,document,console,setTimeout});
  const file={name:'clip.mp4'},event=new Event('drop',{cancelable:true});event.dataTransfer={files:[file]};
  assert.equal(window.dispatchEvent(event),false);
  assert.equal(window.stickerBoot.file,file);assert.match(status.textContent,/clip.mp4/);
  let count=0;window.stickerBoot.handler=()=>count++;
  const next=new Event('drop',{cancelable:true});next.dataTransfer={files:[file]};window.dispatchEvent(next);
  assert.equal(count,1);
  const chosen={name:'phone.mov'},change=new Event('change');
  Object.defineProperty(change,'target',{value:{id:'file',files:[chosen]}});document.dispatchEvent(change);
  assert.equal(window.stickerBoot.file,chosen);assert.equal(count,2);
  window.stickerBoot.busy=true;
  const busy=new Event('drop',{cancelable:true});busy.dataTransfer={files:[file]};assert.equal(window.dispatchEvent(busy),false);assert.equal(count,2);
});
test('mobile metadata is sufficient without a loadeddata event',async()=>{
  const video=new EventTarget();Object.assign(video,{duration:2,videoWidth:720,videoHeight:1280,readyState:0,load(){queueMicrotask(()=>this.dispatchEvent(new Event('loadedmetadata')));}});
  assert.deepEqual(await loadMetadata(video,'blob:video'),{duration:2,width:720,height:1280});
  assert.equal(video.playsInline,true);assert.equal(video.preload,'metadata');
});
test('preview failure and timeout report an error instead of hanging',async()=>{
  const video=new EventTarget();video.load=()=>{};
  await assert.rejects(loadMetadata(video,'blob:broken',5),/предпросмотр/);
});
