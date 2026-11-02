import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const directory = process.argv[2] ?? '.lighthouseci';
const htmlRoot = process.argv[3] ?? '.next/server/app';
const files = (await readdir(directory)).filter(file => /^lhr-.*\.json$/.test(file));
assert.ok(files.length >= 6, `Expected Lighthouse reports for six routes; found ${files.length}`);

const baselineJavascriptTransfer = 163_266;
const maxJavascriptTransfer = baselineJavascriptTransfer + 3_000;
const maxCssGzip = 20_000;
const latinFontFiles = [
  'public/fonts/bricolage-grotesque-latin-800.woff2',
  'public/fonts/onest-latin-variable.woff2',
];
const latinFonts = await Promise.all(latinFontFiles.map(file => readFile(file)));
const latinFontBytes = latinFonts.reduce((sum, font) => sum + font.byteLength, 0);
assert.ok(latinFontBytes <= 90_000, `Latin WOFF2 fonts total ${latinFontBytes} B; maximum is 90,000 B`);
console.log(`Latin WOFF2 fonts: ${latinFontBytes} B (max 90,000)`);
const perRoute = new Map();

for (const file of files) {
  const report = JSON.parse(await readFile(`${directory}/${file}`, 'utf8'));
  const pageUrl = report.finalDisplayedUrl;
  const origin = new URL(pageUrl).origin;
  const scripts = report.audits['network-requests'].details.items
    .filter(item => item.resourceType === 'Script' && new URL(item.url).origin === origin)
    .reduce((sum, item) => sum + (item.transferSize ?? 0), 0);
  const pathname = decodeURIComponent(new URL(pageUrl).pathname);
  const htmlPath = join(htmlRoot, `${pathname === '/' ? 'index' : pathname.replace(/^\//, '')}.html`);
  const html = await readFile(htmlPath, 'utf8');
  const arabicFontPreload = html.includes('href="/fonts/noto-kufi-arabic.woff2"');
  assert.equal(arabicFontPreload, pathname === '/ar', `${pageUrl}: Arabic font must be preloaded only on Arabic pages`);
  const fontPreloads = [...html.matchAll(/<link\b[^>]*rel="preload"[^>]*as="font"[^>]*>/gi)];
  const fontUrls = new Set(fontPreloads.map(([tag]) => tag.match(/href="([^"]+)"/)?.[1]).filter(Boolean));
  assert.equal(fontUrls.size, pathname === '/ar' ? 3 : 2, `${pageUrl}: preload the two Latin faces and the Arabic face only on Arabic pages`);
  const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map(match => match[1]).join('\n');
  const cssGzip = gzipSync(css).byteLength;
  const old = perRoute.get(pageUrl);
  const current = { scripts, cssGzip };
  if (!old || scripts > old.scripts || cssGzip > old.cssGzip) perRoute.set(pageUrl, current);
}

for (const [url, { scripts, cssGzip }] of perRoute) {
  console.log(`${url}: same-origin JS ${scripts} B (max ${maxJavascriptTransfer}), inline CSS gzip ${cssGzip} B (max ${maxCssGzip})`);
  assert.ok(scripts <= maxJavascriptTransfer, `${url}: same-origin JS transfer exceeds baseline + 3 KB`);
  assert.ok(cssGzip <= maxCssGzip, `${url}: inline CSS gzip exceeds 20 KB`);
}
