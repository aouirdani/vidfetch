import { build } from 'esbuild';
import { chmod, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
await chmod('backend/tests/fake-ytdlp.cjs', 0o700);
await mkdir('backend/artifacts', { recursive: true });
await build({ entryPoints: ['backend/tests/backend.test.ts'], outfile: 'backend/artifacts/backend.test.cjs',
  platform: 'node', target: 'node22', format: 'cjs', bundle: true,
  alias: { 'ffmpeg-static': './backend/ffmpeg-static-shim.cjs' }, logLevel: 'warning' });
const child = spawn(process.execPath, ['--test', 'backend/artifacts/backend.test.cjs'], { stdio: 'inherit' });
child.on('exit', code => { process.exitCode = code ?? 1; });
