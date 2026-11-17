import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { checkGuideContent } from '../check-guide-content.mjs';
import { checkEngines } from './engines.mjs';

const archive = process.env.VIDFETCH_RELEASE_DIR;
const snapshot = process.env.VIDFETCH_SNAPSHOT ?? 'build/preflight/production.json';
await checkGuideContent();
await checkEngines(archive);
const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
const port = reserve.address().port; await new Promise(done => reserve.close(done));
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, archive ? [resolve(archive, 'app/server.js')] : ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env: { ...process.env, PORT: String(port), HOSTNAME: '127.0.0.1', NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { log += chunk; });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { ready = (await fetch(base + '/robots.txt', { signal: AbortSignal.timeout(1000) })).ok; } catch { /* starting */ }
    if (ready || child.exitCode !== null) break;
    await delay(100);
  }
  if (!ready) throw Error('Release server did not start: ' + log);
  execFileSync('python3', ['scripts/release/public_contract.py', '--base', base, '--snapshot', snapshot, '--output', 'build/preflight/checked-release.json'], { stdio: 'inherit' });
} finally {
  if (child.exitCode === null) { child.kill('SIGTERM'); await Promise.race([once(child, 'exit'), delay(3000)]); if (child.exitCode === null) child.kill('SIGKILL'); }
}
