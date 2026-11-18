import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { withSite } from './browser.mjs';

const routes = ['/', '/fr', '/ar', '/de', '/fr/telecharger-video-tiktok'];
const viewports = [{ width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 360, height: 740 }];
const evidence = process.env.VIDFETCH_UI_EVIDENCE_DIR ?? 'build/home-evidence';
const fixture = 'https://www.tiktok.com/@fixture/video/1234567890123456789';
const results = [];
let current = '', success = false;
function within(rect, viewport, label) {
  assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width && rect.y + rect.height <= viewport.height, `${label}: ${JSON.stringify(rect)} in ${JSON.stringify(viewport)}`);
}
function contrast(a, b) {
  const lum = rgb => rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((n, x, i) => n + x * [.2126, .7152, .0722][i], 0);
  const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
await mkdir(evidence, { recursive: true });
await withSite(async ({ browser, base }) => {
  const context = await browser.newContext();
  await context.route('**/*', r => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
  await context.addInitScript(value => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => value } }), fixture);
  const page = await context.newPage();
  const submissions = [];
  page.on('request', r => { if (/\/api\/(fetch-info|download-access|download)(?:\?|$)/.test(r.url())) submissions.push(r.url()); });
  async function visit(path, viewport) {
    current = `${path} ${viewport.width}x${viewport.height}`;
    await page.setViewportSize(viewport);
    assert.equal((await page.goto(base + path, { waitUntil: 'load' })).status(), 200, current);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('header[data-menu-position-ready]').waitFor();
    await page.mouse.move(0, 0);
    await page.locator('.fetch-surface').evaluate(async e => { await Promise.all(e.getAnimations().map(a => a.finished)); });
  }
  async function visibleFocus(locator) {
    assert.equal(await locator.evaluate(e => e.matches(':focus-visible') && getComputedStyle(e).outlineStyle !== 'none' && parseFloat(getComputedStyle(e).outlineWidth) >= 2), true, current + ': visible keyboard focus');
  }
  try {
    for (const viewport of viewports) for (const path of routes) {
      await visit(path, viewport);
      const input = page.locator('#vidfetch-url'), primary = page.locator('.fetch-submit'), paste = page.locator('.fetch-paste'), help = page.locator('#url-help');
      const inputBox = await input.boundingBox(), buttonBox = await primary.boundingBox(), control = await page.locator('[data-input-control]').boundingBox();
      within(inputBox, viewport, current + ': input above fold'); within(buttonBox, viewport, current + ': primary above fold'); within(control, viewport, current + ': entire control above fold');
      assert.ok(inputBox.height >= 56 && buttonBox.height >= 56, current + ': control heights');
      if (viewport.width === 1440) assert.ok(control.width >= 720, current + ': field at least 720px wide');
      for (const target of [paste, primary]) { const r = await target.boundingBox(); assert.ok(r.width >= 44 && r.height >= 44, '44px touch targets'); }
      assert.equal(await input.getAttribute('dir'), 'ltr');
      assert.equal(await primary.isEnabled(), true, 'empty field can submit');
      const colors = await page.locator('.fetch-shell').evaluate(e => ({ background: getComputedStyle(e).backgroundColor, placeholder: getComputedStyle(e.querySelector('input'), '::placeholder').color, button: getComputedStyle(e.querySelector('.fetch-submit')).backgroundColor, buttonText: getComputedStyle(e.querySelector('.fetch-submit')).color }));
      assert.equal(colors.button, 'rgb(47, 91, 255)'); assert.ok(contrast(colors.placeholder, colors.background) >= 4.5); assert.ok(contrast(colors.buttonText, colors.button) >= 4.5);
      const night = 'rgb(16, 22, 58)';
      const band = page.locator(path.includes('telecharger-video') ? '.platform-night-band' : '.home-hero');
      assert.equal(await band.evaluate(e => getComputedStyle(e).backgroundColor), night);
      const bandBox = await band.boundingBox();
      assert.ok(bandBox.x === 0 && bandBox.width === viewport.width, current + ': full width Night band');
      assert.equal(await page.locator('.site-header').evaluate(e => getComputedStyle(e).backgroundColor), night);
      assert.equal(await page.locator('body').evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(238, 241, 248)', 'rest of page stays light');
      for (const label of ['.hero-description', '#url-help', '.fetch-permission']) assert.ok(contrast(await page.locator(label).evaluate(e => getComputedStyle(e).color), night) >= 4.5, current + ': Night text contrast ' + label);
      assert.equal(await primary.locator('svg').evaluate(e => getComputedStyle(e).color), 'rgb(255, 194, 51)');
      assert.equal(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth && scrollY === 0), true, current + ': no horizontal scroll');
      const lines = await page.locator('h1').evaluate(e => {
        const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT), tops = [];
        while (walker.nextNode()) { const r = document.createRange(); r.selectNodeContents(walker.currentNode); for (const box of r.getClientRects()) if (box.width) tops.push(Math.round(box.top)); }
        return new Set(tops).size;
      });
      if (!path.includes('telecharger-video')) assert.ok(viewport.width >= 1024 ? lines === 2 : lines <= 3, current + ': H1 line count ' + lines);
      if (!path.includes('telecharger-video')) assert.equal(await page.locator('h1 > span').evaluate(e => getComputedStyle(e).color), 'rgb(255, 194, 51)');
      if (viewport.width >= 1024) assert.ok((await page.locator('.header-inner').boundingBox()).height <= 80, current + ': one-line desktop header');
      // Reach the field through the actual Tab order, then Paste and Download.
      await page.locator('body').click({ position: { x: 2, y: 2 } });
      await page.evaluate(() => document.activeElement?.blur());
      let reached = false;
      for (let i = 0; i < 35; i++) { await page.keyboard.press('Tab'); if (await input.evaluate(e => e === document.activeElement)) { reached = true; break; } }
      assert.ok(reached, current + ': Tab reaches input'); await visibleFocus(input);
      await page.keyboard.press('Tab'); assert.equal(await paste.evaluate(e => e === document.activeElement), true); await visibleFocus(paste);
      await page.keyboard.press('Tab'); assert.equal(await primary.evaluate(e => e === document.activeElement), true); await visibleFocus(primary);
      const reserved = await help.boundingBox();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.activeElement?.id === 'vidfetch-url' && document.querySelector('#url-help').dataset.state === 'error');
      assert.equal(await help.locator('.fetch-help-icon').count(), 1, 'error has an icon');
      assert.equal(await help.evaluate(e => getComputedStyle(e).color), 'rgb(255, 194, 51)');
      assert.ok((await help.innerText()).trim()); assert.equal((await help.boundingBox()).height, reserved.height);
      await input.fill('not a video link'); await primary.click(); assert.match(await help.innerText(), /TikTok/); assert.match(await help.innerText(), /YouTube/);
      assert.equal((await help.boundingBox()).height, reserved.height);
      await input.fill('https://youtu.be/aqz-KE-bpKQ'); await page.keyboard.press('Enter'); assert.match(await help.innerText(), /YouTube/);
      await paste.click(); assert.equal(await input.inputValue(), fixture); assert.equal(await help.getAttribute('data-state'), 'recognized'); assert.equal((await help.boundingBox()).height, reserved.height);
      assert.deepEqual(submissions, [], 'validation/paste never starts an extraction or challenge');
      results.push({ path, viewport, control, input: inputBox, primary: buttonBox, h1Lines: lines, placeholderContrast: contrast(colors.placeholder, colors.background), statusHeight: reserved.height, keyboard: 'Tab input/Paste/Download; Enter submits; focus visible', validations: 'empty/invalid/YouTube/recognized; fixed message height; no API request' });
    }
    // All eight homes and widths around both responsive breakpoints, including 320px.
    for (const path of ['/', '/fr', '/es', '/pt', '/id', '/de', '/it', '/ar']) for (const width of [320, 360, 390, 768, 1024, 1280, 1440]) {
      await visit(path, { width, height: 900 });
      assert.equal(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), true, current + ': overflow');
      if (width >= 1024) {
        assert.ok((await page.locator('.header-inner').boundingBox()).height <= 80, current + ': single header row');
        assert.equal(await page.locator('.header-actions > a').isVisible(), false, current + ': mobile Guides shortcut hidden on desktop');
      }
      if (width <= 390) {
        const count = await page.locator('h1').evaluate(e => {
          const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT), tops = [];
          while (walker.nextNode()) { const r = document.createRange(); r.selectNodeContents(walker.currentNode); for (const b of r.getClientRects()) if (b.width) tops.push(Math.round(b.top)); }
          return new Set(tops).size;
        });
        assert.ok(count <= 3, current + ': localized H1 at most three lines');
      }
      for (const target of await page.locator('header.site-header a, header.site-header summary').all()) {
        if (!await target.isVisible()) continue;
        const r = await target.boundingBox();
        assert.ok(r.width >= 44 && r.height >= 44, current + ': header touch target ' + JSON.stringify(r));
      }

    }
    const reduced = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
    const noMotion = await reduced.newPage(); await noMotion.goto(base + '/fr', { waitUntil: 'load' });
    assert.equal(await noMotion.locator('.fetch-surface').evaluate(e => e.getAnimations().length), 0, 'reduced motion disables the single field lift');
    await reduced.close();
    await page.goto(base + '/about', { waitUntil: 'load' });
    assert.equal(await page.locator('body').getAttribute('data-hero-theme'), null);
    assert.equal(await page.locator('.site-header').evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(238, 241, 248)', 'other pages keep the light header');
    success = true;
    console.log('HOME UI PASS: 25 above-fold cases; 56 overflow/header cases in 8 languages; dimensions, contrast, keyboard, paste, validation and reduced motion.');
  } catch (error) {
    throw new Error(`${current}: ${error.message}`, { cause: error });
  } finally {
    await writeFile(`${evidence}/home-ui.json`, JSON.stringify({ success, base, current, testedAt: new Date().toISOString(), results }, null, 2) + '\n');
  }
});
