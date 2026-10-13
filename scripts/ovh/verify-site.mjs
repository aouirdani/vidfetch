import assert from 'node:assert/strict';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.VIDFETCH_TEST_SITE ?? 'http://127.0.0.1:33000';
const output = process.env.VIDFETCH_TEST_OUTPUT ?? 'backend/artifacts/site-validation';
await mkdir(output, { recursive: true });
const findings = { base, checks: [], browserErrors: [], performance: {} };
const checked = text => findings.checks.push(text);
const paths = ['/', '/blog', '/legal', '/youtube-video-downloader', '/tiktok-video-downloader', '/instagram-reels-downloader', '/twitter-video-downloader'];
const sitemap = await (await fetch(base + '/sitemap.xml')).text();
const guideFiles = (await readdir('content/guides')).filter(file => file.endsWith('.md'));
const blogPaths = guideFiles.map(file => '/blog/' + file.slice(0, -3));
const indexed = [...sitemap.matchAll(/<loc>https:\/\/vidfetch.app(\/blog\/[^<]+)<\/loc>/g)].map(m => m[1]);
const published = [];
for (const file of guideFiles) {
  const source = await readFile('content/guides/' + file, 'utf8');
  const metadata = JSON.parse(source.split('---\n')[1]);
  if (metadata.status === 'ready' && metadata.published && metadata.published <= new Date().toISOString().slice(0, 10)) published.push('/blog/' + file.slice(0, -3));
}
assert.deepEqual(indexed.sort(), published.sort(), 'Only actually published guides enter the sitemap');
assert.equal(blogPaths.length, 10); paths.push(...blogPaths);
for (const path of paths) {
  const response = await fetch(base + path); assert.equal(response.status, 200, path);
  const html = await response.text(); assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, path);
  assert.ok(html.includes(`href="https://vidfetch.app${path === '/' ? '' : path}"`), `Canonical ${path}`);
  assert.match(html, /property="og:/); assert.match(html, /name="twitter:card"/);
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
  assert.ok(scripts.length); for (const script of scripts) JSON.parse(script[1]);
}
checked('17 pages: HTTP 200, one H1, correct canonical, social cards and valid JSON-LD');
assert.equal((await fetch(base + '/nonexistent')).status, 404);
const missing = await (await fetch(base + '/blog/nonexistent')).text(); assert.match(missing, /noindex/);
const robots = await (await fetch(base + '/robots.txt')).text(); assert.match(robots, /Disallow: \/api\//); assert.match(robots, /Disallow: \/auth\//); assert.doesNotMatch(robots, /Disallow: \/_next\//);
assert.doesNotMatch(sitemap, /vidfetch\.io|127\.0\.0\.1|\/api\//);
for (const path of ['/api/fetch-info', '/api/download']) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"url":"https://youtu.be/aqz-KE-bpKQ"}' });
  assert.equal(response.status, 503); assert.equal((await response.json()).code, 'BACKEND_UNAVAILABLE');
}
assert.equal((await fetch(base + '/api/download-access', { method: 'POST' })).status, 503);
assert.equal((await (await fetch(base + '/api/download-access')).json()).available, false);
assert.equal((await fetch(base + '/api/fetch-info')).status, 405);
checked('404/noindex, sitemap/robots, degraded APIs 503, unsupported method 405');
const browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.on('pageerror', e => findings.browserErrors.push(e.message));
  const remote = [];
  page.on('request', r => { if (new URL(r.url()).origin !== base) remote.push(new URL(r.url()).hostname); });
  await page.addInitScript(() => {
    window.__vfPerf = { lcp: 0, cls: 0 };
    new PerformanceObserver(list => { for (const e of list.getEntries()) window.__vfPerf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__vfPerf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 100000 });
  await page.goto(base, { waitUntil: 'networkidle' });
  assert.doesNotMatch(await page.locator('body').innerText(), /vidfetch\.io|Engine unavailable|backend/i);
  assert.deepEqual(remote, [], 'Initial page must not load a challenge or contact media sites');
  assert.equal(await page.getByRole('alert').filter({ hasText: /couldn.t get this video/i }).count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const inputBox = await page.getByRole('textbox', { name: 'Video link' }).boundingBox();
  assert.ok(inputBox && inputBox.y < 844, 'Downloader visible in first mobile viewport');
  findings.performance = await page.evaluate(() => ({ ...window.__vfPerf, paints: performance.getEntriesByType('paint').map(x => ({ name: x.name, ms: x.startTime })), transferBytes: performance.getEntriesByType('resource').reduce((n, r) => n + r.transferSize, 0), note: 'One synthetic mobile navigation; not field Core Web Vitals or INP.' }));
  await page.screenshot({ path: output + '/home-mobile.png', fullPage: true });
  await page.getByRole('textbox', { name: 'Video link' }).fill('https://youtu.be/aqz-KE-bpKQ');
  await page.getByRole('button', { name: 'Extract', exact: true }).click();
  await page.getByText('Video extraction and downloads are temporarily unavailable. Please try again later.', { exact: true }).waitFor();
  checked('Mobile: tool above fold, no horizontal overflow, no initial status bar/challenge or remote requests; user-friendly error on attempt');
  for (const path of ['/blog', ...blogPaths]) {
    await page.goto(base + path, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, path);
  }
  await page.screenshot({ path: output + '/guide-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(base, { waitUntil: 'networkidle' });
  await page.screenshot({ path: output + '/home-desktop.png', fullPage: true });
  assert.deepEqual(findings.browserErrors, []);
  checked('All ten guides render on mobile; no browser exceptions');
} finally { await browser.close(); }
await writeFile(output + '/verification.json', JSON.stringify(findings, null, 2));
console.log(JSON.stringify({ checks: findings.checks.length, performance: findings.performance, errors: findings.browserErrors.length }, null, 2));
