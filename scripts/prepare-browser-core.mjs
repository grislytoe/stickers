// Lower the imported memory minimum of the pinned Emscripten build, without
// changing instructions or the maximum. Its default reserves 1 GiB on phones.
import {readFile,writeFile} from 'node:fs/promises';
const file=new URL('../docs/vendor/ffmpeg-core.wasm',import.meta.url);
const bytes=await readFile(file);
let at=8;
function read(){let value=0,shift=0,part;do{part=bytes[at++];value+=(part&127)*2**shift;shift+=7;}while(part&128);return value;}
function leb(value){const out=[];do{let part=value&127;value>>>=7;out.push(part|(value?128:0));}while(value);return Buffer.from(out);}
function name(){const length=read();at+=length;}
let patch;
while(at<bytes.length){
  const id=bytes[at++],sizeAt=at,length=read(),bodyAt=at,end=at+length;
  if(id===2){
    const count=read();
    for(let index=0;index<count;index++){
      name();name();const kind=bytes[at++];
      if(kind===0)read();
      else if(kind===1){at++;const flags=read();read();if(flags&1)read();}
      else if(kind===2){const flags=read(),start=at,minimum=read(),finish=at;if(flags&1)read();
        if(minimum===2048){console.log('WASM memory minimum is already 128 MiB.');process.exit(0);}
        if(minimum!==16384)throw new Error('Unexpected WASM build: memory minimum changed.');
        patch={sizeAt,bodyAt,end,start,finish};
      }else if(kind===3){at+=2;}else throw new Error('Unsupported WASM import kind.');
    }
  }
  at=end;
}
if(!patch)throw new Error('Memory import not found.');
const {sizeAt,bodyAt,end,start,finish}=patch;
const body=Buffer.concat([bytes.subarray(bodyAt,start),leb(2048),bytes.subarray(finish,end)]);
const result=Buffer.concat([bytes.subarray(0,sizeAt),leb(body.length),body,bytes.subarray(end)]);
if(!WebAssembly.validate(result))throw new Error('Patched WASM failed validation.');
await writeFile(file,result);
console.log('WASM imported memory minimum: 1 GiB → 128 MiB.');
