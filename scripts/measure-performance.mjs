import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";

/**
 * Field-style measurement with a real browser: paint timings, layout shift,
 * long tasks and transferred bytes. Values vary per run; treat them as
 * directional evidence rather than Lighthouse scores.
 */
const base = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const label = process.env.PERF_LABEL || "run";
const routes = (process.env.PERF_ROUTES || "/,/legal").split(",");
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const report = [];

for (const route of routes) {
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const page = await context.newPage();
  const bytes = { total: 0, script: 0, stylesheet: 0, document: 0, image: 0, font: 0 };
  page.on("response", async (response) => {
    try {
      const type = response.request().resourceType();
      const length = Number(response.headers()["content-length"] ?? 0) || (await response.body().catch(() => Buffer.alloc(0))).length;
      bytes.total += length;
      if (type in bytes) bytes[type] += length;
    } catch { /* redirects and aborted requests carry no body */ }
  });
  const client = await context.newCDPSession(page);
  // Mid-tier mobile emulation keeps the comparison honest for slower devices.
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", {
    offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
  });
  await page.addInitScript(() => {
    window.__perf = { lcp: 0, cls: 0, longTasks: 0, longTaskTime: 0 };
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__perf.lcp = entry.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__perf.cls += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) { window.__perf.longTasks++; window.__perf.longTaskTime += entry.duration; }
    }).observe({ type: "longtask", buffered: true });
  });

  const started = Date.now();
  await page.goto(`${base}${route}`, { waitUntil: "load", timeout: 120000 });
  await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const paint = performance.getEntriesByName("first-contentful-paint")[0];
    return {
      ttfb: Math.round(navigation?.responseStart ?? 0),
      domContentLoaded: Math.round(navigation?.domContentLoadedEventEnd ?? 0),
      load: Math.round(navigation?.loadEventEnd ?? 0),
      fcp: Math.round(paint?.startTime ?? 0),
      lcp: Math.round(window.__perf.lcp),
      cls: Number(window.__perf.cls.toFixed(4)),
      longTasks: window.__perf.longTasks,
      longTaskTime: Math.round(window.__perf.longTaskTime),
      domNodes: document.getElementsByTagName("*").length,
    };
  });
  const seo = await page.evaluate(() => ({
    title: document.title,
    titleLength: document.title.length,
    description: document.querySelector('meta[name="description"]')?.getAttribute("content")?.length ?? 0,
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
    h1: [...document.querySelectorAll("h1")].map((node) => node.textContent?.trim() ?? ""),
    h2: document.querySelectorAll("h2").length,
    jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap((node) => {
      try {
        const parsed = JSON.parse(node.textContent ?? "{}");
        return (Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed]).map((item) => item["@type"]);
      } catch { return ["invalid"]; }
    }),
    imagesWithoutAlt: [...document.querySelectorAll("img")].filter((img) => !img.getAttribute("alt")).length,
    imagesWithoutDimensions: [...document.querySelectorAll("img")].filter((img) => !img.width || !img.height).length,
    internalLinks: [...document.querySelectorAll('a[href^="/"]')].length,
    openGraphImage: document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null,
  }));
  report.push({ route, elapsedMs: Date.now() - started, ...metrics, kilobytes: Object.fromEntries(Object.entries(bytes).map(([key, value]) => [key, Math.round(value / 1024)])), seo });
  await context.close();
}

await browser.close();
await writeFile(`/tmp/vidfetch-perf-${label}.json`, JSON.stringify(report, null, 2));
for (const entry of report) {
  console.log(`\n${entry.route}  (${label})`);
  console.log(`  TTFB ${entry.ttfb}ms · FCP ${entry.fcp}ms · LCP ${entry.lcp}ms · CLS ${entry.cls} · load ${entry.load}ms`);
  console.log(`  Long tasks ${entry.longTasks} (${entry.longTaskTime}ms) · DOM nodes ${entry.domNodes}`);
  console.log(`  Transfer: total ${entry.kilobytes.total}KB · JS ${entry.kilobytes.script}KB · CSS ${entry.kilobytes.stylesheet}KB · HTML ${entry.kilobytes.document}KB · fonts ${entry.kilobytes.font}KB`);
  console.log(`  SEO: title ${entry.seo.titleLength} chars · description ${entry.seo.description} chars · canonical ${entry.seo.canonical ?? "missing"} · H1 ${entry.seo.h1.length} · H2 ${entry.seo.h2} · JSON-LD [${entry.seo.jsonLd.join(", ") || "none"}]`);
}
