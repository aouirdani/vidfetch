/** Manual private VPS recipe. Requires the isolated media-fixture worker on
 * 18888. Uses a private test CA, real engines and a mocked challenge verifier;
 * never evidence of public HTTPS or production Turnstile readiness. */
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { createServer as httpsServer, request as httpsRequest } from "node:https";
import { once } from "node:events";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createGateway } from "../gateway/server";
import { GatewayLedger } from "../gateway/ledger";
import { createAccessIssuer } from "../../src/server/download-access";
import { SecureDownloadClient } from "../../src/lib/secure-client";

async function main() {
  if (process.env.VIDFETCH_PHASE8_FIXTURE !== "1") throw Error("Manual fixture only");
  const directory = resolve(process.argv[2]), origin = "https://dl.vidfetch.app", site = "https://vidfetch.app";
  const secret = randomBytes(32), cert = await readFile(resolve(directory, "cert.pem"));
  const gateway = createGateway({ origin, sites: [site], key: secret, backend: "http://127.0.0.1:18888",
    ledger: new GatewayLedger(resolve(directory, "quota.sqlite")), requireIsolation: true, isolationProfile: "vidfetch-uid-nft-v1",
    queue: { maxWaiting: 2, waitMs: 180000, estimateMs: 90000 }, bytesPerSecond: 512 * 1024 });
  const edge = httpsServer({ key: await readFile(resolve(directory, "key.pem")), cert });
  const unused = createServer(); // Reserve/check the fixed gateway port without touching any running service.
  unused.listen(18889, "127.0.0.1"); await once(unused, "listening"); await new Promise<void>(r => unused.close(() => r()));
  gateway.server.listen(18889, "127.0.0.1"); await once(gateway.server, "listening");
  edge.on("request", (req, res) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    const proxy = httpRequest(`http://127.0.0.1:18889${req.url}`, { method: req.method, headers: {
      ...req.headers, Host: "dl.vidfetch.app", "X-Forwarded-Proto": "https", "X-Forwarded-For": "127.0.0.1",
    } }, upstream => { res.writeHead(upstream.statusCode ?? 502, upstream.headers); upstream.pipe(res); });
    proxy.on("error", () => res.destroy()); res.on("close", () => { if (!res.writableFinished) proxy.destroy(); }); req.pipe(proxy);
  });
  edge.listen(18443, "127.0.0.1"); await once(edge, "listening");
  const transport = (async (input, init = {}) => new Promise<Response>((accept, reject) => {
    const req = httpsRequest(String(input), { port: 18443, hostname: "127.0.0.1",
      ca: cert, servername: "dl.vidfetch.app", method: init.method ?? "GET", signal: init.signal ?? undefined,
      headers: Object.fromEntries(new Headers(init.headers).entries()) }, res => {
      const headers = new Headers(); for (const [k, v] of Object.entries(res.headers)) if (v) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
      accept(new Response([204, 304].includes(res.statusCode!) ? null : Readable.toWeb(res) as unknown as BodyInit, { status: res.statusCode, headers }));
    }); req.on("error", reject); req.end(typeof init.body === "string" ? init.body : undefined);
  })) as typeof fetch;
  const issuer = createAccessIssuer({ key: secret, siteOrigin: site, gatewayOrigin: origin, verifyChallenge: async token => token === "authorized-fixture" });
  let cookie = "";
  const client = new SecureDownloadClient(origin, (async (_url, init) => {
    const response = await issuer(new Request(site + "/api/download-access", { ...init, headers: { Origin: site, Cookie: cookie } }));
    if (response.ok) cookie = response.headers.get("set-cookie")!.split(";")[0]; return response;
  }) as typeof fetch, transport);
  const post = (format = "18", type = "video") => client.request("/api/download", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ", format_id: format, type }) });
  const attachment = async (ready: { token: string; downloadUrl: string }) => {
    const grant = await client.grant(), body = JSON.stringify({ ticket: ready.token });
    const access = await transport(origin + "/auth/transfer", { method: "POST", body, headers: {
      Authorization: `Bearer ${grant}`, "X-VidFetch-Proof": await client.proof("POST", "/auth/transfer", body, grant), "Content-Type": "application/json",
    } });
    assert.equal(access.status, 200); return { Cookie: access.headers.get("set-cookie")!.split(";")[0], "Sec-Fetch-Site": "same-origin" };
  };
  const terminal = async (token: string, wanted: string) => {
    for (let i = 0; i < 60; i++) {
      const response = await client.request(`/api/download?status=${token}`), status = await response.json();
      if (status.status === wanted) return status; await delay(100);
    }
    throw Error("Expected terminal state was not observed");
  };
  const results: unknown[] = [];
  try {
    assert.equal((await transport(origin + "/api/health")).status, 401);
    assert.equal((await transport(origin + "/api/download", { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" } })).status, 403);
    const cors = await transport(origin + "/api/download", { method: "OPTIONS", headers: { Origin: site, "Access-Control-Request-Method": "POST" } });
    assert.equal(cors.status, 204); assert.equal(cors.headers.get("access-control-allow-origin"), site);
    await client.authorize("authorized-fixture");
    assert.equal((await client.request("/api/health")).status, 200);
    const info = await client.request("/api/fetch-info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ" }) });
    assert.equal(info.status, 200); const mediaInfo = (await info.json()).info; const formats = mediaInfo.formats;
    assert(formats.some((f: { id: string }) => f.id === "18")); assert(mediaInfo.audioFormats.some((f: { id: string }) => f.id === "mp3"));
    const cases = [["18", "video", "mp4"], ["mp3", "audio", "mp3"]] as const;
    for (const [format, type, ext] of cases.filter(item => process.env.VIDFETCH_PHASE8_AUDIO_FIXTURE !== "1" || item[1] === "audio")) {
      const started = Date.now(), prepared = await post(format, type); assert.equal(prepared.status, 201);
      const ready = await prepared.json(); assert.equal((await post()).status, 429);
      assert.equal((await transport(origin + ready.downloadUrl)).status, 404);
      const headers = await attachment(ready), response = await transport(origin + ready.downloadUrl, { headers });
      assert.equal(response.status, 200); assert.match(response.headers.get("content-disposition") ?? "", /^attachment;/);
      const file = resolve(directory, `received.${ext}`);
      await pipeline(Readable.fromWeb(response.body! as import("node:stream/web").ReadableStream), createWriteStream(file, { flags: "wx" }));
      const status = await terminal(ready.token, "completed"), bytes = (await stat(file)).size;
      assert.equal(status.bytes, bytes); assert.equal((await transport(origin + ready.downloadUrl, { headers })).status, 404);
      const probe = spawnSync("/usr/bin/ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name:format=duration,size", "-of", "json", file], { encoding: "utf8" });
      assert.equal(probe.status, 0); const properties = JSON.parse(probe.stdout);
      assert(properties.streams.some((s: { codec_type: string }) => s.codec_type === "audio"));
      assert.equal(spawnSync("/usr/bin/ffmpeg", ["-v", "error", "-i", file, "-f", "null", "-"], { stdio: "ignore" }).status, 0);
      const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk);
      results.push({ type, bytes, elapsedMs: Date.now() - started, status: status.status, sha256: hash.digest("hex"), probe: properties });
      console.log(`PASS ${type}: complete, decoded, counted, single-use`);
    }
    const disconnected = await post(); assert.equal(disconnected.status, 201); const ready = await disconnected.json();
    const response = await transport(origin + ready.downloadUrl, { headers: await attachment(ready) });
    const reader = response.body!.getReader(); assert((await reader.read()).value?.length); await reader.cancel();
    await terminal(ready.token, "aborted"); await delay(1000); results.push({ disconnect: "aborted" });
    const expiring = await post(); assert.equal(expiring.status, 201); const expires = await expiring.json();
    await delay(62000); await terminal(expires.token, "expired");
    assert.equal((await transport(origin + expires.downloadUrl)).status, 404);
    results.push({ expiry: "expired after default 55s ticket / 60s worker window", concurrency: "429 for a second operation", cors: "exact origin only", unauthenticated: "denied" });
    await writeFile(resolve(directory, "results.json"), JSON.stringify({ privateTLS: true, publicInternetTest: false,
      challenge: "mocked", metadata: "authorized Blender BBB trailer fixture; not a platform extraction test", source: process.env.VIDFETCH_PHASE8_AUDIO_FIXTURE === "1" ? "https://download.blender.org/peach/trailer/trailer_400p.ogg" : "https://media.w3.org/2010/05/bunny/trailer.mp4", engines: "real yt-dlp and ffmpeg, UID nft active", results }, null, 2) + "\n", { flag: "wx" });
  } finally {
    await gateway.shutdown(); edge.closeAllConnections(); await new Promise<void>(r => edge.close(() => r()));
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Fixture failed"); process.exitCode = 1; });
