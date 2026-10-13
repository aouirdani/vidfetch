// Run after the default frontend build. Contacts loopback only.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

await mkdir("backend/artifacts", { recursive: true });
const directory = await mkdtemp("backend/artifacts/vercel-http-");
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
const environment = { ...process.env, NODE_ENV: "production", YTDLP_PATH: "/nonexistent-vidfetch-test-yt-dlp", FFMPEG_PATH: "/nonexistent-vidfetch-test-ffmpeg" };
for (const key of ["DATABASE_URL", "VIDFETCH_TARGET", "VERCEL", "VERCEL_ENV"]) delete environment[key];
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: environment,
  detached: true, stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", chunk => { log += chunk; });
child.stderr.on("data", chunk => { log += chunk; });
const exited = new Promise(resolve => child.once("exit", (code, signal) => resolve({ code, signal })));
const checks = [];
const request = (path, init) => fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(5000) });
function pass(name) { checks.push(name); console.log(`PASS ${name}`); }

async function traceFiles(path) {
  const files = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await traceFiles(file));
    else if (entry.name.endsWith(".nft.json")) files.push(file);
  }
  return files;
}

try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error("Next.js exited before becoming ready");
    try { ready = (await request("/api/health")).status === 200; } catch { /* startup */ }
    if (ready) break;
    await delay(250);
  }
  assert.ok(ready, "Next.js must start without DATABASE_URL or media engines");
  const health = await request("/api/health");
  const payload = await health.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.downloads.available, false);
  assert.deepEqual(payload.engine, { ytDlp: null, ffmpeg: false });
  assert.equal(health.headers.get("cache-control"), "no-store");
  pass("health 200: frontend available, downloads unavailable, no database or engines");

  const cases = [
    ["/api/fetch-info", { method: "POST", body: JSON.stringify({ url: "https://youtu.be/aqz-KE-bpKQ" }) }],
    ["/api/fetch-info", { method: "POST", body: "{" }],
    ["/api/fetch-info", { method: "POST", body: "x".repeat(9000) }],
    ["/api/download", { method: "POST", body: JSON.stringify({ url: "http://192.168.1.112/", type: "invalid" }) }],
    ["/api/download?ticket=test-ticket", {}],
    ["/api/download?status=test-status", {}],
    ["/api/download?url=https://youtu.be/aqz-KE-bpKQ", {}],
    ["/api/download-access", { method: "POST", body: "{}" }],
  ];
  for (const [path, init] of cases) {
    const response = await request(path, init);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).code, "BACKEND_UNAVAILABLE");
  }
  pass("eight extraction/download/access requests return explicit JSON 503 before input processing");
  const concurrent = await Promise.all(Array.from({ length: 8 }, () => request("/api/download", { method: "POST", body: "{}" })));
  assert.ok(concurrent.every(response => response.status === 503));
  await Promise.all(concurrent.map(response => response.body?.cancel()));
  pass("eight concurrent requests remain unavailable without engine work");
  for (const [path, method] of [["/api/health", "POST"], ["/api/fetch-info", "GET"], ["/api/download", "DELETE"]]) {
    assert.equal((await request(path, { method })).status, 405);
  }
  assert.equal((await request("/api/health", { method: "HEAD" })).status, 200);
  pass("HTTP methods: three 405 responses and automatic HEAD 200");

  const routes = ["/", "/youtube-video-downloader", "/tiktok-video-downloader", "/instagram-reels-downloader", "/twitter-video-downloader", "/legal"];
  for (const path of routes) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    const html = await response.text();
    assert.match(html, /rel="canonical"/);
    assert.match(html, /vidfetch\.app/);
    assert.doesNotMatch(html, /Engine unavailable|connected to the backend/i);
    assert.equal((html.match(/<h1(?:\s|>)/g) ?? []).length, 1);
  }
  for (const path of ["/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/icon.svg", "/og-image-v2.jpg"]) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    await response.body?.cancel();
  }
  assert.equal((await request("/this-page-does-not-exist")).status, 404);
  assert.equal((await request("/api/stats")).status, 404);
  pass("six SEO pages, five public assets, clean initial UI, 404 and no stats exposure");

  const traces = await traceFiles(".next/server/app/api");
  assert.equal(traces.length, 4);
  for (const path of traces) {
    const trace = JSON.parse(await readFile(path, "utf8"));
    assert.ok(!trace.files.some(file => /(?:ffmpeg|ffprobe|yt-dlp|src\/db|src\/lib\/engine|node_modules\/pg\/|\.media-bin)/.test(file)), `Engine/database dependency in ${path}`);
  }
  pass("all four API dependency traces exclude video engines and PostgreSQL");

  if (process.argv.includes("--browser")) {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : {}) });
    try {
      const page = await browser.newPage();
      const errors = [], apiRequests = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", req => { if (new URL(req.url()).pathname.startsWith("/api/")) apiRequests.push(req.url()); });
      await page.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await page.goto(base, { waitUntil: "networkidle" });
      assert.equal(await page.getByText(/Video extraction and downloads are temporarily unavailable/).count(), 0);
      assert.equal(await page.getByRole("button", { name: "Extract", exact: true }).isDisabled(), true);
      assert.equal(await page.getByRole("button", { name: "Paste", exact: true }).isDisabled(), false);
      assert.equal(await page.getByText("Engine unavailable", { exact: true }).count(), 0);
      const shared = "https://youtu.be/aqz-KE-bpKQ";
      await page.goto(`${base}/?url=${encodeURIComponent(shared)}`, { waitUntil: "networkidle" });
      await page.waitForFunction(expected => document.querySelector('input[aria-label="Video link"]')?.value === expected, shared, { timeout: 10000 });
      assert.equal(await page.getByRole("textbox", { name: "Video link", exact: true }).inputValue(), shared);
      assert.equal(new URL(page.url()).search, "");
      assert.equal(await page.getByRole("button", { name: "Extract", exact: true }).isDisabled(), false);
      await page.getByRole("button", { name: "Extract", exact: true }).click();
      await page.getByRole("alert").getByText(/temporarily unavailable/).waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await page.screenshot({ path: join(directory, "unavailable-mobile.png"), fullPage: true });
      await page.goto(`${base}/tiktok-video-downloader`, { waitUntil: "networkidle" });
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), "https://vidfetch.app/tiktok-video-downloader");
      assert.equal(await page.getByRole("button", { name: "Extract", exact: true }).isDisabled(), true);
      assert.deepEqual(apiRequests, [], "The unavailable UI must not contact an API origin");
      assert.deepEqual(errors, []);
      pass("real browser: clean initial UI, failure on attempt, share link, mobile layout, canonical, no media requests or runtime errors");
    } finally { await browser.close(); }
  }
} finally {
  if (child.exitCode === null) {
    process.kill(-child.pid, "SIGTERM");
    const ended = await Promise.race([exited, delay(10000).then(() => null)]);
    if (!ended) { process.kill(-child.pid, "SIGKILL"); await exited; }
  }
  await writeFile(join(directory, "next.log"), log, { flag: "wx" });
  await writeFile(join(directory, "results.json"), JSON.stringify({ base, checks, server: await exited }, null, 2) + "\n", { flag: "wx" });
  console.log(`Evidence: ${directory}`);
}
await assert.rejects(() => request("/api/health"), "Test server must be stopped");
console.log("PASS temporary Next.js server stopped and test port released");
