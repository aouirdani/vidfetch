import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const paths = ['/', '/fr', '/ar', '/blog/why-cant-i-save-tiktok'];
const widths = [320, 360, 390, 414];
const evidence = resolve(process.env.VIDFETCH_NAV_EVIDENCE_DIR ?? 'build/navigation-evidence');
const results = [];
let child, browser, success = false, base = process.env.VIDFETCH_NAV_BASE_URL;
if (base) {
  const url = new URL(base);
  assert.ok(url.origin === 'https://vidfetch.app' || ['127.0.0.1', 'localhost'].includes(url.hostname), 'explicit VidFetch or loopback target');
  base = url.origin;
}

async function visit(page, path) {
  const response = await page.goto(base + path, { waitUntil: 'load' });
  assert.equal(response.status(), 200, path);
  await page.locator('header[data-menu-position-ready]').waitFor();
}

async function inBounds(page, panel, mobile) {
  const dimensions = await panel.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      width: innerWidth, height: innerHeight,
      scrollWidth: document.scrollingElement.scrollWidth,
      panelScrollWidth: element.scrollWidth, panelClientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
      position: getComputedStyle(element).position,
      headerBottom: document.querySelector('header.site-header').getBoundingClientRect().bottom,
    };
  });
  assert.ok(dimensions.left >= 0 && dimensions.right <= dimensions.width, JSON.stringify(dimensions));
  assert.ok(dimensions.scrollWidth <= dimensions.width, `${page.url()}: no document horizontal scroll ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.panelScrollWidth <= dimensions.panelClientWidth, 'no panel horizontal scroll');
  if (mobile) {
    assert.equal(dimensions.position, 'fixed');
    assert.ok(dimensions.top >= dimensions.headerBottom && dimensions.top <= dimensions.headerBottom + 8, 'panel immediately below header');
    assert.ok(dimensions.bottom <= dimensions.height, 'panel inside visible viewport');
  }
  return dimensions;
}

async function visibleLink(page, link, panel) {
  await link.scrollIntoViewIfNeeded();
  const bounds = await link.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const range = document.createRange(); range.selectNodeContents(element);
    return {
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      text: [...range.getClientRects()].map(r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })),
      textOverflow: getComputedStyle(element).textOverflow,
    };
  });
  const box = await panel.boundingBox();
  const viewport = page.viewportSize();
  for (const rect of [bounds.rect, ...bounds.text]) {
    assert.ok(rect.left >= 0 && rect.right <= viewport.width, 'complete link and label within viewport');
    assert.ok(rect.top >= box.y && rect.bottom <= box.y + box.height, 'complete link and label within scroll panel');
  }
  assert.notEqual(bounds.textOverflow, 'ellipsis', 'labels are not truncated');
}

async function testDisclosure(page, path, panelSelector, mobile) {
  await visit(page, path);
  let panel = page.locator(panelSelector);
  let summary = panel.locator('..').locator(':scope > summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await panel.waitFor({ state: 'visible' });
  const dimensions = await inBounds(page, panel, mobile);
  const hrefs = await panel.locator('a').evaluateAll(links => links.map(a => a.getAttribute('href')));
  assert.ok(hrefs.length > 0);
  if (mobile) {
    assert.equal(await panel.locator('section[aria-labelledby="mobile-trust-heading"] a').count(), 2, 'separate trust section retains both links');
    assert.ok((await panel.locator('#mobile-trust-heading').innerText()).trim());
  }
  await page.keyboard.press('Tab');
  const focused = panel.locator('a:focus-visible');
  assert.equal(await focused.count(), 1, 'keyboard focus is visible on menu link');
  assert.equal(await focused.evaluate(e => getComputedStyle(e).outlineStyle !== 'none' && parseFloat(getComputedStyle(e).outlineWidth) >= 2), true);
  await page.keyboard.press('Escape');
  assert.equal(await panel.isVisible(), false, 'Escape closes disclosure');
  assert.equal(await summary.evaluate(e => e === document.activeElement), true, 'Escape returns focus to trigger');

  let scrolled = false;
  for (const [index, href] of hrefs.entries()) {
    await visit(page, path);
    panel = page.locator(panelSelector);
    summary = panel.locator('..').locator(':scope > summary');
    await summary.click();
    await panel.waitFor({ state: 'visible' });
    await inBounds(page, panel, mobile);
    const link = panel.locator('a').nth(index);
    await visibleLink(page, link, panel);
    scrolled ||= await panel.evaluate(e => e.scrollTop > 0);
    const target = new URL(href, base + path);
    const sameDocument = new URL(page.url()).pathname === target.pathname && !!target.hash;
    const navigation = sameDocument ? null : page.waitForNavigation({ waitUntil: 'load' });
    await link.click();
    const response = navigation ? await navigation : null;
    assert.equal(decodeURI(page.url()), decodeURI(target.href), `clicked ${href}`);
    if (!sameDocument) assert.equal(response?.status(), 200, `destination ${href}`);
    assert.ok(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), 'destination has no horizontal scroll');
  }
  if (mobile && dimensions.scrollHeight > dimensions.clientHeight) assert.ok(scrolled, 'links reached with internal vertical scrolling');
  results.push({ path, viewport: page.viewportSize(), menu: panelSelector, dimensions, clicked: hrefs, scrolled, keyboard: 'visible focus; Escape closes and restores trigger' });
}

try {
  await mkdir(evidence, { recursive: true });
  if (!base) {
    const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
    const port = reserve.address().port; await new Promise(done => reserve.close(done));
    base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' }, detached: true, stdio: 'ignore' });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).status === 200) { ready = true; break; } } catch {}
      if (child.exitCode !== null) break;
      await delay(250);
    }
    assert.ok(ready, 'production Next build starts');
  }
  browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}) });
  const context = await browser.newContext();
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const page = await context.newPage();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 700 });
    for (const path of paths) await testDisclosure(page, path, '[data-mobile-navigation-panel]', true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const path of paths) {
    for (const selector of ['[data-header-tools-panel]', '[data-header-legal-panel]']) await testDisclosure(page, path, selector, false);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [locale, path] of [['en', '/'], ['ar', '/ar']]) {
    await visit(page, path);
    await page.locator('[data-mobile-navigation] > summary').click();
    const panel = page.locator('[data-mobile-navigation-panel]');
    const dimensions = await inBounds(page, panel, true);
    await page.screenshot({ path: resolve(evidence, `after-${locale}-390.webp`), type: 'webp' });
    await panel.locator('section a').last().scrollIntoViewIfNeeded();
    await visibleLink(page, panel.locator('section a').last(), panel);
    await page.screenshot({ path: resolve(evidence, `after-${locale}-390-trust.webp`), type: 'webp' });
    results.push({ locale, viewport: page.viewportSize(), dimensions, screenshot: `after-${locale}-390.webp`, trustScreenshot: `after-${locale}-390-trust.webp` });
  }
  success = true;
  console.log(`HEADER NAVIGATION PASS: ${widths.length * paths.length} mobile cases, ${paths.length * 2} desktop menus; every link clicked, focus/Escape and viewport bounds verified.`);
} finally {
  await writeFile(resolve(evidence, 'navigation.json'), JSON.stringify({ capturedAt: new Date().toISOString(), release: process.env.GITHUB_SHA ?? null, base, success, results }, null, 2) + '\n');
  await browser?.close();
  if (child?.exitCode === null) {
    process.kill(-child.pid, 'SIGTERM');
    await Promise.race([once(child, 'exit'), delay(5000)]);
    if (child.exitCode === null) process.kill(-child.pid, 'SIGKILL');
  }
}
