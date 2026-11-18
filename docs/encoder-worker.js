/* FFmpeg runs in a dedicated worker; a scoped service worker supplies isolation on GitHub Pages. */
importScripts('./vendor/ffmpeg-core.js');
let core, log = '', complete;
async function load() {
  if (!core) {
    const coreURL = new URL('./vendor/ffmpeg-core.js', self.location.href).href;
    const logger=message=>{log=(log+'\n'+message).slice(-20000);if(message==='FFMPEG_END')complete?.();};
    core = await createFFmpegCore({ mainScriptUrlOrBlob:coreURL, locateFile:name=>new URL(`./vendor/${name}`,self.location.href).href, print:logger, printErr:logger });
  }
}
async function exec(args, allowFailure = false) {
  log = '';
  const argv=['./ffmpeg','-nostdin','-y','-hide_banner',...args],allocations=[];
  const ptr=core._malloc(argv.length*4);allocations.push(ptr);
  argv.forEach((arg,index)=>{const length=core.lengthBytesUTF8(arg)+1;const value=core._malloc(length);allocations.push(value);core.stringToUTF8(arg,value,length);core.setValue(ptr+index*4,value,'i32');});
  try{
    const finished=new Promise(resolve=>{complete=resolve;});
    core.cwrap('proxy_main','number',['number','number'])(argv.length,ptr);
    await finished;
    if(!allowFailure && /Error (?:while|initializing|opening)|Conversion failed|Invalid argument|Unknown encoder|Unrecognized option/i.test(log)) throw new Error('Ошибка обработки видео. Попробуйте MP4 или более короткий файл.');
    return log;
  } finally {complete=null;for(const address of allocations)core._free(address);}
}
function remove(name) { try { core.FS.unlink(name); } catch {} }
function metadata(text) {
  const time = text.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  const stream = text.split('\n').find(line => /Stream .*Video:/.test(line));
  const size = stream?.match(/\b(\d{2,5})x(\d{2,5})\b/);
  if (!time || !size) throw new Error('Не удалось прочитать видео. Попробуйте MP4, MOV или WEBM.');
  const duration=+time[1]*3600 + +time[2]*60 + +time[3];
  if(duration<.1 || duration>600) throw new Error('Выберите видео длительностью от 0,1 секунды до 10 минут.');
  return {duration,width:+size[1],height:+size[2]};
}
function filter(circle,fps) {
  const scale=circle?"crop='min(iw,ih)':'min(iw,ih)',scale=512:512":"scale=w='if(gte(iw,ih),512,-2)':h='if(gte(iw,ih),-2,512)'";
  const mask=circle?",format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='if(lte(hypot(X-255.5,Y-255.5),254.5),255,0)'":',format=yuva420p';
  return `${scale},setsar=1,fps=${fps}${mask}`;
}
self.onmessage=async({data:{id,type,data}})=>{
  try {
    await load();
    let result;
    if(type==='upload') {
      remove('source');remove('preview.mp4');remove('sticker.webm');
      core.FS.writeFile('source',new Uint8Array(data));
      result=metadata(await exec(['-i','source'],true));
    } else if(type==='preview') {
      await exec(['-i','source','-map','0:v:0','-an','-vf',"scale=w='min(720,iw)':h=-2,fps=24",'-c:v','libx264','-preset','ultrafast','-crf','28','-pix_fmt','yuv420p','-movflags','+faststart','preview.mp4']);
      result={bytes:core.FS.readFile('preview.mp4')}; remove('preview.mp4');
    } else if(type==='export') {
      const {start,end,circle}=data;
      if(![start,end].every(Number.isFinite)||start<0||end-start<.099||end-start>3.001) throw new Error('Выберите отрезок от 0,1 до 3 секунд.');
      const attempts=[[30,28],[30,36],[30,44],[30,52],[30,60],[24,63],[18,63],[12,63]];
      for(let index=0;index<attempts.length;index++) {
        const [fps,crf]=attempts[index];
        self.postMessage({id,type:'progress',message:index?'Подгоняем размер файла…':'Кодируем стикер…',progress:10+index*11});
        remove('sticker.webm');
        await exec(['-ss',String(start),'-i','source','-t',String(Math.min(3,end-start)),'-map','0:v:0','-an','-sn','-dn','-map_metadata','-1','-vf',filter(circle,fps),'-c:v','libvpx-vp9','-pix_fmt','yuva420p','-b:v','0','-crf',String(crf),'-deadline','good','-cpu-used','4','-threads','1','-auto-alt-ref','0','sticker.webm']);
        const size=core.FS.stat('sticker.webm').size;
        if(size<=256000) {result={bytes:core.FS.readFile('sticker.webm'),size,fps,duration:Math.min(3,end-start),circle};remove('sticker.webm');break;}
      }
      if(!result) throw new Error('Не удалось уложиться в 256 КБ. Выберите более короткий отрезок.');
    } else throw new Error('Неизвестная операция.');
    const transfer=result.bytes?[result.bytes.buffer]:[];
    self.postMessage({id,result},transfer);
  } catch(error) {self.postMessage({id,error:error.message || 'Не хватает памяти для обработки видео. Попробуйте файл меньшего размера.'});}
};
