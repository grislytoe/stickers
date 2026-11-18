import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export const ffmpeg = process.env.FFMPEG_PATH || fileURLToPath(new URL(`./bin/ffmpeg${process.platform === 'win32' ? '.exe' : ''}`, import.meta.url));
export function run(args, timeout = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ['-hide_banner', '-nostdin', ...args], { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-24000); });
    child.stdout.resume();
    const timer = setTimeout(() => { child.kill(); reject(new Error('Обработка заняла слишком много времени. Попробуйте более короткое видео.')); }, timeout);
    child.on('error', error => { clearTimeout(timer); reject(new Error(`Не удалось запустить FFmpeg: ${error.message}`)); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(stderr) : reject(new Error(stderr)); });
  });
}
export function parseMetadata(text) {
  const time = text.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  const stream = text.split('\n').find(line => /Stream .*Video:/.test(line));
  const size = stream?.match(/\b(\d{2,5})x(\d{2,5})\b/);
  if (!time || !size) throw new Error('Не удалось прочитать видео. Выберите обычный видеофайл.');
  return { duration: Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]), width: Number(size[1]), height: Number(size[2]) };
}
export function validateTrim(start, end, duration) {
  if (![start, end, duration].every(Number.isFinite) || start < 0 || end > duration + .025 || end - start < .1 || end - start > 3.001) throw new Error('Выберите отрезок от 0,1 до 3 секунд в пределах видео.');
}
export function filter(circle, fps) {
  const scale = circle ? "crop='min(iw,ih)':'min(iw,ih)',scale=512:512" : "scale=w='if(gte(iw,ih),512,-2)':h='if(gte(iw,ih),-2,512)'";
  const mask = circle ? ",format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='if(lte(hypot(X-255.5,Y-255.5),254.5),255,0)'" : ',format=yuva420p';
  return `${scale},setsar=1,fps=${fps}${mask}`;
}
export async function encode(input, output, { start, end, circle }, progress = () => {}) {
  const attempts = [[30,28],[30,36],[30,44],[30,52],[30,60],[24,63],[18,63],[12,63]];
  for (let i = 0; i < attempts.length; i++) {
    const [fps, crf] = attempts[i];
    progress({ progress: 10 + i * 11, message: i ? 'Подгоняем размер файла…' : 'Кодируем стикер…' });
    await run(['-y', '-ss', String(start), '-i', input, '-t', String(Math.min(3, end-start)), '-map', '0:v:0', '-an', '-sn', '-dn', '-map_metadata', '-1', '-vf', filter(circle, fps), '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', String(crf), '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', '-threads', '4', '-auto-alt-ref', '0', output]);
    const { size } = await stat(output);
    if (size <= 256000) return { size, fps, duration: Math.min(3, end-start), circle };
  }
  throw new Error('Не удалось уложиться в 256 КБ. Выберите более короткий отрезок.');
}
