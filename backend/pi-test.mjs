// Run inside a freshly created validation directory on the Pi. No third-party modules.
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
const base = 'http://127.0.0.1:8788', url = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
const report = { started: new Date().toISOString(), tests: {}, samples: [] };
const ports = () => spawnSync('ss', ['-ltnp', '( sport = :8787 or sport = :8788 )'], { encoding: 'utf8' }).stdout;
report.portsBefore = ports();
if (report.portsBefore.split('\n').some(line => /:8788\s/.test(line))) throw new Error('Port 8788 is occupied; no process will be stopped.');
report.processesBefore = spawnSync('ps', ['-eo', 'pid,ppid,comm,rss,pcpu'], { encoding: 'utf8' }).stdout;
report.memoryBefore = spawnSync('free', ['-m'], { encoding: 'utf8' }).stdout;
const child = spawn('nice', ['-n', '10', 'node', '--max-old-space-size=128', './vidfetch-backend.cjs'], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: '8788', YTDLP_PATH: '/usr/local/bin/yt-dlp', FFMPEG_PATH: '/usr/bin/ffmpeg' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '', monitor;
// If the SSH test is interrupted, stop only the backend this runner owns.
const stopOwned = () => { if (child.exitCode === null) child.kill('SIGTERM'); };
process.once('SIGTERM', stopOwned); process.once('SIGINT', stopOwned);
child.stdout.on('data', c => { log += c; }); child.stderr.on('data', c => { log += c; });
const post = body => fetch(base + '/api/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
const status = async token => (await fetch(base + `/api/download?status=${token}`)).json();
const preparation = async format_id => {
  const response = await post({ url, format_id, type: 'video' });
  const data = await response.json();
  if (response.status !== 201 || !data.ok) throw new Error(`Preparation failed: HTTP ${response.status} ${data.code || 'ENGINE_ERROR'}`);
  return data;
};
const assert = (value, message) => { if (!value) throw new Error(message); };
try {
  let response;
  for (let i = 0; i < 300; i++) {
    try { response = await fetch(base + '/api/health', { signal: AbortSignal.timeout(1000) }); break; } catch { await delay(100); }
  }
  assert(response, 'Backend did not start');
  report.tests.health = { http: response.status, body: await response.json() };
  assert(response.status === 200, 'An engine is missing');
  report.portsRunning = ports();
  assert(report.portsRunning.includes('127.0.0.1:8788'), 'Backend is not bound to loopback');
  monitor = setInterval(() => report.samples.push({ at: Date.now(), processes: spawnSync('ps', ['-eo', 'pid,ppid,comm,rss,pcpu'], { encoding: 'utf8' }).stdout,
    memory: spawnSync('free', ['-m'], { encoding: 'utf8' }).stdout }), 2000);
  const badJson = await fetch(base + '/api/fetch-info', { method: 'POST', body: '{' }); assert(badJson.status === 400, 'Invalid JSON status');
  const big = await fetch(base + '/api/fetch-info', { method: 'POST', body: JSON.stringify({ data: 'x'.repeat(10000) }) }); assert(big.status === 413, 'Large body status');
  const wrongType = await post({ url, format_id: '18', type: 'bad' }); assert(wrongType.status === 400, 'Invalid type status');
  const privateUrl = await fetch(base + '/api/fetch-info', { method: 'POST', body: JSON.stringify({ url: 'http://127.0.0.1:8787' }) }); assert(privateUrl.status === 400, 'Private URL status');
  report.tests.errors = { invalidJson: 400, tooLarge: 413, invalidType: 400, privateUrl: 400 };
  const infoResponse = await fetch(base + '/api/fetch-info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(100000) });
  const info = await infoResponse.json(); assert(info.ok, `Extraction failed: ${info.code}`);
  const candidates = info.info.formats.filter(f => f.kind === 'video' && (!f.filesize || f.filesize <= 100 * 1024 * 1024) && (f.height ?? 0) <= 360);
  const selected = candidates.find(f => f.progressive) || candidates.sort((a, b) => (a.height || 0) - (b.height || 0))[0];
  assert(selected, 'No suitable small video format'); report.format = { id: selected.id, height: selected.height };
  const ready = await preparation(selected.id);
  const busy = await post({ url, format_id: selected.id, type: 'video' }); assert(busy.status === 429, 'Concurrency failed');
  const download = await fetch(base + ready.downloadUrl, { signal: AbortSignal.timeout(600000) });
  const hash = createHash('sha256'); let bytes = 0;
  await pipeline(Readable.fromWeb(download.body), new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; hash.update(chunk); callback(null, chunk); } }), createWriteStream('./public-test.mp4', { flags: 'wx' }));
  await delay(200);
  const completed = await status(ready.token); assert(completed.status === 'completed' && completed.bytes === bytes, 'Completion/byte counter failed');
  const reused = await fetch(base + ready.downloadUrl); assert(reused.status === 404, 'Ticket was reusable');
  const probe = spawnSync('/usr/bin/ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name:format=duration,size', '-of', 'json', './public-test.mp4'], { encoding: 'utf8' });
  assert(probe.status === 0, 'ffprobe failed');
  report.tests.streaming = { http: download.status, bytes, sha256: hash.digest('hex'), completed, ticketReuse: reused.status, probe: JSON.parse(probe.stdout), concurrency: busy.status };
  const expiring = await preparation(selected.id);
  await delay(60500); // A single runtime timer, cleared by Node after firing; no SSH wait in the agent.
  assert((await status(expiring.token)).status === 'expired', 'Ticket did not expire');
  assert((await fetch(base + expiring.downloadUrl)).status === 404, 'Expired ticket was accepted'); report.tests.expiration = 'PASSED';
  const interrupted = await preparation(selected.id);
  const abort = new AbortController();
  const stream = await fetch(base + interrupted.downloadUrl, { signal: abort.signal });
  const reader = stream.body.getReader(); await reader.read(); abort.abort(); await reader.cancel().catch(() => {});
  await delay(1500); assert((await status(interrupted.token)).status === 'aborted', 'Disconnect was not recorded'); report.tests.disconnect = 'PASSED';
} catch (error) { report.failure = error.message; process.exitCode = 1; }
finally {
  clearInterval(monitor);
  const exit = new Promise(resolve => child.once('exit', resolve));
  if (child.exitCode === null) { child.kill('SIGTERM'); await exit; }
  report.backendExit = child.exitCode; report.portsAfter = ports();
  report.processesAfter = spawnSync('ps', ['-eo', 'pid,ppid,comm,rss,pcpu'], { encoding: 'utf8' }).stdout;
  report.memoryAfter = spawnSync('free', ['-m'], { encoding: 'utf8' }).stdout;
  await writeFile('./pi-results.json', JSON.stringify(report, null, 2), { flag: 'wx' });
  await writeFile('./pi-backend.log', log, { flag: 'wx' });
  console.log(JSON.stringify({ tests: report.tests, failure: report.failure, backendExit: report.backendExit }));
}
