import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { withSite } from './browser.mjs';

const capture = process.argv.includes('--capture');
const fixture = 'tests/fixtures/home-ui-preservation.json';
const evidence = process.env.VIDFETCH_UI_EVIDENCE_DIR ?? 'build/home-evidence';
const digest = value => createHash('sha256').update(value).digest('hex');
await withSite(async ({ browser, base }) => {
  if (capture) assert.equal(base, 'https://vidfetch.app', 'capture only the actual production baseline');
  const health = await (await fetch(base + '/api/health')).json();
  if (capture) assert.equal(health.release, 'c6deea404de094048c8b081d9c7709ac01636dc3');
  const sitemap = await (await fetch(base + '/sitemap.xml')).text();
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.equal(urls.length, 154); assert.equal(new Set(urls).size, 154);
  const targets = new Set(urls);
  const ads = await (await fetch(base + '/ads.txt')).text();
  const snapshot = { release: health.release, capturedAt: new Date().toISOString(), sitemapSha256: digest(sitemap), adsTxtSha256: digest(ads), pages: {}, incoming: {} };
  const previous = capture ? null : JSON.parse(await readFile(fixture, 'utf8'));
  if (previous) {
    assert.equal(snapshot.sitemapSha256, previous.sitemapSha256, 'sitemap unchanged');
    assert.equal(snapshot.adsTxtSha256, previous.adsTxtSha256, 'ads.txt unchanged');
    assert.deepEqual(new Set(urls.map(u => new URL(u).pathname)), new Set(Object.keys(previous.pages)));
  }
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.route('**/*', r => r.abort());
  const page = await context.newPage();
  for (const canonical of urls) {
    const path = new URL(canonical).pathname;
    const response = await fetch(base + path, { signal: AbortSignal.timeout(20000), redirect: 'manual' });
    assert.equal(response.status, 200, path);
    assert.doesNotMatch(response.headers.get('x-robots-tag') ?? '', /noindex|nofollow|\bnone\b/i, path);
    await page.setContent(await response.text(), { waitUntil: 'domcontentloaded' });
    const data = await page.evaluate(() => ({
      title: document.title,
      h1: [...document.querySelectorAll('h1')].map(e => e.textContent),
      description: document.querySelector('meta[name=description]')?.content,
      canonical: [...document.querySelectorAll('link[rel=canonical]')].map(e => e.href),
      robots: document.querySelector('meta[name=robots]')?.content,
      hreflang: Object.fromEntries([...document.querySelectorAll('link[rel=alternate][hreflang]')].map(e => [e.hreflang, e.href])),
      structuredData: [...document.querySelectorAll('script[type="application/ld+json"]')].map(e => JSON.parse(e.textContent)),
      adsense: [...document.querySelectorAll('meta[name=google-adsense-account]')].map(e => e.content),
      adScripts: document.querySelectorAll('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]').length,
      hrefs: [...document.querySelectorAll('a[href]')].map(e => e.getAttribute('href')),
    }));
    assert.equal(data.h1.length, 1, path); assert.deepEqual(data.canonical, [canonical], path);
    assert.match(data.robots, /\bindex\b/i, path); assert.match(data.robots, /\bfollow\b/i, path);
    assert.doesNotMatch(data.robots, /noindex|nofollow|\bnone\b/i, path); assert.equal(data.adScripts, 0, path);
    const links = {};
    for (const href of data.hrefs) {
      const target = new URL(href, canonical); target.hash = ''; target.search = '';
      if (!targets.has(target.href)) continue;
      links[target.href] = (links[target.href] ?? 0) + 1;
      snapshot.incoming[target.href] = (snapshot.incoming[target.href] ?? 0) + 1;
    }
    delete data.hrefs;
    if (previous) {
      const old = previous.pages[path];
      for (const [key, value] of Object.entries(data)) assert.deepEqual(value, old[key], `${path}: ${key} changed`);
      for (const [target, count] of Object.entries(old.links)) assert.ok((links[target] ?? 0) >= count, `${path} -> ${target}: internal link count reduced`);
    }
    snapshot.pages[path] = { ...data, links };
  }
  for (const target of urls) {
    assert.ok(snapshot.incoming[target] > 0, `${target}: orphan`);
    if (previous) assert.ok(snapshot.incoming[target] >= previous.incoming[target], `${target}: fewer incoming links`);
  }
  await mkdir(evidence, { recursive: true });
  if (capture) {
    await writeFile(fixture, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });
    const photos = await browser.newContext();
    await photos.route('**/*', r => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
    const view = await photos.newPage();
    for (const [locale, path] of [['fr', '/fr'], ['ar', '/ar']]) for (const width of [1440, 390]) {
      await view.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await view.goto(base + path, { waitUntil: 'load' }); await view.evaluate(() => document.fonts.ready); await view.waitForTimeout(1100);
      await view.screenshot({ path: `${evidence}/before-${locale}-${width}.webp`, type: 'webp' });
    }
  }
  await writeFile(`${evidence}/${capture ? 'baseline' : 'preservation'}.json`, JSON.stringify({ success: true, base, release: health.release, checkedAt: new Date().toISOString(), pages: urls.length, metadataAndSchemaUnchanged: !capture, linksPreserved: !capture, incoming: snapshot.incoming }, null, 2) + '\n');
  console.log(`PUBLIC UI CONTRACT ${capture ? 'CAPTURED' : 'PASS'}: 154 URLs; exact H1/title/description/canonical/hreflang/JSON-LD/AdSense; internal links preserved per page and destination; sitemap and ads.txt identical.`);
});
