// Uses the existing Git credential manager; never persists or prints credentials.
import { spawnSync } from 'node:child_process';
const result = spawnSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', windowsHide: true });
if (result.status !== 0) throw new Error('GitHub credential manager is unavailable.');
const values = Object.fromEntries(result.stdout.trim().split('\n').map(line => { const at=line.indexOf('='); return [line.slice(0,at),line.slice(at+1)]; }));
const headers = { Authorization: `Bearer ${values.password}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28' };
const endpoint='https://api.github.com/repos/grislytoe/stickers/pages';
let response=await fetch(endpoint,{headers});
if(process.argv.includes('--enable')) {
  response=await fetch(endpoint,{method:response.status===404?'POST':'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({source:{branch:'main',path:'/docs'},build_type:'legacy'})});
}
const data=await response.json();
console.log(JSON.stringify({status:response.status,url:data.html_url,state:data.status,message:data.message,source:data.source}));
if(!response.ok) process.exitCode=1;
