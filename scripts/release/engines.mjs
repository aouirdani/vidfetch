import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// Approved same-origin transfer upgrade: owner-bound metadata reuse in the worker,
// signed same-origin preparation and scoped cookie in the gateway. Both binaries
// must be installed manually (with rollback) before this frontend can be promoted.
// Keep this exact guard: every later engine change needs a new explicit review.
// Gateway reference includes bounded, non-identifying transfer timing logs.
// Worker reference also includes the diagnosed TikTok post-specific access code;
// the evidence is retained in docs/evidence/reliability-20261120/results.json.
export const ENGINE_FILES = {
  'backend/vidfetch-ovh.cjs': '893fb0f2d8673e030666af9d779d6f05de9da4fe01921180ab13afd0adf36370',
  'backend/vidfetch-gateway.cjs': 'edb6f066a5ac0c233b9c3af57726beb810033c9f8ad608613d87b47862c67bba',
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
