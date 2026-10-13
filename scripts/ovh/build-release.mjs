import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, relative, dirname } from 'node:path';

const sha = process.env.VIDFETCH_RELEASE;
if (!/^[a-f0-9]{40}$/.test(sha ?? '')) throw Error('VIDFETCH_RELEASE must be a complete Git commit');
if (process.platform !== 'linux' || process.arch !== 'x64' || !process.version.startsWith('v22.')) throw Error('Build this release with Node 22 on Linux x86_64');
const out = resolve(process.argv[2] ?? `build/releases/${sha}`);
await mkdir(dirname(out), { recursive: true });
await mkdir(out, { recursive: false });
function run(command, args, extra = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: { ...process.env, ...extra } });
  if (result.error || result.status !== 0) throw Error(`Failed: ${command}`);
}
run('npm', ['run', 'build'], { VIDFETCH_TARGET: 'ovh', DATABASE_URL: '', VIDFETCH_CONNECTION_READY: '0', NEXT_PUBLIC_SITE_URL: 'https://vidfetch.app', NEXT_TELEMETRY_DISABLED: '1' });
await cp('.next/standalone', join(out, 'app'), { recursive: true, dereference: true });
await cp('public', join(out, 'app/public'), { recursive: true });
await cp('.next/static', join(out, 'app/.next/static'), { recursive: true });
await cp('content/guides', join(out, 'app/content/guides'), { recursive: true });
await mkdir(join(out, 'backend'));
run(process.execPath, ['backend/ovh/build.mjs', join(out, 'backend/vidfetch-ovh.cjs')]);
run(process.execPath, ['backend/gateway/build.mjs', join(out, 'backend/vidfetch-gateway.cjs')]);
run(process.execPath, ['--check', join(out, 'backend/vidfetch-ovh.cjs')]);
run(process.execPath, ['--check', join(out, 'backend/vidfetch-gateway.cjs')]);
const files = {};
async function walk(dir) {
  for (const name of (await readdir(dir)).sort()) {
    const path = join(dir, name), info = await stat(path), key = relative(out, path);
    if (name.startsWith('.env') || /\.(?:mp3|mp4|webm|log|pem|key)$/.test(name)) throw Error(`Forbidden release file: ${key}`);
    if (info.isDirectory()) await walk(path);
    else {
      if (key.includes('darwin') || key.includes('arm64') || key.startsWith('app/.git/')) throw Error(`Wrong-platform release file: ${key}`);
      files[key] = createHash('sha256').update(await readFile(path)).digest('hex');
    }
  }
}
await walk(out);
await writeFile(join(out, 'manifest.json'), JSON.stringify({ schema: 1, release: sha, platform: 'linux-x64', node: process.version, files }, null, 2));
console.log(`Release ${sha}: ${Object.keys(files).length} checked files`);
