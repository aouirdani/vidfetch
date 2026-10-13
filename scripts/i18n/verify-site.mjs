import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const locales = ['en', 'fr', 'es', 'pt-BR', 'id', 'de', 'it', 'ar'];
const roots = ['', 'fr/', 'es/', 'pt/', 'id/', 'de/', 'it/', 'ar/'];
const blogs = ['blog', 'fr/guides', 'es/guias', 'pt/guias', 'id/panduan', 'de/ratgeber', 'it/guide', 'ar/أدلة'];
const dictionaries = Object.fromEntries(locales.map(l => [l, JSON.parse(readFileSync(`src/i18n/messages/${l}.json`, 'utf8'))]));
const reserve = createServer();
await new Promise((resolve, reject) => { reserve.once('error', reject); reserve.listen(0, '127.0.0.1', resolve); });
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, VIDFETCH_TARGET: 'ovh', VIDFETCH_CONNECTION_READY: '0', DATABASE_URL: '', TURNSTILE_SECRET_KEY: '', VIDFETCH_ACCESS_SIGNING_KEY: '', NEXT_TELEMETRY_DISABLED: '1' },
});
let serverLog = ''; for (const stream of [server.stdout, server.stderr]) stream.on('data', data => { serverLog += data; });
let browser;
const evidence = { port, serverPages: 0, locales: [], checks: [], publicNetworkUsed: false };
try {
  const helperModule = resolve(`../helper-fixture-${process.pid}.mjs`);
  const helperBundle = await build({ entryPoints: ['backend/gateway/helper.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
  writeFileSync(helperModule, helperBundle.outputFiles[0].text, { flag: 'wx' });
  const { downloadHelper } = await import(pathToFileURL(helperModule).href);
  for (let n = 0; ; n++) { try { const r = await fetch(base + '/api/health'); if (r.ok) break; } catch {} if (n > 100) throw Error('Local server did not start'); await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}) });
  const noJS = await browser.newContext({ javaScriptEnabled: false });
  const dom = await noJS.newPage();
  const sitemap = await (await fetch(base + '/sitemap.xml')).text();
  const canonicalPaths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname);
  assert.equal(canonicalPaths.length, 16);
  assert.equal(new Set(canonicalPaths).size, 16);
  assert.doesNotMatch(sitemap, /youtube|\/api\/|mp4-vs-webm/);
  const englishGuides = (await import('node:fs/promises')).readdir('content/guides');
  const guidePaths = (await englishGuides).filter(name => name.endsWith('.md')).map(name => '/blog/' + name.slice(0, -3));
  const paths = [...canonicalPaths, ...blogs.map(path => '/' + path), ...guidePaths, '/youtube-video-downloader', '/tiktok-video-downloader', '/instagram-reels-downloader', '/twitter-video-downloader'];
  const allPaths = new Set(paths.map(path => decodeURI(path)));
  for (const path of paths) {
    const response = await fetch(base + path); assert.equal(response.status, 200, path);
    await dom.setContent(await response.text());
    const data = await dom.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, h1: [...document.querySelectorAll('h1')].map(e => e.textContent), canonical: document.querySelector('link[rel=canonical]')?.href,
      title: document.title, description: document.querySelector('meta[name=description]')?.content, robots: document.querySelector('meta[name=robots]')?.content,
      alternates: Object.fromEntries([...document.querySelectorAll('link[rel=alternate][hreflang]')].map(e => [e.hreflang, e.href])),
      og: document.querySelector('meta[property="og:locale"]')?.content, jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(e => JSON.parse(e.textContent)),
      links: [...document.querySelectorAll('a[href]')].map(e => e.getAttribute('href')) }));
    assert.equal(data.h1.length, 1, path); assert.ok(data.h1[0].trim()); assert.ok(data.description);
    assert.equal(data.canonical, new URL(path, 'https://vidfetch.app').href, path);
    const indexable = canonicalPaths.includes(path);
    assert.equal(/noindex/.test(data.robots ?? ''), !indexable, path);
    assert.equal(Object.keys(data.alternates).length, indexable ? 9 : 0, path);
    assert.ok(data.jsonld.length, path);
    for (const href of data.links.filter(href => href.startsWith('/') && !href.startsWith('//'))) assert.ok(allPaths.has(decodeURI(href.split('#')[0].split('?')[0]) || '/'), `${path} -> ${href}`);
    const locale = locales[roots.findIndex(root => root && decodeURI(path).startsWith('/' + root))] ?? 'en';
    assert.equal(data.lang, locale, path); assert.equal(data.dir, locale === 'ar' ? 'rtl' : 'ltr');
    evidence.serverPages++;
  }
  for (const [i, locale] of locales.entries()) {
    const path = '/' + roots[i], d = dictionaries[locale];
    const response = await fetch(base + path); await dom.setContent(await response.text());
    assert.equal(await dom.locator('h1').textContent(), d.heroTitle + d.heroAccent);
    for (const target of locales) {
      const href = await dom.locator(`link[hreflang="${target}"]`).getAttribute('href');
      const other = await fetch(base + new URL(href).pathname); await dom.setContent(await other.text());
      assert.equal(new URL(await dom.locator(`link[hreflang="${locale}"]`).getAttribute('href')).href, new URL(path, 'https://vidfetch.app').href);
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => new URL(route.request().url()).hostname === 'challenges.cloudflare.com' ? route.fulfill({ contentType: 'text/javascript', body: '' }) : route.abort());
    await page.goto(base + path); await page.locator('[data-language-selector] summary').click();
    assert.equal(await page.locator('[data-language-selector] nav a').count(), 8);
    await page.locator(`[data-language-selector] nav a[hreflang="${locale === 'en' ? 'fr' : 'en'}"]`).click(); await page.waitForURL(base + (locale === 'en' ? '/fr/' : '/'));
    await page.goto(base + path); await page.getByRole('textbox', { name: d.videoLink }).fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(await page.getByRole('textbox', { name: d.videoLink }).getAttribute('dir'), 'ltr');
    await page.getByRole('button', { name: d.extract, exact: true }).click();
    await page.getByRole('status').filter({ hasText: d.backendUnavailable }).waitFor();
    assert.deepEqual(errors, [], locale);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, locale);
    // Controlled UI fixture: real browser crypto and helper, mocked engines/admission.
    // The attachment bytes are synthetic; this is not evidence of media transcoding.
    const requests = [], attachment = Buffer.from('VidFetch synthetic UI transfer\n'.repeat(32));
    const video = { id: 'v1', label: '480p', kind: 'video', ext: 'mp4', width: 480, height: 854, fps: 30, vcodec: 'h264', acodec: 'aac', hasAudio: true, progressive: true, filesize: null, filesizeLabel: null, bitrateKbps: null, note: null, recommended: true, protocol: 'https' };
    const second = { ...video, id: 'v2', label: '720p · 60 fps', width: 720, height: 1280, fps: 60, recommended: false };
    const audio = { ...video, id: 'mp3', label: 'MP3 · 192 kbps', kind: 'audio', ext: 'mp3', width: null, height: null, fps: null, vcodec: null, acodec: 'mp3', bitrateKbps: 192 };
    await page.addInitScript(() => { window.turnstile = { render(element, options) { window.__fixtureLanguage = options.language; setTimeout(() => options.callback('fixture-challenge'), 0); return 'fixture'; }, remove() {}, reset() {} }; });
    await context.route('**/api/download-access', route => route.fulfill({ json: route.request().method() === 'GET' ? { available: true, siteKey: 'fixture-public-key' } : { ok: true, grant: 'fixture-grant', expiresAt: Date.now() + 120000 } }));
    await context.route('**/api/fetch-info', route => { requests.push(new URL(route.request().url()).pathname); return route.fulfill({ json: { ok: true, engine: { ffmpeg: true, ytDlp: 'fixture' }, info: { platform: 'youtube', platformVideoId: 'fixture', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'VidFetch', thumbnail: null, durationLabel: '00:33', viewCount: 12, uploader: 'VidFetch', formats: [video, second, audio], videoFormats: [video, second], audioFormats: [audio] } } }); });
    await context.route(/\/download-helper\?lang=/, route => { assert.equal(new URL(route.request().url()).searchParams.get('lang'), locale); const helper = downloadHelper([base], locale); return route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': helper.csp }, body: helper.html }); });
    await context.route('**/auth/transfer', route => route.fulfill({ json: { ok: true } }));
    await context.route(/\/api\/download(?:\?|$)/, route => {
      const request = route.request(), url = new URL(request.url()); requests.push(url.pathname);
      if (request.method() === 'POST') { const body = request.postDataJSON(); assert.deepEqual(Object.keys(body).sort(), ['format_id', 'type', 'url']); assert.equal(body.type, 'audio'); assert.equal(body.format_id, 'mp3'); return route.fulfill({ json: { ok: true, token: 'fixture-ticket', filename: 'fixture.bin', downloadUrl: '/api/download?ticket=fixture-ticket' } }); }
      if (url.searchParams.has('ticket')) return route.fulfill({ contentType: 'application/octet-stream', headers: { 'Content-Disposition': 'attachment; filename="fixture.bin"' }, body: attachment });
      return route.fulfill({ json: { ok: true, status: 'completed', bytes: attachment.length, error: null } });
    });
    await page.goto(base + path); await page.getByRole('textbox', { name: d.videoLink }).fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ'); await page.getByRole('button', { name: d.extract, exact: true }).click();
    await page.getByRole('tab', { name: new RegExp(d.video) }).waitFor();
    assert.equal(await page.evaluate(() => window.__fixtureLanguage), locale === 'pt-BR' ? 'pt-br' : locale);
    const radios = page.getByRole('radiogroup').getByRole('radio'); await radios.first().focus(); await page.keyboard.press(locale === 'ar' ? 'ArrowLeft' : 'ArrowRight'); await radios.nth(1).getAttribute('aria-checked').then(value => assert.equal(value, 'true'));
    assert.match(await radios.nth(1).textContent(), /720p/);
    await page.getByRole('tab', { name: new RegExp(d.audio) }).click();
    const popupPromise = page.waitForEvent('popup'); await page.getByRole('button', { name: new RegExp('^' + d.download + ' ') }).click(); const popup = await popupPromise;
    const file = await popup.waitForEvent('download'); const saved = resolve(`../ui-transfer-${locale}-${process.pid}.bin`); await file.saveAs(saved); assert.deepEqual(readFileSync(saved), attachment);
    await page.locator('p:not(.sr-only)').filter({ hasText: d.saved.replace('{size}', `${attachment.length} B`) }).waitFor();
    assert.ok(requests.every(path => /^\/api\/(fetch-info|download)$/.test(path)));
    assert.deepEqual(errors, [], locale); await popup.close();
    const missing = await page.goto(base + '/' + roots[i] + 'missing-page'); assert.equal(missing.status(), 404, locale);
    assert.equal(await page.locator('html').getAttribute('lang'), locale);
    await page.getByRole('heading', { name: d.notFoundTitle }).waitFor();
    const robotsTags = await page.locator('meta[name=robots]').evaluateAll(nodes => nodes.map(node => node.getAttribute('content')));
    assert.ok(robotsTags.length && robotsTags.every(value => /noindex/.test(value)));
    assert.equal(await page.locator('link[rel=canonical]').count(), 0);
    await context.close(); evidence.locales.push(locale);
  }
  assert.equal((await fetch(base + '/fr', { redirect: 'manual' })).status, 308);
  const status = await fetch(base + '/api/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(status.status, 503); assert.equal((await status.json()).code, 'BACKEND_UNAVAILABLE');
  assert.equal((await fetch(base + '/api/fetch-info')).status, 405);
  assert.equal((await fetch(base + '/fr/api/download')).status, 404);
  assert.equal((await fetch(base + '/fr/guides/mp4-ou-webm')).status, 404);
  const robots = await (await fetch(base + '/robots.txt')).text(); assert.match(robots, /Disallow: \/api\//);
  evidence.checks.push('38 server-rendered pages; eight locales, selectors, localized 404 and degraded UI', 'reciprocal hreflang and self canonicals', '16 sitemap entries; no drafts, empty guide indexes or platform claims', 'RTL mobile navigation, LTR URL field and radio keyboard controls', 'eight synthetic native transfers with real helper and byte integrity; mocked engines, no media conversion claim', 'API paths, methods and BACKEND_UNAVAILABLE unchanged');
  writeFileSync('../http-browser-verification.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser?.close();
  if (server.exitCode === null && server.signalCode === null) try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  await new Promise(resolve => { if (server.exitCode !== null || server.signalCode !== null) resolve(); else { server.once('exit', resolve); setTimeout(() => { if (server.exitCode === null && server.signalCode === null) try { process.kill(-server.pid, 'SIGKILL'); } catch {} resolve(); }, 5000).unref(); } });
  writeFileSync('../local-next-server.log', serverLog);
}
