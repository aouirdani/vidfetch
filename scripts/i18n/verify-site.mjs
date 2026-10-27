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
// Only English has guides to show: the other guide indexes are not pages (404), never an empty "being reviewed" page.
const blogs = ['blog'];
const removedPages = ['/fr/guides', '/es/guias', '/pt/guias', '/id/panduan', '/de/ratgeber', '/it/guide', '/ar/أدلة', '/youtube-video-downloader', '/instagram-reels-downloader', '/twitter-video-downloader'];
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
  const noticeModule = resolve(`../notice-fixture-${process.pid}.mjs`);
  writeFileSync(noticeModule, (await build({ entryPoints: ['src/lib/youtube-notice.ts'], bundle: true, platform: 'node', format: 'esm', write: false })).outputFiles[0].text, { flag: 'wx' });
  const { YOUTUBE_NOTICE: youtubeNotice } = await import(pathToFileURL(noticeModule).href);
  const homeModule = resolve(`../home-copy-fixture-${process.pid}.mjs`);
  writeFileSync(homeModule, (await build({ entryPoints: ['src/lib/home-copy.ts'], bundle: true, platform: 'node', format: 'esm', write: false })).outputFiles[0].text, { flag: 'wx' });
  const { HOME_COPY: homeCopy, HOME_UPDATED: homeUpdated } = await import(pathToFileURL(homeModule).href);
  for (let n = 0; ; n++) { try { const r = await fetch(base + '/api/health'); if (r.ok) break; } catch {} if (n > 100) throw Error('Local server did not start'); await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}) });
  const noJS = await browser.newContext({ javaScriptEnabled: false });
  const dom = await noJS.newPage();
  const sitemap = await (await fetch(base + '/sitemap.xml')).text();
  const canonicalPaths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname);
  // 8 homes + 8 legal pages + the 4 approved TikTok pages (en and fr, video and MP3); Instagram and X stay gated.
  assert.equal(canonicalPaths.length, 20);
  assert.equal(new Set(canonicalPaths).size, 20);
  const platformAlternates = { '/tiktok-video-downloader': ['en', 'fr', 'x-default'], '/fr/telecharger-video-tiktok': ['en', 'fr', 'x-default'], '/tiktok-to-mp3': ['en', 'fr', 'x-default'], '/fr/tiktok-en-mp3': ['en', 'fr', 'x-default'] };
  // lastmod: each page's own last substantial change
  const lastmod = Object.fromEntries([...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m => [new URL(m[1].match(/<loc>([^<]+)<\/loc>/)[1]).pathname, m[1].match(/<lastmod>([^<]+)<\/lastmod>/)[1].slice(0, 10)]));
  assert.equal(Object.keys(lastmod).length, 20);
  for (const path of ['/tiktok-video-downloader', '/tiktok-to-mp3', '/fr/telecharger-video-tiktok', '/fr/tiktok-en-mp3']) assert.equal(lastmod[path], '2026-10-27', path);
  for (const [path, date] of Object.entries(lastmod)) if (!(path in platformAlternates)) assert.equal(date, roots.includes(path.slice(1)) ? homeUpdated : '2026-10-12', path);
  const alternatesOf = new Map();
  assert.doesNotMatch(sitemap, /youtube|\/api\/|mp4-vs-webm/);
  const englishGuides = (await import('node:fs/promises')).readdir('content/guides');
  const guidePaths = (await englishGuides).filter(name => name.endsWith('.md')).map(name => '/blog/' + name.slice(0, -3));
  const paths = [...canonicalPaths, ...blogs.map(path => '/' + path), ...guidePaths];
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
    if (!indexable) assert.equal(Object.keys(data.alternates).length, 0, path);
    else if (platformAlternates[path]) assert.deepEqual(Object.keys(data.alternates).sort(), [...platformAlternates[path]].sort(), path);
    else assert.equal(Object.keys(data.alternates).length, 9, path);
    if (indexable) alternatesOf.set(new URL(path, 'https://vidfetch.app').href, data.alternates);
    assert.ok(data.jsonld.length, path);
    for (const href of data.links.filter(href => href.startsWith('/') && !href.startsWith('//'))) assert.ok(allPaths.has(decodeURI(href.split('#')[0].split('?')[0]) || '/'), `${path} -> ${href}`);
    const locale = locales[roots.findIndex(root => root && decodeURI(path).startsWith('/' + root))] ?? 'en';
    assert.equal(data.lang, locale, path); assert.equal(data.dir, locale === 'ar' ? 'rtl' : 'ltr');
    evidence.serverPages++;
  }
  const legalPages = ['/legal', '/fr/mentions-legales', '/es/aviso-legal', '/pt/termos-e-privacidade', '/id/ketentuan-dan-privasi', '/de/rechtliches', '/it/note-legali', '/ar/الشروط-والخصوصية'];
  const tiktokPages = ['/tiktok-video-downloader', '/tiktok-to-mp3', '/fr/telecharger-video-tiktok', '/fr/tiktok-en-mp3'];
  for (const [i, root] of roots.entries()) {
    await dom.setContent(await (await fetch(base + '/' + root)).text());
    const links = await dom.evaluate(() => [...document.querySelectorAll('main a[href], body a[href]')].map(e => ({ href: decodeURI(e.getAttribute('href')), lang: e.getAttribute('hreflang') })));
    const want = locales[i] === 'en' ? ['/tiktok-video-downloader', '/tiktok-to-mp3'] : locales[i] === 'fr' ? ['/fr/telecharger-video-tiktok', '/fr/tiktok-en-mp3'] : ['/tiktok-video-downloader', '/tiktok-to-mp3'];
    for (const href of want) assert.ok(links.some(l => l.href === href), `home ${locales[i]} -> ${href}`);
    if (!['en', 'fr'].includes(locales[i])) for (const href of want) assert.ok(links.some(l => l.href === href && l.lang === 'en'), `home ${locales[i]} -> ${href} marked hreflang=en`);
    const legal = legalPages[i]; assert.ok(canonicalPaths.map(decodeURI).includes(legal), legal);
    const legalHtml = await (await fetch(base + encodeURI(legal))).text(); await dom.setContent(legalHtml);
    // the legal text itself carries no TikTok link; the site navigation (footer) does, on every page
    const legalLinks = await dom.evaluate(() => ({ main: [...document.querySelectorAll('main a[href]')].map(e => decodeURI(e.getAttribute('href'))), footer: [...document.querySelectorAll('footer a[href]')].map(e => ({ href: decodeURI(e.getAttribute('href')), lang: e.getAttribute('hreflang') })) }));
    assert.equal(legalLinks.main.some(href => tiktokPages.includes(href)), false, `legal text of ${legal} stays free of SEO links`);
    for (const href of want) assert.ok(legalLinks.footer.some(l => l.href === href && l.lang === (['en', 'fr'].includes(locales[i]) ? null : 'en')), `footer of ${legal} -> ${href}`);
    // the AdSense tag: on the home, never on the legal page
    assert.match(await (await fetch(base + '/' + root)).text(), /adsbygoogle\.js\?client=ca-pub-/, `home ${locales[i]} loads the AdSense tag`);
    assert.doesNotMatch(legalHtml, /adsbygoogle/, `legal ${legal} has no AdSense tag`);
  }
  for (const [url, alternates] of alternatesOf) {
    assert.ok(Object.values(alternates).includes(url), `${url} is not in its own hreflang set`);
    for (const target of Object.values(alternates)) assert.deepEqual(alternatesOf.get(target), alternates, `${url} -> ${target}: hreflang not reciprocal`);
  }
  for (const [i, locale] of locales.entries()) {
    const path = '/' + roots[i], d = dictionaries[locale];
    const response = await fetch(base + path); await dom.setContent(await response.text());
    assert.equal(await dom.locator('h1').textContent(), homeCopy[locale].heroTitle + homeCopy[locale].heroAccent);
    assert.equal(await dom.title(), homeCopy[locale].title);
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
    await page.goto(base + path); await page.getByRole('textbox', { name: d.videoLink }).fill('https://www.tiktok.com/@pokemonlife22/video/7059698374567611694');
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
    await context.route('**/api/fetch-info', route => { requests.push(new URL(route.request().url()).pathname); return route.fulfill({ json: { ok: true, engine: { ffmpeg: true, ytDlp: 'fixture' }, info: { platform: 'tiktok', platformVideoId: 'fixture', url: 'https://www.tiktok.com/@pokemonlife22/video/7059698374567611694', title: 'VidFetch', thumbnail: null, durationLabel: '00:33', viewCount: 12, uploader: 'VidFetch', formats: [video, second, audio], videoFormats: [video, second], audioFormats: [audio] } } }); });
    await context.route(/\/download-helper\?lang=/, route => { assert.equal(new URL(route.request().url()).searchParams.get('lang'), locale); const helper = downloadHelper([base], locale); return route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': helper.csp }, body: helper.html }); });
    await context.route('**/auth/transfer', route => route.fulfill({ json: { ok: true } }));
    await context.route(/\/api\/download(?:\?|$)/, route => {
      const request = route.request(), url = new URL(request.url()); requests.push(url.pathname);
      if (request.method() === 'POST') { const body = request.postDataJSON(); assert.deepEqual(Object.keys(body).sort(), ['format_id', 'type', 'url']); assert.equal(body.type, 'audio'); assert.equal(body.format_id, 'mp3'); return route.fulfill({ json: { ok: true, token: 'fixture-ticket', filename: 'fixture.bin', downloadUrl: '/api/download?ticket=fixture-ticket' } }); }
      if (url.searchParams.has('ticket')) return route.fulfill({ contentType: 'application/octet-stream', headers: { 'Content-Disposition': 'attachment; filename="fixture.bin"' }, body: attachment });
      return route.fulfill({ json: { ok: true, status: 'completed', bytes: attachment.length, error: null } });
    });
    await page.goto(base + path); await page.getByRole('textbox', { name: d.videoLink }).fill('https://www.tiktok.com/@pokemonlife22/video/7059698374567611694'); await page.getByRole('button', { name: d.extract, exact: true }).click();
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
    await page.goto(base + path); await page.waitForLoadState('networkidle');
    const sent = []; page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/') || /challenges\.cloudflare\.com/.test(request.url())) sent.push(request.url()); });
    await page.getByRole('textbox', { name: d.videoLink }).fill('https://youtu.be/aqz-KE-bpKQ');
    await page.getByRole('status').filter({ hasText: youtubeNotice[locale].title }).waitFor();
    assert.equal(await page.getByRole('button', { name: d.extract, exact: true }).isDisabled(), true, locale);
    await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    assert.deepEqual(sent, [], `${locale}: a YouTube link sends nothing`);
    assert.equal(await page.getByRole('button', { name: 'YouTube', exact: true }).count(), 0, `${locale}: no YouTube example`);
    for (const name of ['TikTok', 'Instagram']) assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0, `${locale}: no example button that starts a download`);
    const missing = await page.goto(base + '/' + roots[i] + 'missing-page'); assert.equal(missing.status(), 404, locale);
    assert.doesNotMatch(await missing.text(), /adsbygoogle/, `${locale}: no AdSense tag on a 404`);
    assert.equal(await page.locator('html').getAttribute('lang'), locale);
    await page.getByRole('heading', { name: d.notFoundTitle }).waitFor();
    const robotsTags = await page.locator('meta[name=robots]').evaluateAll(nodes => nodes.map(node => node.getAttribute('content')));
    assert.ok(robotsTags.length && robotsTags.every(value => /noindex/.test(value)));
    assert.equal(await page.locator('link[rel=canonical]').count(), 0);
    await context.close(); evidence.locales.push(locale);
  }
  {
    // /fr/tiktok-en-mp3: its own form works (mocked admission and engine, as above)
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage(), d = dictionaries.fr, errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => new URL(route.request().url()).hostname === 'challenges.cloudflare.com' ? route.fulfill({ contentType: 'text/javascript', body: '' }) : route.abort());
    await page.addInitScript(() => { window.turnstile = { render(element, options) { setTimeout(() => options.callback('fixture-challenge'), 0); return 'fixture'; }, remove() {}, reset() {} }; });
    await context.route('**/api/download-access', route => route.fulfill({ json: route.request().method() === 'GET' ? { available: true, siteKey: 'fixture-public-key' } : { ok: true, grant: 'fixture-grant', expiresAt: Date.now() + 120000 } }));
    const audio = { id: 'mp3', label: 'MP3 · 192 kbps', kind: 'audio', ext: 'mp3', width: null, height: null, fps: null, vcodec: null, acodec: 'mp3', hasAudio: true, progressive: true, filesize: null, filesizeLabel: null, bitrateKbps: 192, note: null, recommended: true };
    const video = { ...audio, id: 'v1', label: '720p', kind: 'video', ext: 'mp4', width: 720, height: 1280, fps: 30, vcodec: 'h264', acodec: 'aac', bitrateKbps: null };
    await context.route('**/api/fetch-info', route => route.fulfill({ json: { ok: true, engine: { ffmpeg: true, ytDlp: 'fixture' }, info: { platform: 'tiktok', platformVideoId: 'fixture', url: 'https://www.tiktok.com/@pokemonlife22/video/7059698374567611694', title: 'VidFetch', thumbnail: null, durationLabel: '00:33', viewCount: 12, uploader: 'VidFetch', formats: [video, audio], videoFormats: [video], audioFormats: [audio] } } }));
    await page.goto(base + '/fr/tiktok-en-mp3');
    assert.equal(await page.locator('h1').textContent(), 'Convertir une vidéo TikTok en MP3');
    await page.getByRole('textbox', { name: d.videoLink }).fill('https://www.tiktok.com/@pokemonlife22/video/7059698374567611694'); await page.getByRole('button', { name: d.extract, exact: true }).click();
    await page.getByRole('tab', { name: new RegExp(d.audio) }).waitFor();
    assert.deepEqual(errors, []); await context.close();
  }
  assert.equal((await fetch(base + '/fr', { redirect: 'manual' })).status, 308);
  const status = await fetch(base + '/api/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(status.status, 503); assert.equal((await status.json()).code, 'BACKEND_UNAVAILABLE');
  assert.equal((await fetch(base + '/api/fetch-info')).status, 405);
  assert.equal((await fetch(base + '/fr/api/download')).status, 404);
  assert.equal((await fetch(base + '/fr/guides/mp4-ou-webm')).status, 404);
  for (const gated of ['/es/descargar-video-instagram', '/fr/telecharger-reels-instagram', '/fr/telecharger-video-x', '/tiktok-mp3', ...removedPages]) assert.equal((await fetch(base + encodeURI(gated))).status, 404, gated);
  const favicon = await fetch(base + '/favicon.ico'); assert.equal(favicon.status, 200); assert.deepEqual([...new Uint8Array(await favicon.arrayBuffer()).subarray(0, 4)], [0, 0, 1, 0]);
  const robots = await (await fetch(base + '/robots.txt')).text(); assert.match(robots, /Disallow: \/api\//);
  evidence.checks.push(`${evidence.serverPages} server-rendered pages; eight locales, selectors, localized 404 and degraded UI`, 'reciprocal hreflang and self canonicals', '20 sitemap entries (4 approved TikTok pages) with per-page lastmod; no drafts; empty guide indexes and the YouTube, Instagram and X pages answer 404', 'TikTok home titles and H1 (outside the gateway dictionaries); homes and the footer of every legal page link the TikTok pages (own language, else English marked hreflang=en); the legal text itself carries no such link', 'AdSense tag on the homes only among homes, legal pages and 404s; no example button; favicon.ico', 'a YouTube link: immediate notice, Extract disabled, no request, no YouTube example; /fr/tiktok-en-mp3 form works', 'RTL mobile navigation, LTR URL field and radio keyboard controls', 'eight synthetic native transfers with real helper and byte integrity; mocked engines, no media conversion claim', 'API paths, methods and BACKEND_UNAVAILABLE unchanged');
  writeFileSync('../http-browser-verification.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser?.close();
  if (server.exitCode === null && server.signalCode === null) try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  await new Promise(resolve => { if (server.exitCode !== null || server.signalCode !== null) resolve(); else { server.once('exit', resolve); setTimeout(() => { if (server.exitCode === null && server.signalCode === null) try { process.kill(-server.pid, 'SIGKILL'); } catch {} resolve(); }, 5000).unref(); } });
  writeFileSync('../local-next-server.log', serverLog);
}
