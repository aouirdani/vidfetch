import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const directory = process.argv[2] ?? '.lighthouseci-pr';
const baseline = JSON.parse(await readFile('docs/evidence/home-input/baseline-lighthouse.json', 'utf8'));
const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const groups = {};
for (const file of await readdir(directory)) {
  if (!file.endsWith('.report.json')) continue;
  const r = JSON.parse(await readFile(join(directory, file), 'utf8'));
  const path = new URL(r.finalDisplayedUrl ?? r.finalUrl).pathname;
  (groups[path] ??= []).push(r.audits['largest-contentful-paint'].numericValue);
}
const routes = Object.entries(baseline.routes).map(([path, old]) => {
  const current = groups[path] ?? [];
  const lcp = current.length === 3 ? median(current) : null;
  return { path, baseline: old.lcp, current: lcp, delta: lcp === null ? null : lcp - old.lcp, regression: lcp === null || lcp > old.lcp };
});
const result = { referenceRun: baseline.runId, referenceCommit: baseline.commit, routes, noLcpRegression: routes.every(r => !r.regression) };
await writeFile(join(directory, 'lcp-comparison.json'), JSON.stringify(result, null, 2) + '\n');
for (const r of routes) {
  console.log(`${r.path}: previous ${r.baseline.toFixed(0)}ms; current ${r.current?.toFixed(0) ?? 'missing'}ms; delta ${r.delta?.toFixed(0) ?? 'missing'}ms`);
  if (r.regression) console.warn(`::warning::${r.path}: LCP exceeds the last main CI; review required before merge.`);
}
// Lighthouse Performance/LCP/TBT stay warnings. The publishing review reads this
// explicit comparison and must withhold the merge if the requested budget fails.
