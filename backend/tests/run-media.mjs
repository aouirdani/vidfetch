import { build } from 'esbuild';
import { spawn } from 'node:child_process';
await build({ entryPoints: ['backend/tests/media.test.ts'], outfile: 'backend/artifacts/media.test.cjs', platform: 'node', target: 'node22', format: 'cjs', bundle: true,
  alias: { 'ffmpeg-static': './backend/ffmpeg-static-shim.cjs' }, logLevel: 'warning' });
const child = spawn(process.execPath, ['--test', 'backend/artifacts/media.test.cjs'], { stdio: 'inherit' });
child.on('exit', code => { process.exitCode = code ?? 1; });
