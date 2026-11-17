import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { build } from 'esbuild';
const production = JSON.parse(await readFile('build/preflight/production.json', 'utf8')).release;
if (!/^[a-f0-9]{40}$/.test(production ?? '')) throw Error('Missing production Git reference');
// Include committed work and both staged/unstaged changes; never guess the base.
const changed = new Set(execFileSync('git', ['diff', '--name-only', production], { encoding: 'utf8' }).trim().split('\n').filter(Boolean));
for (const file of execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)) changed.add(file);
const tests = (await readdir('tests')).filter(f => f.endsWith('.test.ts')).map(f => `tests/${f}`);
const graph = await build({ entryPoints: tests, outdir: 'build/test-graph', bundle: true, write: false, metafile: true, platform: 'node', packages: 'external', target: 'node22' });
const selected = new Set();
for (const output of Object.values(graph.metafile.outputs)) {
  if (!output.entryPoint) continue;
  const text = await readFile(output.entryPoint, 'utf8');
  if (changed.has('package-lock.json') || Object.keys(output.inputs).some(file => changed.has(file)) || [...changed].some(file => text.includes(file))) selected.add(output.entryPoint);
}
for (const file of changed) if (tests.includes(file)) selected.add(file);
if (selected.size) {
  const result = spawnSync('node_modules/.bin/tsx', ['--test', '--test-concurrency=1', ...selected], { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw Error('Affected unit tests failed');
}
if ([...changed].some(p => p.startsWith('deploy/ovh/ci/') || p.startsWith('scripts/release/') || p.startsWith('.github/workflows/'))) {
  const result = spawnSync('python3', ['-m', 'unittest', 'discover', '-s', 'deploy/ovh/tests', '-p', 'test_fast_release.py', '-v'], { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw Error('Release protection tests failed');
}
console.log(`AFFECTED TESTS PASS: ${selected.size} unit test files for ${changed.size} changed files.`);
