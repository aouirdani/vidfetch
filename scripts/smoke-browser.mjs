import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import ffprobe from "ffprobe-static";

const base = process.env.BASE_URL || "http://localhost:3000";
const directory = await mkdtemp(join(tmpdir(), "vidfetch-browser-"));
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const errors = [];
try {
  await mkdir("test-results", { recursive: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1024 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base, { waitUntil: "networkidle" });
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.match(await page.locator("h1").innerText(), /Download your videos/);
  await page.screenshot({ path: "test-results/home-desktop.png", fullPage: true });
  for (const platform of ["Instagram", "TikTok"]) {
    // Example chips live inside the extractor form and are labelled by platform name.
    await page.locator("form").getByRole("button", { name: platform, exact: true }).click();
    const card = page.getByRole("region", { name: "Extracted video" });
    await card.waitFor({ state: "visible", timeout: 100000 });
    const waiting = page.waitForEvent("download", { timeout: 120000 });
    await card.getByRole("button", { name: /^Download / }).click();
    const download = await waiting;
    const filename = join(directory, `${platform}.mp4`);
    await download.saveAs(filename);
    assert.equal(await download.failure(), null);
    assert.match(download.suggestedFilename(), /^VidFetch_.+\.mp4$/);
    assert.ok((await stat(filename)).size > 1000);
    const details = JSON.parse(execFileSync(ffprobe.path, ["-v", "error", "-show_entries", "stream=codec_type", "-of", "json", filename], { encoding: "utf8" }));
    assert.ok(details.streams.some((s) => s.codec_type === "video"));
    await card.getByText(/Saved .* to your device/).waitFor({ timeout: 20000 });
    await page.screenshot({ path: `test-results/${platform.toLowerCase()}-download.png`, fullPage: true });
    console.log(`PASS browser ${platform}: native file download + completed status + playable video`);
    await page.getByRole("button", { name: "Extract another video", exact: true }).click();
  }
  await page.getByRole("textbox", { name: "Video link", exact: true }).fill("https://instagram.com/example/");
  assert.equal(await page.getByRole("button", { name: "Extract", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "Clear link" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/home-mobile.png", fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "The mobile layout should not scroll horizontally");
  const copy = await page.locator("body").innerText();
  assert.doesNotMatch(copy, /Téléchargez|Extraire|Téléchargements|Aucune donnée|Tous droits réservés|Fonctionnalités/);
  // The recent-transfers feed was removed: no download titles may appear publicly.
  assert.doesNotMatch(copy, /Recent transfers/i);
  const statsPayload = await page.evaluate(async () => await (await fetch("/api/stats")).json());
  assert.equal("recent" in statsPayload, false, "the stats API must not expose individual transfers");
  await page.goto(`${base}/legal`, { waitUntil: "networkidle" });
  assert.match(await page.locator("h1").innerText(), /Terms, privacy & legal information/);
  assert.equal(await page.locator("html").getAttribute("lang"), "en");

  // Platform landing pages must be indexable and usable on a phone viewport.
  for (const slug of ["tiktok-video-downloader", "instagram-reels-downloader"]) {
    await page.goto(`${base}/${slug}`, { waitUntil: "networkidle" });
    assert.equal(await page.locator("h1").count(), 1);
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), `https://vidfetch.io/${slug}`);
    assert.ok(await page.locator('script[type="application/ld+json"]').count() >= 1);
    assert.ok(await page.getByRole("navigation", { name: "Breadcrumb" }).isVisible());
    assert.ok(await page.getByRole("textbox", { name: "Video link", exact: true }).isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${slug} must not scroll horizontally`);
  }
  await page.goto(`${base}/this-page-does-not-exist`, { waitUntil: "networkidle" });
  assert.match(await page.locator("h1").innerText(), /does not exist/);
  assert.deepEqual(errors, [], "No browser runtime errors");
  console.log("PASS English desktop/mobile interface, legal page, URL validation, and no runtime errors");
} finally {
  await browser.close();
  await rm(directory, { recursive: true, force: true });
}
