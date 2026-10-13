import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
const output = process.env.VIDFETCH_TEST_OUTPUT ?? 'backend/artifacts/download-validation';
await mkdir(output, { recursive: true });
const report = { scope: 'Browser -> local HTTPS Caddy on VPS -> isolated UID-filtered worker, real yt-dlp/ffmpeg, licensed W3C trailer; challenge simulated only in fixture server. Not a public production validation.', checks: [], transfers: [], errors: [] };
const browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP vidfetch.app 127.0.0.1'], ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}) });
const context = await browser.newContext({ acceptDownloads: true, ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
const origin = 'https://vidfetch.app:33443';
const status = [], preparations = [];
try {
  await context.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', route => route.fulfill({ contentType: 'application/javascript', body: 'window.turnstile={render:function(el,o){el.textContent="Local test verification";setTimeout(function(){o.callback("authorized-local-fixture")},10);return "test";},remove:function(){},reset:function(){}};' }));
  const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
  page.on('response', async response => {
    const url = new URL(response.url());
    if (url.pathname === '/api/download' && url.searchParams.has('status')) status.push(await response.json());
    if (url.pathname === '/api/download' && response.request().method() === 'POST' && response.status() === 201) preparations.push(await response.json());
  });
  await page.goto(origin, { waitUntil: 'networkidle' });
  assert.equal(await page.getByText('Local test verification').count(), 0);
  await page.getByRole('textbox', { name: 'Video link' }).fill('https://youtu.be/aqz-KE-bpKQ');
  await page.getByRole('button', { name: 'Extract', exact: true }).click();
  await page.getByRole('tab', { name: /Video/ }).waitFor({ timeout: 30000 });
  report.checks.push('On-demand authorization, browser proof key and extraction through Caddy');
  for (const [type, ext] of [['video', 'ogv'], ['audio', 'mp3']]) {
    status.length = 0;
    const start = Date.now();
    if (type === 'audio') { await page.getByRole('tab', { name: /Audio/ }).click(); await page.getByRole('radio', { name: /MP3/ }).click(); }
    // The native download belongs to the helper popup, rather than a file Blob in Next/React.
    const received = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Native browser download timed out')), 120000);
      const listen = popup => popup.once('download', download => { clearTimeout(timeout); resolve(download); });
      context.once('page', listen);
    });
    await page.getByRole('button', { name: /^Download / }).click();
    const download = await received;
    const file = output + '/received.' + ext; await download.saveAs(file); assert.equal(await download.failure(), null);
    await page.getByText(/^Saved [\d.]+ (?:MiB|KiB|MB|KB|B) to your device\./).first().waitFor({ timeout: 30000 });
    const ready = preparations.at(-1); assert.ok(ready);
    // Give the response observer a chance to record the completed status.
    await page.waitForTimeout(150);
    const completed = status.findLast(s => s.ok && s.status === 'completed'); assert.ok(completed);
    const size = (await stat(file)).size; assert.equal(completed.bytes, size);
    const h = createHash('sha256'); for await (const chunk of createReadStream(file)) h.update(chunk);
    const sha256 = h.digest('hex');
    if (type === 'video') assert.equal(sha256, 'dcbe6f2ea404a52d4b2f6fc91f274874e69be1671a1097eb3dc19f28f7c6e40f');
    const replay = await page.evaluate(async url => { const r = await fetch(url, { credentials: 'same-origin' }); return r.status; }, ready.downloadUrl);
    assert.equal(replay, 404);
    report.transfers.push({ type, size, sha256, milliseconds: Date.now() - start, completedBytes: completed.bytes, singleUse: true, filename: download.suggestedFilename() });
    report.checks.push(`Complete native ${type} download, byte count and one-use ticket`);
  }
  assert.deepEqual(report.errors, []);
  await page.screenshot({ path: output + '/completed-mobile.png', fullPage: true });
} finally { await browser.close(); report.observedStatuses = status; await writeFile(output + '/verification.json', JSON.stringify(report, null, 2)); }
console.log(JSON.stringify(report, null, 2));
