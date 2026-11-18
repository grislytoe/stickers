import http from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { run, parseMetadata, validateTrim, encode } from './encoder.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const data = path.join(root, '.data');
await mkdir(data, { recursive: true });
// Remove only this application's temporary files older than 24 hours.
for (const entry of await readdir(data, { withFileTypes: true })) {
  if (entry.isDirectory() && /^[a-f0-9-]{36}$/.test(entry.name)) {
    const dir = path.join(data, entry.name);
    if (Date.now() - (await stat(dir)).mtimeMs > 86400000) await rm(dir, { recursive: true });
  }
}
const videos = new Map(), jobs = new Map();
const port = Number(process.env.PORT || 3210);
const json = (res, code, value) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
async function body(req) { let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 8192) throw new Error('Слишком большой запрос.'); } return JSON.parse(text); }
function sendFile(req, res, filename, type, download = false) {
  return stat(filename).then(info => {
    let start = 0, end = info.size - 1, status = 200;
    const match = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (match) { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end; status = 206; }
    if (start > end || start >= info.size) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); return res.end(); }
    const headers = { 'Content-Type': type, 'Content-Length': end-start+1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
    if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
    if (download) headers['Content-Disposition'] = 'attachment; filename="telegram-sticker.webm"';
    res.writeHead(status, headers);
    createReadStream(filename, { start, end }).on('error', () => res.destroy()).pipe(res);
  });
}
let processing = false;
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Local-only app: reject DNS rebinding and cross-site mutation requests.
  const host = `127.0.0.1:${port}`;
  if (![host, `localhost:${port}`].includes(req.headers.host) || (req.headers.origin && ![`http://${host}`, `http://localhost:${port}`].includes(req.headers.origin))) return json(res, 403, { error: 'Доступ разрешён только локально.' });
  const url = new URL(req.url, `http://${host}`);
  try {
    if (req.method === 'GET' && ['/', '/app.js', '/style.css'].includes(url.pathname)) {
      const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      res.setHeader('Content-Type', { 'index.html': 'text/html; charset=utf-8', 'app.js': 'text/javascript; charset=utf-8', 'style.css': 'text/css; charset=utf-8' }[name]);
      return res.end(await readFile(path.join(root, 'public', name)));
    }
    if (req.method === 'POST' && url.pathname === '/api/upload') {
      if (processing) return json(res, 409, { error: 'Дождитесь завершения текущей обработки.' });
      processing = true;
      const id = randomUUID(), dir = path.join(data, id);
      try {
        await mkdir(dir);
        let size = 0;
        const limit = new Transform({ transform(chunk, enc, cb) { size += chunk.length; cb(size > 250 * 1024 * 1024 ? new Error('Файл больше 250 МБ.') : null, chunk); } });
        const input = path.join(dir, 'source');
        await pipeline(req, limit, createWriteStream(input));
        let info = '';
        try { await run(['-i', input]); } catch (error) { info = error.message; }
        const metadata = parseMetadata(info);
        if (metadata.duration <= 0 || metadata.duration > 600) throw new Error('Выберите видео длительностью до 10 минут.');
        await run(['-y', '-i', input, '-map', '0:v:0', '-an', '-vf', "scale=w='min(720,iw)':h=-2,fps=24", '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '25', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(dir, 'preview.mp4')]);
        videos.set(id, { input, dir, ...metadata });
        return json(res, 200, { id, ...metadata, preview: `/api/preview/${id}` });
      } catch (error) { await rm(dir, { recursive: true, force: true }); throw error; }
      finally { processing = false; }
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/preview/')) {
      const video = videos.get(url.pathname.split('/').pop());
      if (!video) return json(res, 404, { error: 'Видео не найдено.' });
      return await sendFile(req, res, path.join(video.dir, 'preview.mp4'), 'video/mp4');
    }
    if (req.method === 'POST' && url.pathname === '/api/export') {
      if (processing) return json(res, 409, { error: 'Дождитесь завершения текущей обработки.' });
      const options = await body(req), video = videos.get(options.id);
      if (!video) throw new Error('Сначала загрузите видео.');
      validateTrim(options.start, options.end, video.duration);
      if (typeof options.circle !== 'boolean') throw new Error('Некорректный режим обрезки.');
      const id = randomUUID(), output = path.join(video.dir, `${id}.webm`);
      const job = { state: 'working', progress: 0, message: 'Подготовка…', output };
      jobs.set(id, job); processing = true;
      encode(video.input, output, options, update => Object.assign(job, update))
        .then(result => Object.assign(job, { state: 'done', progress: 100, ...result }))
        .catch(error => { console.error(error.message); Object.assign(job, { state: 'error', error: 'Не удалось создать стикер. Попробуйте другой файл или более короткий отрезок.' }); })
        .finally(() => { processing = false; });
      return json(res, 202, { id });
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/jobs/')) {
      const job = jobs.get(url.pathname.split('/').pop());
      if (!job) return json(res, 404, { error: 'Задача не найдена.' });
      const { output, ...status } = job; return json(res, 200, status);
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/download/')) {
      const job = jobs.get(url.pathname.split('/').pop());
      if (!job || job.state !== 'done') return json(res, 404, { error: 'Стикер ещё не готов.' });
      return await sendFile(req, res, job.output, 'video/webm', true);
    }
    json(res, 404, { error: 'Не найдено.' });
  } catch (error) { console.error(error.message); if (!res.headersSent && !res.destroyed) json(res, 400, { error: error.message.includes('ffmpeg version') || error.message.includes('Stream #') ? 'Не удалось прочитать видео.' : error.message }); }
});
server.requestTimeout = 300000;
server.listen(port, '127.0.0.1', () => console.log(`Sticker Studio → http://127.0.0.1:${port}\nВидео обрабатываются локально. Для остановки нажмите Ctrl+C.`));
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Порт ${port} занят. Возможно, приложение уже запущено.` : error.message); process.exitCode = 1; });
