import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
const start = performance.now();
assert.ok(process.version.startsWith('v22.'), 'Run preflight with Node 22 (production runtime).');
function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: 'inherit' });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(Error(`${command} ${args.join(' ')} failed (${code})`)));
  });
}
await run('npm', ['run', 'typecheck']);
await mkdir('build/preflight', { recursive: true });
await run('npm', ['run', 'build'], { VIDFETCH_TARGET: 'ovh', NEXT_PUBLIC_SITE_URL: 'https://vidfetch.app', DATABASE_URL: '', NEXT_TELEMETRY_DISABLED: '1' });
await run('python3', ['scripts/release/public_contract.py', '--output', 'build/preflight/production.json']);
await run('npm', ['run', 'seo-check']);
await run(process.execPath, ['scripts/release/affected-tests.mjs']);
execFileSync('git', ['diff', '--check'], { stdio: 'inherit' });
console.log(`PREFLIGHT PASS in ${((performance.now() - start) / 1000).toFixed(1)}s. Fresh production snapshot; no protection bypassed.`);
