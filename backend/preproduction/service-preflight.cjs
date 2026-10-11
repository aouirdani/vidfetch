'use strict';
// Read-only precondition. Exit 1 makes ExecCondition skip start without a restart loop.
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { createServer } = require('node:net');
const { resolve } = require('node:path');
async function main() {
  if (process.platform !== 'linux' || process.arch !== 'arm64') throw new Error('Linux ARM64 required');
  const controllers = readFileSync('/sys/fs/cgroup/cgroup.controllers','utf8').trim().split(/\s+/);
  if (!controllers.includes('cpu') || !controllers.includes('pids')) throw new Error('CPU and pids cgroup controllers required');
  const group = readFileSync('/proc/self/cgroup','utf8').split('\n').find(line => line.startsWith('0::'))?.slice(3);
  if (!group || group.split('/').includes('..')) throw new Error('Unified service cgroup required');
  const directory = '/sys/fs/cgroup'+group;
  const tasks = readFileSync(directory+'/pids.max','utf8').trim();
  if (!/^\d+$/.test(tasks) || Number(tasks) < 1 || Number(tasks) > 128) throw new Error('Service TasksMax not applied');
  const [quota, period] = readFileSync(directory+'/cpu.max','utf8').trim().split(/\s+/).map(Number);
  if (!Number.isFinite(quota) || quota <= 0 || !Number.isFinite(period) || period <= 0 || quota/period > 1.5) throw new Error('Service CPUQuota not applied');
  const bundle = readFileSync(resolve(__dirname,'vidfetch-backend.cjs'));
  if(createHash('sha256').update(bundle).digest('hex') !== 'd370ccfb8574a2f714e86fcde6e555ddd665a846be761ffe29256a648d4a168c') throw new Error('Corrected bundle digest mismatch');
  if(process.env.HOST !== '127.0.0.1' || process.env.PORT !== '8788') throw new Error('Loopback 8788 configuration required');
  const probe = createServer();
  await new Promise((ok, fail) => {probe.once('error',fail);probe.listen(8788,'127.0.0.1',ok);});
  await new Promise(ok => probe.close(ok));
  // Availability remains subject to a bind race; the backend safely fails if another process binds.
  console.log('[vidfetch] preflight passed: CPU/pids limits applied; no cgroup memory cap; Node heap capped by ExecStart');
}
main().catch(error => {console.error('[vidfetch] preflight: '+error.message);process.exitCode=1;});
