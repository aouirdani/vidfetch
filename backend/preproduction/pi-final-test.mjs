// Temporary Pi validation of the unchanged corrected bundle, including real 30-minute retention.
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';

const base = 'http://127.0.0.1:8788', url = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
const report = { started: new Date().toISOString(), tests: {}, retention: [] };
const ports = () => spawnSync('ss', ['-ltnp', '( sport = :8787 or sport = :8788 )'], { encoding: 'utf8' }).stdout;
report.portsBefore = ports();
if (report.portsBefore.split('\n').some(line => /:8788\s/.test(line))) throw new Error('8788 is occupied; no existing process will be stopped');
const child = spawn('nice', ['-n', '10', '/usr/local/bin/node', '--max-old-space-size=128', './vidfetch-backend.cjs'], {
  env: { ...process.env, HOST:'127.0.0.1', PORT:'8788', YTDLP_PATH:'/usr/local/bin/yt-dlp', FFMPEG_PATH:'/usr/bin/ffmpeg' },
  stdio:['ignore', 'pipe', 'pipe'],
});
const backendExit = once(child, 'exit');
const cancellation = new AbortController();
const stopOwned = () => { cancellation.abort(); if (child.exitCode === null) child.kill('SIGTERM'); };
process.once('SIGTERM', stopOwned); process.once('SIGINT', stopOwned);
let log = '';
child.stdout.on('data', c => { log = (log + c).slice(-16000); });
child.stderr.on('data', c => { log = (log + c).slice(-16000); });
const assert = (value, message) => { if (!value) throw new Error(message); };
const getStatus = async token => {
  const r = await fetch(base + `/api/download?status=${token}`, { signal:AbortSignal.timeout(5000) });
  return { http:r.status, body:await r.json() };
};
const post = body => fetch(base + '/api/download', { method:'POST', headers:{'Content-Type':'application/json'},
  body:JSON.stringify(body), signal:AbortSignal.any([cancellation.signal, AbortSignal.timeout(180000)]) });
const prepare = async (format_id, type) => {
  const r = await post({ url, format_id, type }); const data = await r.json();
  assert(r.status === 201 && data.ok, `Preparation ${type}: HTTP ${r.status} ${data.code || 'ENGINE_ERROR'}`);
  return data;
};
const completed = [];
const transfer = async (ready, file, kind) => {
  const r = await fetch(base + ready.downloadUrl, { signal:AbortSignal.any([cancellation.signal, AbortSignal.timeout(600000)]) });
  assert(r.status === 200, `Streaming ${kind} failed: HTTP ${r.status}`);
  const hash = createHash('sha256'); let bytes = 0;
  await pipeline(Readable.fromWeb(r.body), new Transform({ transform(chunk, _, done) {
    bytes += chunk.length; hash.update(chunk); done(null, chunk);
  } }), createWriteStream(file, {flags:'wx'}));
  let status;
  for(let i=0;i<30;i++) {
    status = await getStatus(ready.token);
    if(status.body.status === 'completed') break;
    await delay(100, undefined, {signal:cancellation.signal});
  }
  const observedCompletedAt = Date.now();
  assert(status.body.status === 'completed' && status.body.bytes === bytes && status.body.error === null, `${kind} completion/counter mismatch`);
  const probe = spawnSync('/usr/bin/ffprobe', ['-v','error','-show_entries','stream=codec_name,codec_type:format=duration,size','-of','json',file], {encoding:'utf8',timeout:30000});
  assert(probe.status === 0, `${kind} ffprobe failed`);
  const media = JSON.parse(probe.stdout);
  assert(Number(media.format.size) === bytes, `${kind} file size mismatch`);
  if(kind === 'audio') assert(media.streams.some(s => s.codec_name === 'mp3') && !media.streams.some(s => s.codec_type === 'video'), 'Expected MP3 audio only');
  else assert(media.streams.some(s => s.codec_type === 'video') && media.streams.some(s => s.codec_type === 'audio'), 'Expected video and audio');
  const reuse = await fetch(base + ready.downloadUrl, {signal:AbortSignal.timeout(5000)});
  assert(reuse.status === 404, `${kind} ticket reuse accepted`); await reuse.body?.cancel();
  completed.push({token:ready.token,kind,at:observedCompletedAt});
  report.tests[kind] = { http:r.status, contentType:r.headers.get('content-type'), bytes, sha256:hash.digest('hex'),
    status:status.body, probe:media, ticketReuse:reuse.status, observedCompletedAt:new Date(observedCompletedAt).toISOString() };
};
try {
  let health;
  for(let i=0;i<800;i++) {
    cancellation.signal.throwIfAborted();
    try { health = await fetch(base + '/api/health', {signal:AbortSignal.timeout(1000)}); break; }
    catch { await delay(100, undefined, {signal:cancellation.signal}); }
  }
  assert(health?.status === 200, 'Backend health unavailable');
  report.tests.health = {http:health.status,body:await health.json()};
  report.portsRunning = ports(); assert(report.portsRunning.includes('127.0.0.1:8788'), 'Not loopback bound');
  const infoResponse = await fetch(base + '/api/fetch-info', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal:AbortSignal.timeout(100000)});
  const info = await infoResponse.json(); assert(infoResponse.status === 200 && info.ok, 'Extraction failed');
  const formats = info.info.formats.filter(f => f.kind === 'video' && (f.height || 0) <= 360 && (!f.filesize || f.filesize <= 100*1024*1024));
  const chosen = formats.find(f => f.progressive) || formats.sort((a,b) => (a.height||0)-(b.height||0))[0];
  assert(chosen, 'No small authorized video format');
  assert(info.info.audioFormats.some(f => f.id === 'mp3'), 'MP3 format absent');
  report.format = {id:chosen.id,height:chosen.height};
  const video = await prepare(chosen.id, 'video');
  const busy = await post({url,format_id:'mp3',type:'audio'}); assert(busy.status === 429, 'Concurrency failed');
  await busy.body?.cancel(); report.tests.concurrency = 429;
  await transfer(video, 'public-test.mp4', 'video');
  const mp3 = await prepare('mp3','audio'); await transfer(mp3,'public-test.mp3','audio');
  // Decode both complete files using only diagnostic processes owned by this test.
  for(const [file, kind] of [['public-test.mp4','video'],['public-test.mp3','audio']]) {
    const args = ['-hide_banner','-loglevel','error','-xerror','-err_detect','explode','-threads','1','-i',file,'-map','0'];
    if(kind === 'video') args.push('-fps_mode:v','passthrough','-enc_time_base:v','demux');
    args.push('-f','null','-');
    const decode = spawn('nice',['-n','19','/usr/bin/ffmpeg',...args],{stdio:['ignore','ignore','pipe']});
    let diagnostic=''; decode.stderr.on('data', c => { diagnostic=(diagnostic+c).slice(-8000); });
    const timer=setTimeout(()=>decode.kill('SIGKILL'),180000);
    const abort=()=>decode.kill('SIGKILL'); cancellation.signal.addEventListener('abort',abort,{once:true});
    let code;
    try { [code] = await once(decode,'exit'); }
    finally {clearTimeout(timer);cancellation.signal.removeEventListener('abort',abort);}
    report.tests[kind].fullDecode={exit:code,stderr:diagnostic};
    assert(code===0 && diagnostic==='',`${kind} full decode failed`);
  }
  await writeFile('pi-media-results.json',JSON.stringify({started:report.started,tests:report.tests,format:report.format},null,2),{flag:'wx'});
  console.log(JSON.stringify({stage:'media-completed',tests:report.tests,retentionMinutes:30}));
  // Keep the exact production TTL and wall clock; polling must not prolong retention.
  const events=completed.flatMap(item => [{...item,stage:'before',target:item.at+1790000},{...item,stage:'after',target:item.at+1801500}]).sort((a,b)=>a.target-b.target);
  for(const item of completed) {
    const early=await getStatus(item.token); assert(early.http===200 && early.body.status==='completed','Early retained status absent');
    report.retention.push({kind:item.kind,stage:'early',elapsedMs:Date.now()-item.at,http:early.http,status:early.body.status});
  }
  for(const event of events) {
    await delay(Math.max(0,event.target-Date.now()),undefined,{signal:cancellation.signal});
    const observed=await getStatus(event.token);
    report.retention.push({kind:event.kind,stage:event.stage,elapsedMs:Date.now()-event.at,http:observed.http,status:observed.body.status,code:observed.body.code});
    if(event.stage==='before') assert(observed.http===200 && observed.body.status==='completed','Status expired before 30 minutes');
    else assert(observed.http===404 && observed.body.code==='EXPIRED','Status polling extended retention beyond 30 minutes');
    console.log(JSON.stringify({stage:'retention',observation:report.retention.at(-1)}));
  }
  report.tests.retention='PASSED';
} catch(error) {report.failure=error.message;process.exitCode=1;}
finally {
  if(child.exitCode===null) child.kill('SIGTERM');
  await backendExit;
  report.backendExit=child.exitCode; report.portsAfter=ports();report.finished=new Date().toISOString();
  await writeFile('pi-results.json',JSON.stringify(report,null,2),{flag:'wx'});
  await writeFile('pi-backend.log',log,{flag:'wx'});
  console.log(JSON.stringify({stage:'finished',failure:report.failure,backendExit:report.backendExit,retention:report.retention}));
}
