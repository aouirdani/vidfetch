import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createWriteStream } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
const bundle = resolve(process.argv[2] || 'backend/artifacts/vidfetch-backend-candidate-2.cjs');
const directory = resolve(process.argv[3] || `backend/artifacts/live-${Date.now()}`);
await mkdir(directory, { recursive: false });
const port = 18788, base = `http://127.0.0.1:${port}`;
const probe = createServer();
probe.listen(port, '127.0.0.1', { exclusive: true }); await once(probe, 'listening');
await new Promise(resolve => probe.close(resolve));
const ytdlp = resolve('.media-bin/yt-dlp');
const ffmpeg = '/opt/homebrew/bin/ffmpeg';
const child = spawn(process.execPath, ['--max-old-space-size=128', bundle], {
  cwd: directory, env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), YTDLP_PATH: ytdlp, FFMPEG_PATH: ffmpeg }, stdio: ['ignore', 'pipe', 'pipe'],
});
const result = { started: new Date().toISOString(), node: process.version, pid: child.pid, bundle, source: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', maxRssKiB: 0, tests: {} };
let log = '', monitoring;
child.stdout.on('data', c => { log += c; }); child.stderr.on('data', c => { log += c; });
const sample = () => {
  const r = spawnSync('ps', ['-axo', 'pid=,ppid=,rss=,comm='], { encoding: 'utf8' });
  const processes = r.stdout.split('\n').map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/)).filter(Boolean)
    .map(match => ({ pid: Number(match[1]), ppid: Number(match[2]), rss: Number(match[3]), executable: match[4] }));
  const owned = new Set([child.pid]);
  for (let i = 0; i < 10; i++) for (const p of processes) if (owned.has(p.ppid)) owned.add(p.pid);
  const family = processes.filter(p => owned.has(p.pid));
  result.maxRssKiB = Math.max(result.maxRssKiB, family.find(p => p.pid === child.pid)?.rss || 0);
  const total = family.reduce((sum, p) => sum + p.rss, 0);
  if (total > (result.maxFamilyRssKiB || 0)) { result.maxFamilyRssKiB = total; result.peakFamily = family; }
};
const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(100000) });
try {
  let health;
  for (let i = 0; i < 100; i++) {
    try { health = await fetch(base + '/api/health', { signal: AbortSignal.timeout(1000) }); break; } catch { await delay(100); }
  }
  if (!health) throw new Error('Backend did not start');
  result.tests.health = { http: health.status, body: await health.json() };
  sample(); result.idleRssKiB = result.maxRssKiB; monitoring = setInterval(sample, 500);
  const invalid = await post('/api/fetch-info', { url: 'http://127.0.0.1:8787' });
  result.tests.invalidUrl = { http: invalid.status, body: await invalid.json() };
  const infoResponse = await post('/api/fetch-info', { url: result.source });
  const info = await infoResponse.json();
  if (!info.ok) {
    result.tests.publicMedia = { state: 'FAILED', http: infoResponse.status, code: info.code, error: info.error };
  } else {
    const formats = info.info.formats.filter(f => f.kind === 'video' && (!f.filesize || f.filesize <= 100 * 1024 * 1024));
    const selected = formats.filter(f => f.progressive && (f.height ?? 0) <= 480).sort((a, b) => (a.height ?? 0) - (b.height ?? 0))[0]
      || formats.filter(f => (f.height ?? 0) <= 360).sort((a, b) => (a.height ?? 0) - (b.height ?? 0))[0];
    if (!selected) throw new Error('No suitable small test video format');
    result.format = { id: selected.id, height: selected.height, ext: selected.ext };
    const readyResponse = await post('/api/download', { url: result.source, format_id: selected.id, type: 'video' });
    const ready = await readyResponse.json();
    result.tests.prepare = { http: readyResponse.status, ok: ready.ok, code: ready.code };
    if (ready.ok) {
      const response = await fetch(base + ready.downloadUrl, { signal: AbortSignal.timeout(600000) });
      const hash = createHash('sha256'); let bytes = 0;
      const file = resolve(directory, ready.filename);
      await pipeline(Readable.fromWeb(response.body), new Transform({ transform(chunk, encoding, callback) { hash.update(chunk); bytes += chunk.length; callback(null, chunk); } }), createWriteStream(file, { flags: 'wx' }));
      await delay(100);
      const status = await (await fetch(base + `/api/download?status=${ready.token}`)).json();
      const reuse = await fetch(base + ready.downloadUrl);
      const ffprobe = spawnSync('/opt/homebrew/bin/ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,codec_type', '-of', 'json', file], { encoding: 'utf8' });
      result.tests.publicMedia = { state: 'PASSED', http: response.status, bytes, sha256: hash.digest('hex'), status, reuseHttp: reuse.status,
        probeExit: ffprobe.status, probe: JSON.parse(ffprobe.stdout || '{}') };
      if (status.status !== 'completed' || status.bytes !== bytes || reuse.status !== 404 || ffprobe.status !== 0) throw new Error('Media verification failed');
    }
  }
} catch (error) { result.error = error.code || error.name || 'Error'; result.tests.publicMedia ??= { state: 'FAILED', error: 'Live test could not complete.' }; }
finally {
  clearInterval(monitoring); sample();
  if (child.exitCode === null) child.kill('SIGTERM');
  if (child.exitCode === null) await once(child, 'exit');
  result.backendExit = child.exitCode;
  await writeFile(resolve(directory, 'results.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  await writeFile(resolve(directory, 'backend.log'), log, { flag: 'wx' });
  console.log(JSON.stringify(result, null, 2));
}
