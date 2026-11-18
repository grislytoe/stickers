import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run, encode, validateTrim, parseMetadata } from '../encoder.mjs';
test('trim rejects invalid and out-of-bounds segments', () => {
  validateTrim(1,4,5);
  for (const args of [[0,3.1,5],[-1,1,5],[2,1,5],[0,NaN,5],[0,2,1],[0,.02,1]]) assert.throws(()=>validateTrim(...args));
});
test('real FFmpeg export: dimensions, duration, audio removal, size and circular alpha', {timeout:180000}, async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'stickers-test-'));
  try {
    const input=path.join(dir,'input.mp4');
    await run(['-y','-f','lavfi','-i','testsrc2=size=640x360:rate=30','-f','lavfi','-i','sine=frequency=440','-t','4','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',input]);
    for (const circle of [false,true]) {
      const output=path.join(dir,`${circle}.webm`);
      const result=await encode(input,output,{start:1,end:4,circle});
      assert.ok(result.size<=256000); assert.equal((await stat(output)).size,result.size);
      let info=''; try { await run(['-i',output]); } catch(error) {info=error.message;}
      const meta=parseMetadata(info);
      assert.equal(Math.max(meta.width,meta.height),512);assert.ok(meta.duration<=3);assert.match(info,/Video: vp9/);assert.doesNotMatch(info,/Audio:/);
      if(circle){
        assert.equal(meta.width,512);assert.equal(meta.height,512);
        const raw=path.join(dir,'frame.rgba');
        await run(['-y','-c:v','libvpx-vp9','-i',output,'-frames:v','1','-f','rawvideo','-pix_fmt','rgba',raw]);
        const pixels=await readFile(raw); assert.equal(pixels[3],0); assert.equal(pixels[(256*512+256)*4+3],255);
      }
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});
