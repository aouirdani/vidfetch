// Observe the existing temporary test runner; never manipulate pre-existing services.
import { spawn, spawnSync } from 'node:child_process';
import { readFile, readlink, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { once } from 'node:events';
import { resolve } from 'node:path';

if (!/^\/home\/user\/vidfetch-backend-validation-[A-Za-z0-9_-]+$/.test(process.cwd())) throw new Error('Use a newly created dedicated validation directory');
const ticks = Number(spawnSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).stdout.trim());
if (!ticks) throw new Error('Could not read CPU clock ticks');
const report = { started: new Date().toISOString(), clockTicks: ticks, samples: [], backendPids: [], observedEngineIdentities: [], tests: {} };
const processStats = async () => {
  const results = await Promise.all(readdirSync('/proc').filter(name => /^\d+$/.test(name)).map(async name => {
    try {
      const [stat, status] = await Promise.all([readFile(`/proc/${name}/stat`, 'utf8'), readFile(`/proc/${name}/status`, 'utf8')]);
      const tail = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      return { pid: Number(name), ppid: Number(tail[1]), state: tail[0], ticks: Number(tail[11]) + Number(tail[12]), start: tail[19],
        rssKiB: Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] || 0), hwmKiB: Number(status.match(/^VmHWM:\s+(\d+)/m)?.[1] || 0),
        comm: stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')')) };
    } catch { return null; }
  }));
  return results.filter(Boolean);
};
const sockets = () => spawnSync('ss', ['-H', '-ltnp'], { encoding: 'utf8' }).stdout;
const services = async () => {
  const listening = sockets(), processes = await processStats();
  const magic = [];
  for (const p of processes.filter(p => /node|electron/i.test(p.comm))) {
    try { if (/magicmirror/i.test(await readlink(`/proc/${p.pid}/cwd`))) magic.push({ pid: p.pid, start: p.start, comm: p.comm }); } catch {}
  }
  const port = async number => {
    const line = listening.split('\n').find(line => new RegExp(`:${number}\\s`).test(line));
    if (!line) return { listening: false };
    const pid = Number(line.match(/pid=(\d+)/)?.[1]) || null;
    let http;
    try { const response = await fetch(`http://127.0.0.1:${number}/`, { signal: AbortSignal.timeout(2000) }); http = response.status; await response.body?.cancel(); }
    catch { http = null; }
    return { listening: true, pid, start: processes.find(p => p.pid === pid)?.start, http };
  };
  return { magicMirrorProcesses: magic, port8080: await port(8080), port8787: await port(8787) };
};
const initial = await processStats();
report.servicesBefore = await services();
report.existingMediaProcesses = initial.filter(p => /yt-dlp|ffmpeg/i.test(p.comm)).map(p => ({ pid: p.pid, start: p.start, comm: p.comm }));
const identities = new Map(), previous = new Map();
let lastSample = Date.now(), child, sampling = false, phase = 'starting', extra;
const sample = async () => {
  if (sampling) return;
  sampling = true;
  try {
    const now = Date.now(), processes = await processStats();
    for (const p of processes.filter(p => p.comm === 'node')) {
      try {
        if (await readlink(`/proc/${p.pid}/cwd`) !== process.cwd()) continue;
        const args = (await readFile(`/proc/${p.pid}/cmdline`, 'utf8')).split('\0');
        if (args.some(arg => resolve(arg) === resolve('vidfetch-backend.cjs'))) {
          if (!report.backendPids.includes(p.pid)) report.backendPids.push(p.pid);
        }
      } catch {}
    }
    const owned = new Set(report.backendPids.filter(pid => processes.some(p => p.pid === pid)));
    for (let i = 0; i < 8; i++) for (const p of processes) if (owned.has(p.ppid)) owned.add(p.pid);
    const family = processes.filter(p => owned.has(p.pid));
    let deltaTicks = 0;
    for (const p of family) {
      const key = `${p.pid}:${p.start}`, prior = previous.get(key);
      if (prior !== undefined) deltaTicks += Math.max(0, p.ticks - prior);
      previous.set(key, p.ticks); identities.set(key, { pid: p.pid, start: p.start, comm: p.comm });
    }
    const memory = await readFile('/proc/meminfo', 'utf8');
    report.samples.push({ at: new Date(now).toISOString(), phase, backend: family.filter(p => report.backendPids.includes(p.pid)), family,
      familyRssKiB: family.reduce((sum, p) => sum + p.rssKiB, 0), familyCpuPercentOneCore: now === lastSample ? 0 : deltaTicks / ticks / ((now - lastSample) / 1000) * 100,
      availableKiB: Number(memory.match(/^MemAvailable:\s+(\d+)/m)?.[1]), swapFreeKiB: Number(memory.match(/^SwapFree:\s+(\d+)/m)?.[1]) });
    lastSample = now;
    if (!extra && sockets().split('\n').some(line => /:8788\s/.test(line))) {
      const http = spawn('node', ['pi-http-extra.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] });
      http.stdout.on('data', chunk => process.stdout.write(chunk)); http.stderr.on('data', () => {});
      extra = once(http, 'exit').then(([code]) => code);
    }
  } finally { sampling = false; }
};
child = spawn('node', ['pi-test.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] });
const stopRunner = () => { if (child.exitCode === null) child.kill('SIGTERM'); };
process.once('SIGTERM', stopRunner); process.once('SIGINT', stopRunner);
child.stdout.on('data', chunk => process.stdout.write(chunk));
child.stderr.on('data', () => { report.runnerStderrSeen = true; });
const timer = setInterval(() => { void sample(); }, 1000);
const stageTimer = setInterval(async () => {
  try {
    const size = (await import('node:fs/promises')).stat;
    if ((await size('public-test.mp4')).size > 0) phase = 'streaming-or-followup';
  } catch {}
}, 1000);
try {
  const [code, signal] = await once(child, 'exit');
  report.runnerExit = { code, signal };
  process.exitCode = code === 0 ? 0 : 1;
} finally {
  clearInterval(timer); clearInterval(stageTimer);
  while (sampling) await new Promise(resolve => setTimeout(resolve, 10));
  await sample();
  if (extra) report.httpExtraExit = await extra;
  report.servicesAfter = await services();
  const final = await processStats();
  report.observedEngineIdentities = [...identities.values()];
  report.remainingOwned = final.filter(p => identities.has(`${p.pid}:${p.start}`)).map(p => ({ pid: p.pid, start: p.start, comm: p.comm, state: p.state }));
  report.port8788After = sockets().split('\n').filter(line => /:8788\s/.test(line));
  report.tests.cleanup = report.remainingOwned.length === 0 && report.port8788After.length === 0 ? 'VALIDÉ' : 'ÉCHEC';
  const wasActive = report.servicesBefore.magicMirrorProcesses.length || report.servicesBefore.port8080.listening || report.servicesBefore.port8787.listening;
  report.tests.cohabitation = wasActive ? 'À VÉRIFIER PAR COMPARAISON DES PID ET RÉPONSES HTTP' : 'NON TESTÉ : SERVICES INACTIFS AVANT LES TESTS';
  report.summary = {
    samples: report.samples.length,
    maxBackendRssKiB: Math.max(0, ...report.samples.flatMap(sample => sample.backend.map(p => p.rssKiB))),
    maxFamilyRssKiB: Math.max(0, ...report.samples.map(sample => sample.familyRssKiB)),
    maxFamilyCpuPercentOneCore: Math.max(0, ...report.samples.map(sample => sample.familyCpuPercentOneCore)),
    minAvailableKiB: Math.min(...report.samples.map(sample => sample.availableKiB)),
  };
  await writeFile('pi-resources.json', JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ resources: report.summary, cleanup: report.tests.cleanup, cohabitation: report.tests.cohabitation, runnerExit: report.runnerExit }));
}
