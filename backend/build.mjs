import { build } from 'esbuild';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
const directory = dirname(fileURLToPath(import.meta.url));
const output = resolve(process.argv[2] || join(directory, 'artifacts', `vidfetch-backend-${Date.now()}.cjs`));
try { await access(output); throw new Error('Output already exists; choose a new bundle filename.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(dirname(output), { recursive: true });
const result = await build({
  absWorkingDir: resolve(directory, '..'), entryPoints: [join(directory, 'main.ts')], outfile: output,
  platform: 'node', target: 'node22', format: 'cjs', bundle: true, metafile: true,
  alias: { 'ffmpeg-static': join(directory, 'ffmpeg-static-shim.cjs') },
  legalComments: 'none', logLevel: 'warning',
});
await writeFile(`${output}.meta.json`, JSON.stringify(result.metafile, null, 2), { flag: 'wx' });
console.log(output);
