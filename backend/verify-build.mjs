import { readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const bundle = process.argv[2];
if (!bundle) throw new Error('Pass a bundle path');
const content = await readFile(bundle, 'utf8');
const meta = JSON.parse(await readFile(`${bundle}.meta.json`, 'utf8'));
const external = Object.values(meta.outputs).flatMap(output => output.imports).filter(i => i.external);
const checks = {
  nodeCheck: spawnSync(process.execPath, ['--check', bundle]).status === 0,
  onlyNodeBuiltinExternals: external.every(i => i.path.startsWith('node:')),
  noMacPaths: !content.includes('/Users/') && !content.includes('/opt/homebrew/'),
  noNativeOrDarwinDependency: !Object.keys(meta.inputs).some(path => /darwin|\.node$/.test(path)),
  shim: Object.keys(meta.inputs).includes('backend/ffmpeg-static-shim.cjs'),
};
const result = { bundle, bytes: (await stat(bundle)).size, sha256: createHash('sha256').update(content).digest('hex'), checks,
  inputs: Object.keys(meta.inputs), externalImports: external.map(i => i.path) };
await writeFile(`${bundle}.verification.json`, JSON.stringify(result, null, 2), { flag: 'wx' });
console.log(JSON.stringify(result, null, 2));
if (Object.values(checks).some(value => !value)) process.exitCode = 1;
