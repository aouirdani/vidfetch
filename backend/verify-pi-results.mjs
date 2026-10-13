import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = 'backend/artifacts/pi-validation-20261011';
const load = async path => JSON.parse(await readFile(`${root}/${path}`, 'utf8'));
const [run, resources, http, strict, hashesBefore, final, runLog, bundle] = await Promise.all([
  load('corrected/pi-results.json'), load('corrected/pi-resources.json'), load('corrected/pi-http-extra.json'),
  readFile(`${root}/full-decode-strict.log`, 'utf8'), readFile(`${root}/protected-files-during.log`, 'utf8'),
  readFile(`${root}/final-inspection.log`, 'utf8'), readFile(`${root}/run-corrected.log`, 'utf8'),
  readFile('backend/artifacts/vidfetch-backend-pi-20261011.cjs'),
]);
const digest = createHash('sha256').update(bundle).digest('hex');
const protectedHashes = text => new Map([...text.matchAll(/^([a-f0-9]{64})  (\/home\/user\/.+)$/gm)].map(match => [match[2], match[1]]));
const before = protectedHashes(hashesBefore), after = protectedHashes(final);
const streaming = run.tests.streaming;
const checks = {
  transferredBundleMatches: runLog.startsWith(digest),
  health: run.tests.health.http === 200 && run.tests.health.body.ok === true,
  byteCounter: streaming.http === 200 && streaming.bytes === streaming.completed.bytes && streaming.bytes === Number(streaming.probe.format.size),
  completed: streaming.completed.status === 'completed',
  videoAndAudio: ['video', 'audio'].every(kind => streaming.probe.streams.some(stream => stream.codec_type === kind)),
  ticketAndConcurrency: streaming.ticketReuse === 404 && streaming.concurrency === 429,
  expirationAndDisconnect: run.tests.expiration === 'PASSED' && run.tests.disconnect === 'PASSED',
  extraHttp: Object.values(http.tests).every(test => test.ok) && resources.httpExtraExit === 0,
  strictFullDecode: strict.trim() === 'STRICT_FULL_DECODE_EXIT=0',
  cleanup: run.backendExit === 0 && resources.runnerExit.code === 0 && resources.tests.cleanup === 'VALIDÉ'
    && resources.remainingOwned.length === 0 && resources.port8788After.length === 0,
  protectedFilesUnchanged: before.size === 3 && [...before].every(([path, hash]) => after.get(path) === hash),
  servicesInitiallyInactive: !resources.servicesBefore.port8787.listening && !resources.servicesBefore.port8080.listening && resources.servicesBefore.magicMirrorProcesses.length === 0,
  servicesFinallyInactive: !resources.servicesAfter.port8787.listening && !resources.servicesAfter.port8080.listening && resources.servicesAfter.magicMirrorProcesses.length === 0,
};
const result = { verified: new Date().toISOString(), bundle: 'backend/artifacts/vidfetch-backend-pi-20261011.cjs', sha256: digest,
  checks, resources: resources.summary, limitations: ['Cohabitation avec MagicMirror et 8787 actifs non testée.', 'Échantillonnage CPU/RSS toutes les secondes ; somme RSS avec pages partagées.', 'Rétention réelle 30 minutes et autres plateformes non testées sur Pi.'] };
await writeFile(`${root}/verification.json`, JSON.stringify(result, null, 2), { flag: 'wx' });
console.log(JSON.stringify(result, null, 2));
if (Object.values(checks).some(value => !value)) process.exitCode = 1;
