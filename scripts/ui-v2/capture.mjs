import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const origin = process.env.VIDFETCH_CAPTURE_ORIGIN ?? "http://127.0.0.1:3000";
const output = process.argv[2] ?? "docs/ui-v2/before";
const allSizes = [[390, 844], [768, 1024], [1440, 900]];
const requestedSize = process.env.VIDFETCH_CAPTURE_SIZE;
const sizes = requestedSize ? allSizes.filter(([width]) => width === Number(requestedSize)) : allSizes;
const pages = [
  ["home-en", "/"], ["home-fr", "/fr"], ["home-ar", "/ar"], ["home-id", "/id"],
  ["tiktok", "/tiktok-video-downloader"], ["local-tool", "/video-to-mp3"],
];

const browser = await chromium.launch({ headless: true });
try {
  for (const [width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    for (const [name, path] of pages) {
      await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(350);
      const dir = `${output}/${width}x${height}`;
      await mkdir(dir, { recursive: true });
      await page.screenshot({ path: `${dir}/${name}.png`, animations: "disabled" });
    }
    await page.addInitScript(() => {
      window.turnstile = {
        render(_element, options) { window.setTimeout(() => options.callback("local-ui-fixture"), 0); return "local-ui-fixture"; },
        remove() {}, reset() {},
      };
    });
    await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit", route => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
    await page.route("**/api/download-access", route => route.request().method() === "GET"
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: true, siteKey: "local-fixture", gatewayOrigin: null }) })
      : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, grant: "local-ui-fixture", expiresAt: Date.now() + 3600000 }) }));
    await page.route("**/api/fetch-info", route => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        info: {
          platform: "tiktok", platformVideoId: "7059698374567611694", url: "https://www.tiktok.com/@pokemonlife22/video/7059698374567611694",
          title: "A locally mocked result used only for the interface capture", description: null, uploader: "Fixture creator",
          duration: 33, durationLabel: "00:33", thumbnail: null, webpageUrl: "https://www.tiktok.com/@pokemonlife22/video/7059698374567611694",
          extractor: "fixture", viewCount: null, likeCount: null,
          formats: [],
          videoFormats: [
            { id: "mp4-720", label: "MP4 720p", kind: "video", ext: "mp4", height: 720, width: 1280, fps: 30, vcodec: "h264", acodec: "aac", hasAudio: true, progressive: true, protocol: "https", filesize: 6200000, filesizeLabel: "6 MB", bitrateKbps: 1500, note: null, recommended: true },
            { id: "mp4-540", label: "MP4 540p", kind: "video", ext: "mp4", height: 540, width: 960, fps: 30, vcodec: "h264", acodec: "aac", hasAudio: true, progressive: true, protocol: "https", filesize: 3100000, filesizeLabel: "3 MB", bitrateKbps: 900, note: null, recommended: false },
          ],
          audioFormats: [
            { id: "mp3", label: "MP3", kind: "audio", ext: "mp3", height: null, width: null, fps: null, vcodec: null, acodec: "mp3", hasAudio: true, progressive: true, protocol: "https", filesize: 800000, filesizeLabel: "800 KB", bitrateKbps: 192, note: null, recommended: false },
          ],
        }, engine: { ytDlp: "fixture", ffmpeg: true },
      }),
    }));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
    await page.locator('input[type="url"]').fill("https://www.tiktok.com/@pokemonlife22/video/7059698374567611694");
    await page.waitForTimeout(1200);
    const extractButton = page.locator('form button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('form button[type="submit"]')?.disabled === false);
    await extractButton.click();
    await page.getByRole("heading", { name: /A locally mocked result/ }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(250);
    const dir = `${output}/${width}x${height}`;
    await mkdir(dir, { recursive: true });
    await page.getByRole("heading", { name: /A locally mocked result/ }).evaluate(heading => {
      window.scrollTo(0, window.scrollY + heading.getBoundingClientRect().top - 148);
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${dir}/result.png`, animations: "disabled" });
    await page.close();
  }
} finally {
  await browser.close();
}
