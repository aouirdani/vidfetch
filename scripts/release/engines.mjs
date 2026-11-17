import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// Same immutable references as the currently running production engines.
export const ENGINE_FILES = {
  'backend/vidfetch-ovh.cjs': 'fa0d3d4e15a5a45ca0deb2b35e7ba03adc95c31b87500378068121f291c42287',
  'backend/vidfetch-gateway.cjs': '0fa1404530c272b76aaec9aee18125660e8561c744e4ccc1fbb9c7dbee9850e5',
};
export async function checkEngines(archive) {
  const root = archive ?? await mkdtemp(join(tmpdir(), 'vidfetch-engine-check-'));
  if (!archive) {
    execFileSync(process.execPath, ['backend/ovh/build.mjs', join(root, 'backend/vidfetch-ovh.cjs')], { stdio: 'inherit' });
    execFileSync(process.execPath, ['backend/gateway/build.mjs', join(root, 'backend/vidfetch-gateway.cjs')], { stdio: 'inherit' });
  }
  for (const [file, expected] of Object.entries(ENGINE_FILES)) {
    assert.equal(createHash('sha256').update(await readFile(join(root, file))).digest('hex'), expected, `${file}: production engine changed`);
  }
  assert.match(await readFile('src/lib/adsense.ts', 'utf8'), /export const ADSENSE_DEFERRED_LOADING_ENABLED = false;/);
  console.log('ENGINE/ADSENSE GUARD PASS: both production SHA-256 references; deferred loading false.');
}
