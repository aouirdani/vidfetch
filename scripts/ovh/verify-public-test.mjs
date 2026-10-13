// Authorized public HTTPS test; credentials are read from a mode-0600 local file.
// Never records credentials, request headers, cookies, HAR or browser traces.
import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { connect } from 'node:tls';
import { chromium } from 'playwright';

const origin = 'https://vidfetch.app';
const secretPath = process.env.VIDFETCH_TEST_CREDENTIALS;
const output = process.env.VIDFETCH_PUBLIC_TEST_OUTPUT;
assert.ok(secretPath && output, 'Private credentials path and new output file required');
assert.equal((await stat(secretPath)).mode & 0o777, 0o600);
const credentials = JSON.parse(await readFile(secretPath, 'utf8'));
const authorization = 'Basic ' + Buffer.from(credentials.username + ':' + credentials.password).toString('base64');
const locales = ['en', 'fr', 'es', 'pt-BR', 'id', 'de', 'it', 'ar'];
const homes = ['/', '/fr/', '/es/', '/pt/', '/id/', '/de/', '/it/', '/ar/'];
const report = { testedAt: new Date().toISOString(), certificates: [], protection: [], locales: [], redirects: [], media: [], browserErrors: [] };
let browser;
async function pageRequest(path, authenticated = false, options = {}) {
  const response = await fetch(origin + path, { redirect: 'manual', ...options,
    headers: { ...options.headers, ...(authenticated ? { Authorization: authorization } : {}) } });
  return response;
}
function certificate(host) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port: 443, servername: host, rejectUnauthorized: true }, () => {
      const cert = socket.getPeerCertificate();
      const data = { host, authorized: socket.authorized, protocol: socket.getProtocol(), subject: cert.subject,
        issuer: cert.issuer, validFrom: cert.valid_from, validTo: cert.valid_to, fingerprint256: cert.fingerprint256 };
      socket.end(); resolve(data);
    });
    socket.setTimeout(10000, () => socket.destroy(Error('TLS validation timeout')));
    socket.once('error', reject);
  });
}
try {
  for (const host of ['vidfetch.app', 'www.vidfetch.app']) report.certificates.push(await certificate(host));
  for (const path of [...homes, '/api/health', '/blog', '/favicon.ico']) {
    const response = await pageRequest(path);
    assert.equal(response.status, 401, 'Anonymous frontend must be protected: ' + path);
    assert.match(response.headers.get('www-authenticate') ?? '', /Basic/);
    assert.match(response.headers.get('x-robots-tag') ?? '', /noindex/);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    report.protection.push({ path, anonymous: 401 });
  }
  const wrong = await fetch(origin + '/', { headers: { Authorization: 'Basic ' + Buffer.from(credentials.username + ':intentionally-invalid-test-password').toString('base64') } });
  assert.equal(wrong.status, 401); report.protection.push({ wrongPassword: 401 });
  assert.equal((await pageRequest('/sitemap.xml')).status, 404);
  assert.equal((await pageRequest('/sitemap.xml', true)).status, 404);
  const robots = await (await pageRequest('/robots.txt')).text();
  assert.match(robots, /Disallow: \/\s*$/); assert.doesNotMatch(robots, /Sitemap:/i);
  const health = await (await pageRequest('/api/health', true)).json();
  assert.equal(health.release, '689c592141287a1ca1e45569a89e5d76f18133ed');
  assert.equal(health.downloads.available, false); report.release = health.release;
  for (const path of ['/auth/admission', '/auth/deployment', '/internal/test']) assert.equal((await pageRequest(path)).status, 404);
  for (const path of ['/api/fetch-info', '/api/download', '/api/queue', '/api/download-access', '/auth/transfer', '/download-helper']) {
    for (const method of ['GET', 'POST']) {
      const response = await pageRequest(path, false, { method });
      assert.equal(response.status, 503); assert.equal((await response.json()).code, 'BACKEND_UNAVAILABLE');
      assert.match(response.headers.get('cache-control') ?? '', /no-store/);
      report.media.push({ path, method, status: 503 });
    }
  }
  for (const [url, code, target] of [
    ['http://vidfetch.app/fr/?probe=1', 308, 'https://vidfetch.app/fr/?probe=1'],
    ['http://www.vidfetch.app/fr/?probe=1', 308, 'https://www.vidfetch.app/fr/?probe=1'],
    ['https://www.vidfetch.app/ar/?probe=1', 301, 'https://vidfetch.app/ar/?probe=1'],
  ]) {
    const response = await fetch(url, { redirect: 'manual' });
    assert.equal(response.status, code); assert.equal(response.headers.get('location'), target);
    report.redirects.push({ url, status: code, location: target });
  }
  browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}) });
  const ssr = await browser.newContext({ javaScriptEnabled: false });
  const dom = await ssr.newPage();
  await dom.route('**/*', route => route.abort());
  for (let i = 0; i < locales.length; i++) {
    const locale = locales[i], path = homes[i], dictionary = JSON.parse(await readFile(`src/i18n/messages/${locale}.json`, 'utf8'));
    const response = await pageRequest(path, true); assert.equal(response.status, 200, locale);
    assert.match(response.headers.get('x-robots-tag') ?? '', /noindex/);
    assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/);
    assert.notEqual(response.headers.get('cf-cache-status'), 'HIT');
    const html = await response.text(); await dom.setContent(html);
    assert.equal(await dom.locator('html').getAttribute('lang'), locale);
    assert.equal(await dom.locator('html').getAttribute('dir'), locale === 'ar' ? 'rtl' : 'ltr');
    assert.equal(await dom.locator('h1').textContent(), dictionary.heroTitle + dictionary.heroAccent);
    assert.equal(new URL(await dom.locator('link[rel=canonical]').getAttribute('href')).href, origin + path);
    for (let k = 0; k < locales.length; k++) assert.equal(new URL(await dom.locator(`link[hreflang="${locales[k]}"]`).getAttribute('href')).href, origin + homes[k]);
    assert.equal(new URL(await dom.locator('link[hreflang="x-default"]').getAttribute('href')).href, origin + '/');
    const mobile = await browser.newContext({ httpCredentials: { ...credentials, origin }, viewport: { width: 390, height: 844 } });
    const page = await mobile.newPage();
    page.on('pageerror', error => report.browserErrors.push(error.name));
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin + path, { waitUntil: 'networkidle' });
    await page.locator('[data-language-selector] summary').click();
    assert.equal(await page.locator('[data-language-selector] nav a').count(), 8);
    const target = i === 0 ? 'fr' : 'en';
    await page.locator(`[data-language-selector] a[hreflang="${target}"]`).click();
    await page.waitForURL(origin + (target === 'en' ? '/' : '/fr/'));
    await page.goto(origin + path);
    const input = page.getByRole('textbox', { name: dictionary.videoLink });
    assert.equal(await input.getAttribute('dir'), 'ltr');
    await input.fill('https://youtu.be/aqz-KE-bpKQ');
    await page.getByRole('button', { name: dictionary.extract, exact: true }).click();
    await page.getByRole('status').filter({ hasText: dictionary.backendUnavailable }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const missing = await page.goto(origin + path + 'phase5-not-a-page');
    assert.equal(missing.status(), 404);
    await page.getByRole('heading', { name: dictionary.notFoundTitle }).waitFor();
    assert.equal(await page.locator('link[rel=canonical]').count(), 0);
    await mobile.close();
    report.locales.push({ locale, path, status: 200, SSR: true, canonical: true, reciprocalHreflang: true, mobile: true, selector: true, localizedUnavailable: true, localized404: true, rtl: locale === 'ar', noindex: true, privateNoStore: true });
  }
  for (const path of ['/fr/guides/mp4-ou-webm', '/ar/تنزيل-فيديو-يوتيوب']) assert.equal((await pageRequest(path, true)).status, 404);
  assert.equal((await pageRequest('/')).status, 401, 'Authenticated response must never populate public cache');
  assert.deepEqual(report.browserErrors, []);
  report.ok = true;
} catch (error) {
  const sanitize = value => String(value).replaceAll(credentials.username, '[redacted]').replaceAll(credentials.password, '[redacted]').replaceAll(authorization, '[redacted]');
  report.failure = { name: error.name, message: sanitize(error.message) };
  report.ok = false; process.exitCode = 1;
} finally {
  await browser?.close();
  report.completedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify({ ok: report.ok, locales: report.locales.length, mediaChecks: report.media.length, failure: report.failure }));
