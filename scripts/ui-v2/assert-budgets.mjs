import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const directory = process.argv[2] ?? '.lighthouseci';
const htmlRoot = process.argv[3] ?? '.next/server/app';
const files = (await readdir(directory)).filter(file => /^lhr-.*\.json$/.test(file));
assert.ok(files.length >= 18, `Expected three Lighthouse reports for six routes; found ${files.length}`);

const baselineJavascriptTransfer = 163_266;
const maxJavascriptTransfer = baselineJavascriptTransfer + 3_000;
const baselineCssGzip = 10_284;
const maxCssGzip = baselineCssGzip + 6_000;
const latinFontFiles = [
  'public/fonts/bricolage-grotesque-latin-800.woff2',
  'public/fonts/bricolage-grotesque-latin-ext-800.woff2',
];
const latinFonts = await Promise.all(latinFontFiles.map(file => readFile(file)));
const latinFontBytes = latinFonts.reduce((sum, font) => sum + font.byteLength, 0);
assert.ok(latinFontBytes <= 90_000, `Bricolage Latin WOFF2 subsets total ${latinFontBytes} B; maximum is 90,000 B`);
console.log(`Bricolage Latin + Latin-ext WOFF2: ${latinFontBytes} B (max 90,000)`);

const lcpBaselines = new Map([
  ['/', 2335], ['/fr', 2336], ['/id/download-video-tiktok', 2189],
  ['/video-to-mp3', 2338], ['/blog/why-cant-i-save-tiktok', 2338], ['/ar', 2337],
]);
const lcpByRoute = new Map();
const metricsByRoute = new Map();
const perRoute = new Map();

for (const file of files) {
  const report = JSON.parse(await readFile(join(directory, file), 'utf8'));
  const pageUrl = report.finalDisplayedUrl;
  const origin = new URL(pageUrl).origin;
  const pathname = decodeURIComponent(new URL(pageUrl).pathname);
  const scripts = report.audits['network-requests'].details.items
    .filter(item => item.resourceType === 'Script' && new URL(item.url).origin === origin)
    .reduce((sum, item) => sum + (item.transferSize ?? 0), 0);
  const htmlPath = join(htmlRoot, `${pathname === '/' ? 'index' : pathname.replace(/^\//, '')}.html`);
  const html = await readFile(htmlPath, 'utf8');
  const fontPreloads = [...html.matchAll(/<link\b[^>]*rel="preload"[^>]*as="font"[^>]*>/gi)];
  const fontUrls = new Set(fontPreloads.map(([tag]) => tag.match(/href="([^"]+)"/)?.[1]).filter(Boolean));
  assert.equal(fontUrls.size, pathname === '/ar' ? 0 : 1, `${pageUrl}: preloaded web fonts must be Bricolage on Latin pages only`);

  const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map(match => match[1]).join('\n');
  const cssGzip = gzipSync(css).byteLength;
  const previous = perRoute.get(pageUrl);
  const current = { scripts, cssGzip };
  if (!previous || scripts > previous.scripts || cssGzip > previous.cssGzip) perRoute.set(pageUrl, current);

  const metrics = metricsByRoute.get(pathname) ?? { performance: [], accessibility: [], 'best-practices': [], seo: [], lcp: [], cls: [], tbt: [] };
  for (const category of ['performance', 'accessibility', 'best-practices', 'seo']) metrics[category].push(report.categories[category]?.score);
  const lcp = report.audits['largest-contentful-paint']?.numericValue;
  assert.ok(Number.isFinite(lcp), `${pageUrl}: Lighthouse LCP is missing`);
  metrics.lcp.push(lcp);
  metrics.cls.push(report.audits['cumulative-layout-shift']?.numericValue);
  metrics.tbt.push(report.audits['total-blocking-time']?.numericValue);
  metricsByRoute.set(pathname, metrics);
  const lcpElement = JSON.stringify(report.audits['largest-contentful-paint-element']?.details ?? {});
  assert.doesNotMatch(lcpElement, /hero-scene|hero-card|hero-token/i, `${pageUrl}: decorative 3D scene must not be an LCP candidate`);
}

for (const [url, { scripts, cssGzip }] of perRoute) {
  console.log(`${url}: same-origin JS ${scripts} B (max ${maxJavascriptTransfer}), CSS gzip ${cssGzip} B (max ${maxCssGzip})`);
  assert.ok(scripts <= maxJavascriptTransfer, `${url}: same-origin JS transfer exceeds baseline + 3 KB`);
  assert.ok(cssGzip <= maxCssGzip, `${url}: inline CSS exceeds baseline + 6 KB gzip`);
}

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
for (const [pathname, metrics] of metricsByRoute) {
  for (const [category, values] of Object.entries(metrics)) assert.equal(values.length, 3, `${pathname}: expected three Lighthouse passes for ${category}`);
  for (const [category, minimum] of [['performance', 0.95], ['accessibility', 1], ['best-practices', 1], ['seo', 1]]) {
    assert.ok(median(metrics[category]) >= minimum, `${pathname}: median Lighthouse ${category} must be >= ${minimum * 100}`);
  }
  const lcp = median(metrics.lcp);
  const baseline = lcpBaselines.get(pathname);
  assert.ok(baseline, `${pathname}: missing LCP baseline`);
  const limit = Math.min(2500, baseline + 150);
  console.log(`${pathname}: LCP median ${Math.round(lcp)} ms (max ${limit} ms), CLS ${median(metrics.cls).toFixed(3)}, TBT ${Math.round(median(metrics.tbt))} ms`);
  assert.ok(lcp <= limit, `${pathname}: LCP median exceeds baseline +150 ms or 2,500 ms`);
  assert.ok(median(metrics.cls) <= 0.02, `${pathname}: median CLS must be <= 0.02`);
  assert.ok(median(metrics.tbt) <= 100, `${pathname}: median TBT must be <= 100 ms`);
}
