// Real browsers against the real gateway, helper, access issuer and browser client: the site and the gateway on two
// origins of one site (as vidfetch.app and dl.vidfetch.app), behind an HTTPS edge that plays Caddy's part. Only the
// engine (a fixture file) and Turnstile (a fixed fixture challenge) are simulated. Proves, per browser engine:
// no tab or popup, MP4 and MP3 saved byte for byte through a native attachment download, the gateway's single-use
// cookie and same-origin fetch-metadata checks met, used and expired tickets refused, cancellation, and the helper
// refusing to be framed by any other origin. No token, ticket, cookie or key is printed.
import { createServer, request as httpRequest, type IncomingMessage } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { connect } from "node:net";
import { once } from "node:events";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "esbuild";
import { chromium, firefox, webkit, type BrowserType, type Download, type Page } from "playwright";
import { createGateway } from "./server";
import { GatewayLedger } from "./ledger";
import { createAccessIssuer } from "../../src/server/download-access";

type Edge = { method: string; host: string; path: string; status: number; site?: string; dest?: string; cookie: boolean };
const SIZE = 3 * 1024 * 1024, TICKET_MS = 3000;
// IANA-reserved names with real public suffixes: browsers judge site/cookie boundaries by registrable domain, so a fake
// TLD such as .test would make some engines treat app. and dl. as different sites. Every request goes through the
// local CONNECT proxy below; nothing leaves this machine.
const DOMAIN = process.env.BROWSER_E2E_DOMAIN ?? "example.com", OTHER_SITE = "other.example.org";
const payload = (kind: string) => Buffer.from(Array.from({ length: SIZE }, (_, i) => (i * 31 + (kind === "audio" ? 7 : 3)) & 255));
const sha = (value: Buffer) => createHash("sha256").update(value).digest("hex");

async function certificate() {
  const directory = await mkdtemp(resolve("backend/artifacts/browser-download-"));
  const key = resolve(directory, "key.pem"), cert = resolve(directory, "cert.pem");
  const made = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", `/CN=${DOMAIN}`,
    "-addext", `subjectAltName=DNS:app.${DOMAIN},DNS:dl.${DOMAIN},DNS:evil.${DOMAIN},DNS:${OTHER_SITE}`], { stdio: "ignore" });
  if (made.status !== 0) throw new Error("openssl failed");
  return { directory, key: await readFile(key), cert: await readFile(cert) };
}

async function stack(clientJs: string) {
  const tls = await certificate(), secret = randomBytes(32), edgeLog: Edge[] = [];
  const engineJobs = new Map<string, { kind: string; bytes: number; status: string }>();
  const engine = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    res.setHeader("Content-Type", "application/json");
    if (url.pathname === "/api/health") { res.end(JSON.stringify({ ok: true, engine: { ytDlp: "fixture", ffmpeg: true, isolationProfile: "vidfetch-uid-nft-v1" } })); return; }
    if (req.method === "POST" && url.pathname === "/api/download") {
      const chunks: Buffer[] = []; req.on("data", c => chunks.push(c)); req.on("end", () => {
        const kind = JSON.parse(Buffer.concat(chunks).toString()).type === "audio" ? "audio" : "video", token = randomUUID();
        engineJobs.set(token, { kind, bytes: 0, status: "ready" });
        res.writeHead(201); res.end(JSON.stringify({ ok: true, token, filename: kind === "audio" ? "fixture.mp3" : "fixture.mp4", downloadUrl: "/api/download?ticket=internal" }));
      }); return;
    }
    const status = url.searchParams.get("status"), ticket = url.searchParams.get("ticket");
    if (status) { const job = engineJobs.get(status); res.end(JSON.stringify({ ok: true, status: job?.status ?? "expired", bytes: job?.bytes ?? 0, error: null, updated: Date.now() })); return; }
    const job = ticket ? engineJobs.get(ticket) : undefined;
    if (!job) { res.writeHead(404); res.end('{"ok":false,"code":"EXPIRED"}'); return; }
    const body = payload(job.kind); job.status = "streaming";
    res.writeHead(200, { "Content-Type": job.kind === "audio" ? "audio/mpeg" : "video/mp4", "Content-Length": String(body.length),
      "Content-Disposition": `attachment; filename="VidFetch-fixture.${job.kind === "audio" ? "mp3" : "mp4"}"` });
    let offset = 0;
    const timer = setInterval(() => { const next = body.subarray(offset, offset + 65536); offset += next.length; job.bytes = offset; res.write(next); if (offset >= body.length) { clearInterval(timer); job.status = "completed"; res.end(); } }, 5);
    res.on("close", () => { clearInterval(timer); if (job.status !== "completed") job.status = "aborted"; });
  });
  engine.listen(0, "127.0.0.1"); await once(engine, "listening");
  const enginePort = (engine.address() as { port: number }).port;

  const edge = createHttpsServer({ key: tls.key, cert: tls.cert }); edge.listen(0, "127.0.0.1"); await once(edge, "listening");
  const port = (edge.address() as { port: number }).port;
  const site = `https://app.${DOMAIN}:${port}`, gatewayOrigin = `https://dl.${DOMAIN}:${port}`;
  const gateway = createGateway({ origin: gatewayOrigin, sites: [site], key: secret, backend: `http://127.0.0.1:${enginePort}`, proxy: "reverse-proxy",
    ledger: new GatewayLedger(resolve(tls.directory, "quota.sqlite")), isolationProfile: "vidfetch-uid-nft-v1", requireIsolation: true, ticketMs: TICKET_MS,
    retentionMs: 60000, bytesPerSecond: 2 * 1024 * 1024 });
  gateway.server.listen(0, "127.0.0.1"); await once(gateway.server, "listening");
  const gatewayPort = (gateway.server.address() as { port: number }).port;
  const issuer = createAccessIssuer({ key: secret, siteOrigin: site, gatewayOrigin, verifyChallenge: async token => token === "fixture-turnstile" });
  const page = (frameTarget: string) => `<!doctype html><meta charset="utf-8"><title>site</title><script src="/client.js"></script>
<button id="go">download</button><script>
const client = new VidFetchClient.SecureDownloadClient(${JSON.stringify(gatewayOrigin)});
let authorized; const auth = () => authorized ??= client.authorize("fixture-turnstile");
window.run = async ({ type, wait = 0, startAfter = 0, reuse, closeAfterStart, cancelBeforeStart }) => {
  await auth();
  const channel = client.openTransfer("fr"); window.channel = channel;
  if (cancelBeforeStart) { setTimeout(() => channel.close(), 50); }
  await new Promise(r => setTimeout(r, wait));
  let token = reuse;
  if (!token) {
    const reply = await (await client.request("/api/download", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://www.tiktok.com/@scout2015/video/6718335390845095173", format_id: "fixture", type }) })).json();
    if (!reply.ok) throw new Error("prepare: " + reply.code);
    token = reply.token; window.lastToken = token;
  }
  await new Promise(r => setTimeout(r, startAfter));
  await channel.start(token);
  if (closeAfterStart != null) setTimeout(() => channel.close(), closeAfterStart);
  return { frames: document.querySelectorAll("iframe").length, href: location.href };
};
window.frameTest = () => new Promise(done => { const f = document.createElement("iframe"); f.src = ${JSON.stringify(frameTarget)};
  f.onload = () => { let readable = "loaded"; try { readable = f.contentDocument ? "opaque-or-blank" : "loaded"; } catch { readable = "cross-origin"; } done(readable); };
  document.body.append(f); setTimeout(() => done("timeout"), 4000); });
</script>`;
  edge.on("request", (req: IncomingMessage, res) => {
    const host = req.headers.host ?? "", url = new URL(req.url ?? "/", `https://${host}`);
    const entry: Edge = { method: req.method ?? "", host: host.split(":")[0], path: url.pathname, status: 0, site: req.headers["sec-fetch-site"] as string | undefined,
      dest: req.headers["sec-fetch-dest"] as string | undefined, cookie: /__Secure-vidfetch-transfer=./.test(req.headers.cookie ?? "") };
    edgeLog.push(entry); res.on("finish", () => { entry.status = res.statusCode; });
    if (host === `dl.${DOMAIN}:${port}`) {
      const proxied = httpRequest(`http://127.0.0.1:${gatewayPort}${req.url}`, { method: req.method,
        headers: { ...req.headers, host: `dl.${DOMAIN}:${port}`, "x-forwarded-proto": "https", "x-forwarded-for": "198.51.100.20" } },
      upstream => { res.writeHead(upstream.statusCode ?? 502, upstream.headers); upstream.pipe(res); });
      proxied.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); }); res.on("close", () => { if (!res.writableFinished) proxied.destroy(); }); req.pipe(proxied); return;
    }
    if (url.pathname === "/client.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(clientJs); return; }
    if (url.pathname === "/api/download-access" && req.method === "POST") {
      const chunks: Buffer[] = []; req.on("data", c => chunks.push(c)); req.on("end", async () => {
        const reply = await issuer(new Request(site + "/api/download-access", { method: "POST", headers: req.headers as Record<string, string>, body: Buffer.concat(chunks) }));
        res.writeHead(reply.status, Object.fromEntries(reply.headers)); res.end(Buffer.from(await reply.arrayBuffer()));
      }); return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(page(`${gatewayOrigin}/download-helper?lang=fr`));
  });
  const proxy = createServer(); proxy.on("connect", (req, client, head) => {
    const upstream = connect(port, "127.0.0.1", () => { client.write("HTTP/1.1 200 Connection Established\r\n\r\n"); upstream.write(head); upstream.pipe(client); client.pipe(upstream); });
    upstream.on("error", () => client.destroy()); client.on("error", () => upstream.destroy());
  });
  proxy.listen(0, "127.0.0.1"); await once(proxy, "listening");
  const proxyPort = (proxy.address() as { port: number }).port;
  return { site, port, gatewayOrigin, proxyPort, edgeLog, engineJobs, close: async () => {
    await gateway.shutdown(); for (const s of [edge, engine, proxy]) { s.closeAllConnections?.(); await new Promise<void>(r => s.close(() => r())); }
  } };
}

type Result = { name: string; pass: boolean; detail: string };
const timed = <T>(work: Promise<T>, ms: number, label: string) => Promise.race([work, delay(ms).then((): T => { throw new Error(`${label}: no answer after ${ms} ms`); })]);
async function saved(download: Download) { const path = await download.path(); return path ? readFile(path) : Buffer.alloc(0); }

async function runEngine(name: string, type: BrowserType, clientJs: string): Promise<Result[]> {
  const s = await stack(clientJs), results: Result[] = [];
  const check = (test: string, pass: boolean, detail: string) => { results.push({ name: test, pass, detail }); console.log(`${pass ? "ok  " : "FAIL"} ${name.padEnd(8)} ${test} (${detail})`); };
  const browser = await type.launch({ proxy: { server: `http://127.0.0.1:${s.proxyPort}` } }).catch(async error => { await s.close(); throw error; });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true });
    let pages = 0; context.on("page", () => { pages++; });
    const page: Page = await context.newPage();
    const diagnostics: string[] = []; page.on("console", m => diagnostics.push(`console.${m.type()}: ${m.text().slice(0, 160)}`)); page.on("pageerror", e => diagnostics.push(`pageerror: ${String(e).slice(0, 160)}`));
    process.on("exit", () => { if (process.env.DEBUG_BROWSER) console.log(diagnostics.join("\n")); });
    await page.goto(s.site + "/");
    const startPages = pages;
    for (const kind of ["video", "audio"] as const) {
      const before = s.edgeLog.length;
      const download = page.waitForEvent("download", { timeout: 30000 });
      // Preparation longer than any user-activation window: the download starts well after the click.
      await page.click("#go"); const run = await timed(page.evaluate(k => (window as unknown as { run: (o: object) => Promise<{ frames: number; href: string }> }).run({ type: k, wait: 6000 }), kind), 40000, `${kind} run`);
      const file = await timed(download, 40000, `${kind} download`), bytes = await saved(file);
      const transfer = s.edgeLog.slice(before).find(e => e.host === `dl.${DOMAIN}` && e.path === "/api/download" && e.method === "GET" && e.status === 200);
      const ext = kind === "audio" ? ".mp3" : ".mp4";
      check(`${kind === "audio" ? "MP3" : "MP4"} saved byte for byte, no tab`, sha(bytes) === sha(payload(kind)) && file.suggestedFilename().endsWith(ext) && pages === startPages && run.href === s.site + "/",
        `${bytes.length} bytes, ${file.suggestedFilename()}, extra pages ${pages - startPages}, page stayed on site: ${run.href === s.site + "/"}`);
      check(`${kind === "audio" ? "MP3" : "MP4"} transfer met the gateway checks`, !!transfer && transfer.site === "same-origin" && transfer.cookie,
        `ticket GET: sec-fetch-site=${transfer?.site} dest=${transfer?.dest} single-use cookie=${transfer?.cookie}`);
      await delay(300);
    }
    const reuseBefore = s.edgeLog.length;
    let reused = "accepted";
    try { await timed(page.evaluate(() => (window as unknown as { run: (o: object) => Promise<unknown>; lastToken: string }).run({ reuse: (window as unknown as { lastToken: string }).lastToken })), 30000, "reuse run"); }
    catch (error) { reused = String(error).includes("authorization failed") ? "refused" : String(error).slice(0, 80); }
    const transferReply = s.edgeLog.slice(reuseBefore).find(e => e.path === "/auth/transfer");
    check("used ticket refused", reused === "refused" && transferReply?.status === 404, `start(): ${reused}, /auth/transfer ${transferReply?.status}`);
    let expired = "accepted";
    try { await timed(page.evaluate(ms => (window as unknown as { run: (o: object) => Promise<unknown> }).run({ type: "video", startAfter: ms }), TICKET_MS + 700), 30000, "expired run"); }
    catch (error) { expired = String(error).includes("authorization failed") ? "refused" : String(error).slice(0, 80); }
    check("expired ticket refused", expired === "refused", `start() after ${TICKET_MS + 700} ms (ticket lives ${TICKET_MS} ms): ${expired}`);
    let cancelled = "not cancelled";
    try { await timed(page.evaluate(() => (window as unknown as { run: (o: object) => Promise<unknown> }).run({ type: "video", wait: 400, cancelBeforeStart: true })), 30000, "cancel run"); }
    catch (error) { cancelled = String(error).includes("cancelled") ? "cancelled" : String(error).slice(0, 80); }
    check("cancel before the transfer", cancelled === "cancelled", `start(): ${cancelled}`);
    await delay(TICKET_MS + 1500); // let the abandoned ticket expire and free the single transfer slot
    const midDownload = page.waitForEvent("download", { timeout: 30000 });
    await timed(page.evaluate(() => (window as unknown as { run: (o: object) => Promise<unknown> }).run({ type: "video", closeAfterStart: 400 })), 40000, "mid run");
    const mid = await timed(midDownload, 40000, "mid download"), midBytes = await saved(mid).catch(() => Buffer.alloc(0)), failure = await mid.failure();
    check("frame removed while saving: file still completes", !failure && sha(midBytes) === sha(payload("video")),
      `failure=${failure ?? "none"}, ${midBytes.length} bytes, frames left ${await page.evaluate(() => document.querySelectorAll("iframe").length)}`);
    for (const [label, origin] of [["another origin of the same site", `https://evil.${DOMAIN}:${s.port}`], ["another site", `https://${OTHER_SITE}:${s.port}`]] as const) {
      const outsider = await context.newPage(); await outsider.goto(origin + "/");
      const blocked = new Promise<string>(done => { outsider.on("console", m => { if (/frame-ancestors|Refused to (display|frame)|blocked/i.test(m.text())) done("csp-blocked"); }); setTimeout(() => done("no-console"), 4500); });
      await timed(outsider.evaluate(() => (window as unknown as { frameTest: () => Promise<string> }).frameTest()), 15000, "frame test");
      const helperFrame = outsider.frames().find(f => f.url().includes("/download-helper"));
      let rendered = false; try { rendered = !!helperFrame && (await helperFrame.locator("#message").count()) > 0; } catch { rendered = false; }
      check(`helper refuses to be framed by ${label}`, !rendered, `helper rendered=${rendered}, ${await blocked}`);
      await outsider.close(); pages--;
    }
    check("no tab or popup in the whole run", pages === startPages, `extra pages ${pages - startPages}`);
    await context.close();
  } catch (error) {
    check("run", false, `${String(error).slice(0, 120)} | edge: ${s.edgeLog.slice(-10).map(e => `${e.method} ${e.host} ${e.path} ${e.status} site=${e.site} dest=${e.dest} cookie=${e.cookie}`).join("; ")}`);
  } finally { await timed(browser.close(), 15000, "browser close").catch(() => {}); await timed(s.close(), 15000, "servers close").catch(() => {}); }
  return results;
}

export async function main() {
  // An early exit (a promise that can never settle) must never look like success.
  process.exitCode = 1;
  const clientJs = process.env.BROWSER_E2E_CLIENT ? await readFile(process.env.BROWSER_E2E_CLIENT, "utf8")
    : (await build({ entryPoints: ["src/lib/secure-client.ts"], bundle: true, format: "iife", globalName: "VidFetchClient", platform: "browser", write: false, target: "es2020" })).outputFiles[0].text;
  const wanted = (process.env.BROWSERS ?? "chromium,firefox,webkit").split(",");
  const engines: Record<string, BrowserType> = { chromium, firefox, webkit };
  let failures = 0;
  for (const name of wanted) {
    console.log(`-- ${name}`);
    const results = await runEngine(name, engines[name], clientJs).catch(error => { console.log(`FAIL ${name.padEnd(8)} run (${String(error).slice(0, 300)})`); return [{ name: "run", pass: false, detail: "" }]; });
    failures += results.filter(r => !r.pass).length;
  }
  console.log(failures ? `FAILURES: ${failures}` : "ALL BROWSER DOWNLOAD CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}
