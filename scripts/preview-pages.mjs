import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../docs/',import.meta.url));
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root)){res.writeHead(403);return res.end();}
  try {const info=await stat(file);res.writeHead(200,{'Content-Type':file.endsWith('.wasm')?'application/wasm':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html','Content-Length':info.size});createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}
}).listen(3211,'127.0.0.1',()=>console.log('GitHub Pages preview: http://127.0.0.1:3211'));
