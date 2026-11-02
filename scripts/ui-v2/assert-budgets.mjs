import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const [baselineDir = '.lighthouseci-main', prDir = '.lighthouseci-pr', htmlRoot = '.next/server/app'] = process.argv.slice(2);
const routes = ['/', '/fr', '/id/download-video-tiktok', '/video-to-mp3', '/blog/why-cant-i-save-tiktok', '/ar'];
const expectedRuns = 3;
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function collect(directory, label) {
  const names = (await readdir(directory)).filter(file => /\.report\.json$/.test(file));
  assert.equal(names.length, routes.length * expectedRuns, `${label}: expected ${routes.length * expectedRuns} Lighthouse reports; found ${names.length}`);
  const result = new Map();
  for (const name of names) {
    const report = JSON.parse(await readFile(join(directory, name), 'utf8'));
    const path = decodeURIComponent(new URL(report.finalDisplayedUrl).pathname);
    assert.ok(routes.includes(path), `${label}: unexpected Lighthouse URL ${path}`);
    const values = result.get(path) ?? { performance: [], accessibility: [], 'best-practices': [], seo: [], lcp: [], cls: [], tbt: [] };
    for (const category of ['performance', 'accessibility', 'best-practices', 'seo']) values[category].push(report.categories[category]?.score);
    values.lcp.push(report.audits['largest-contentful-paint']?.numericValue);
    values.cls.push(report.audits['cumulative-layout-shift']?.numericValue);
    values.tbt.push(report.audits['total-blocking-time']?.numericValue);
    assert.ok(Object.values(values).every(items => items.every(Number.isFinite)), `${label} ${path}: one or more Lighthouse metrics are missing`);
    result.set(path, values);
  }
  for (const path of routes) {
    const metrics = result.get(path);
    assert.ok(metrics, `${label}: missing ${path}`);
    for (const [name, values] of Object.entries(metrics)) assert.equal(values.length, expectedRuns, `${label} ${path}: expected three ${name} passes`);
  }
  return result;
}

const baseline = await collect(baselineDir, 'main');
const pr = await collect(prDir, 'PR');

// Preserve the UI v2 asset budgets on the PR build.
const baselineJavascriptTransfer = 163_266;
const maxJavascriptTransfer = baselineJavascriptTransfer + 3_000;
const baselineCssGzip = 10_284;
const maxCssGzip = baselineCssGzip + 6_000;
const latinFontFiles = [
  'public/fonts/bricolage-grotesque-latin-800.woff2',
  'public/fonts/bricolage-grotesque-latin-ext-800.woff2',
];
const latinFontBytes = (await Promise.all(latinFontFiles.map(file => readFile(file)))).reduce((sum, font) => sum + font.byteLength, 0);
assert.ok(latinFontBytes <= 90_000, `Bricolage Latin WOFF2 subsets total ${latinFontBytes} B; maximum is 90,000 B`);
console.log(`Bricolage Latin + Latin-ext WOFF2: ${latinFontBytes} B (max 90,000)`);

const assetsByRoute = new Map();
for (const name of await readdir(prDir)) {
  if (!/\.report\.json$/.test(name)) continue;
  const report = JSON.parse(await readFile(join(prDir, name), 'utf8'));
  const pathname = decodeURIComponent(new URL(report.finalDisplayedUrl).pathname);
  const origin = new URL(report.finalDisplayedUrl).origin;
  const scripts = report.audits['network-requests'].details.items
    .filter(item => item.resourceType === 'Script' && new URL(item.url).origin === origin)
    .reduce((sum, item) => sum + (item.transferSize ?? 0), 0);
  const htmlPath = join(htmlRoot, `${pathname === '/' ? 'index' : pathname.replace(/^\//, '')}.html`);
  const html = await readFile(htmlPath, 'utf8');
  const fontPreloads = [...html.matchAll(/<link\b[^>]*rel="preload"[^>]*as="font"[^>]*>/gi)];
  const fontUrls = new Set(fontPreloads.map(([tag]) => tag.match(/href="([^"]+)"/)?.[1]).filter(Boolean));
  assert.equal(fontUrls.size, pathname === '/ar' ? 0 : 1, `${pathname}: preloaded web fonts must be Bricolage on Latin pages only`);
  const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(match => match[1]).join('\n');
  const cssGzip = gzipSync(css).byteLength;
  const old = assetsByRoute.get(pathname) ?? { scripts: 0, cssGzip: 0 };
  assetsByRoute.set(pathname, { scripts: Math.max(old.scripts, scripts), cssGzip: Math.max(old.cssGzip, cssGzip) });
  const lcpElement = JSON.stringify(report.audits['largest-contentful-paint-element']?.details ?? {});
  assert.doesNotMatch(lcpElement, /hero-scene|hero-card|hero-token/i, `${pathname}: decorative 3D scene must not be an LCP candidate`);
}

for (const [pathname, assets] of assetsByRoute) {
  console.log(`${pathname}: same-origin JS ${assets.scripts} B (max ${maxJavascriptTransfer}), CSS gzip ${assets.cssGzip} B (max ${maxCssGzip})`);
  assert.ok(assets.scripts <= maxJavascriptTransfer, `${pathname}: same-origin JS transfer exceeds baseline + 3 KB`);
  assert.ok(assets.cssGzip <= maxCssGzip, `${pathname}: inline CSS exceeds baseline + 6 KB gzip`);
}

for (const path of routes) {
  const main = baseline.get(path), candidate = pr.get(path);
  const mainPerf = median(main.performance), prPerf = median(candidate.performance);
  const mainLcp = median(main.lcp), prLcp = median(candidate.lcp);
  const mainTbt = median(main.tbt), prTbt = median(candidate.tbt);
  const prCls = median(candidate.cls);
  for (const category of ['accessibility', 'best-practices', 'seo']) {
    assert.equal(median(candidate[category]), 1, `${path}: PR median ${category} must be 100`);
  }
  assert.ok(prPerf >= 0.9, `${path}: PR median Performance must be at least 90`);
  assert.ok(prPerf >= mainPerf - 0.02, `${path}: PR Performance ${prPerf.toFixed(3)} is more than 2 points below main ${mainPerf.toFixed(3)}`);
  assert.ok(prCls <= 0.02, `${path}: PR median CLS ${prCls} exceeds 0.02`);
  assert.ok(prLcp <= mainLcp + 150, `${path}: PR median LCP ${Math.round(prLcp)} ms exceeds main +150 ms (${Math.round(mainLcp)} ms)`);
  assert.ok(prTbt <= mainTbt + 50, `${path}: PR median TBT ${Math.round(prTbt)} ms exceeds main +50 ms (${Math.round(mainTbt)} ms)`);
  console.log(`${path}: Performance ${Math.round(mainPerf * 100)} → ${Math.round(prPerf * 100)} (floor 90, drop max 2); LCP ${Math.round(mainLcp)} → ${Math.round(prLcp)} ms (delta max +150); CLS ${prCls.toFixed(3)}; TBT ${Math.round(mainTbt)} → ${Math.round(prTbt)} ms (delta max +50)`);
}
