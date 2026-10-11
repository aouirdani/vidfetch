import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { once } from "node:events";
import { resolve } from "node:path";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { createBackend } from "../server";
import { EngineError, isEngineError, dumpJson } from "../../src/lib/engine";
import { isPublicAddress, assertPublicUrl } from "../network";
import { detectPlatform } from "../../src/lib/platforms";

const URL = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
const fake = resolve("backend/tests/fake-ytdlp.cjs");
const raw = (extra = {}) => ({ id: "aqz-KE-bpKQ", title: 'test / "\r\n movie', duration: 2,
  formats: [{ format_id: "18", ext: "mp4", url: "https://example.com/media.mp4", vcodec: "h264", acodec: "aac", protocol: "https" }], ...extra });
async function setup(extra: Parameters<typeof createBackend>[0] = {}) {
  const backend = createBackend({ ...extra, engine: {
    engineStatus: () => ({ ytDlp: "test", ffmpeg: true }), ytDlpBinary: () => fake,
    engineContext: async () => ({ flags: [], cleanup: async () => {} }),
    dumpJson: async () => ({ raw: raw(), ytDlpVersion: "test" }),
    assertPublicUrl: async () => {}, validateMediaDestinations: async () => {}, ...extra.engine,
  } });
  backend.server.listen(0, "127.0.0.1"); await once(backend.server, "listening");
  const address = backend.server.address(); assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const post = (path: string, body: unknown) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const prepare = async () => { const response = await post("/api/download", { url: URL, format_id: "18", type: "video" }); assert.equal(response.status, 201); return await response.json(); };
  const status = async (token: string) => (await fetch(base + `/api/download?status=${token}`)).json();
  return { ...backend, base, post, prepare, status };
}
async function eventually(check: () => Promise<boolean>, duration = 3000) {
  const deadline = Date.now() + duration;
  while (Date.now() < deadline) { if (await check()) return; await delay(20); }
  assert.fail("Condition did not become true");
}
async function* chunks(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  try { while (true) { const result = await reader.read(); if (result.done) return; yield result.value; } }
  finally { reader.releaseLock(); }
}

test("HTTP 400/413/504 structured errors retain status and code", () => {
  for (const status of [400, 413, 504, 429]) assert(isEngineError(Object.assign(new Error("error"), { status, code: "TIMEOUT" })));
  assert(!isEngineError(Object.assign(new Error("bad"), { status: 200, code: "TIMEOUT" })));
  assert(!isEngineError({ status: 400, code: "INVALID_URL" }));
});
test("strict platform allowlist and private/reserved addresses", async () => {
  for (const url of ["http://127.0.0.1/test", "http://[::1]/", "http://2130706433/", "file:///etc/passwd", "https://youtube.com.evil.test/watch?v=aqz-KE-bpKQ", "https://u:p@youtube.com/watch?v=aqz-KE-bpKQ", "https://youtube.com:8787/watch?v=aqz-KE-bpKQ", "https://youtube.com/playlist?list=abc"]) assert(!detectPlatform(url).ok, url);
  for (const address of ["127.0.0.1", "10.0.0.1", "192.168.1.112", "172.16.0.1", "169.254.169.254", "100.64.1.1", "::1", "::ffff:127.0.0.1", "fd00::1", "fe80::1", "2001:db8::1", "224.0.0.1"]) assert(!isPublicAddress(address), address);
  assert(isPublicAddress("8.8.8.8")); assert(isPublicAddress("2606:4700:4700::1111"));
  await assert.rejects(assertPublicUrl("http://127.0.0.1/", new AbortController().signal), { code: "INVALID_URL", status: 400 });
});
test("health, methods, JSON, size, URL/type/format, Host and Origin", async () => {
  const b = await setup();
  try {
    assert.equal((await fetch(b.base + "/api/health")).status, 200);
    for (const [path, method] of [["/api/health", "POST"], ["/api/fetch-info", "GET"], ["/api/download", "PUT"]]) assert.equal((await fetch(b.base + path, { method })).status, 405);
    assert.equal((await fetch(b.base + "/api/fetch-info", { method: "POST", body: "{" })).status, 400);
    assert.equal((await b.post("/api/fetch-info", [])).status, 400);
    assert.equal((await b.post("/api/fetch-info", { url: "http://localhost:8787" })).status, 400);
    assert.equal((await b.post("/api/fetch-info", { data: "x".repeat(10000) })).status, 413);
    assert.equal((await b.post("/api/download", { url: URL, format_id: "18", type: "bad" })).status, 400);
    assert.equal((await b.post("/api/download", { url: URL, format_id: "18;echo BAD", type: "video" })).status, 400);
    const badHost = await new Promise<number>((resolve, reject) => {
      const req = request(b.base + "/api/health", { headers: { Host: "evil.test" } }, res => { res.resume(); resolve(res.statusCode!); });
      req.on("error", reject); req.end();
    });
    assert.equal(badHost, 400);
    assert.equal((await fetch(b.base + "/api/health", { headers: { Origin: "https://evil.test" } })).status, 403);
    assert.equal((await fetch(b.base + "/api/download?status=unknown")).status, 404);
    assert.equal((await fetch(b.base + "/api/download?ticket=unknown")).status, 404);
    assert.equal((await b.post("/api/fetch-info", { url: URL })).status, 200);
  } finally { await b.shutdown(); }
});
test("chunked oversized body responds 413 without resetting the socket", async () => {
  const b = await setup();
  try {
    const response = await new Promise<number>((resolve, reject) => {
      const req = request(b.base + "/api/fetch-info", { method: "POST" }, res => { res.resume(); resolve(res.statusCode!); });
      req.on("error", reject); req.write("x".repeat(5000)); req.end("x".repeat(5000));
    });
    assert.equal(response, 413);
  } finally { await b.shutdown(); }
});
test("a slow unfinished request body returns HTTP 504", async () => {
  const b = await setup({ limits: { bodyMs: 100 } });
  try {
    const response = await new Promise<number>((resolve, reject) => {
      const req = request(b.base + "/api/fetch-info", { method: "POST" }, res => { res.resume(); resolve(res.statusCode!); req.end(); });
      req.on("error", reject); req.write("{");
    });
    assert.equal(response, 504);
  } finally { await b.shutdown(); }
});
test("HTTP preserves decorated engine failures and missing-engine health", async () => {
  for (const code of [400, 413, 504]) {
    const b = await setup({ engine: { dumpJson: async () => { throw Object.assign(new Error("test engine failure"), { status: code, code: "TIMEOUT" }); } } });
    try {
      const response = await b.post("/api/fetch-info", { url: URL }); assert.equal(response.status, code);
      assert.equal((await response.json()).code, "TIMEOUT");
    } finally { await b.shutdown(); }
  }
  const b = await setup({ engine: { engineStatus: () => ({ ytDlp: null, ffmpeg: false }) } });
  try { const response = await fetch(b.base + "/api/health"); assert.equal(response.status, 503); assert.equal((await response.json()).ok, false); }
  finally { await b.shutdown(); }
});
test("stream integrity, bytes, completed, single-use without status corruption", async () => {
  const b = await setup();
  try {
    const ready = await b.prepare();
    assert.equal((await b.status(ready.token)).status, "ready");
    const response = await fetch(b.base + ready.downloadUrl);
    assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "video/mp4");
    assert(!response.headers.get("content-disposition")!.includes("\r"));
    let bytes = 0;
    for await (const chunk of chunks(response.body!)) { for (const byte of chunk) assert.equal(byte, 7); bytes += chunk.length; }
    assert.equal(bytes, 2 * 1024 * 1024);
    await eventually(async () => (await b.status(ready.token)).status === "completed");
    assert.equal((await b.status(ready.token)).bytes, bytes);
    assert.equal((await fetch(b.base + ready.downloadUrl)).status, 404);
    assert.equal((await b.status(ready.token)).status, "completed");
  } finally { await b.shutdown(); }
});
test("reservation prevents simultaneous preparation and metadata operations", async () => {
  let calls = 0;
  const b = await setup({ engine: { dumpJson: async () => { calls++; await delay(200); return { raw: raw(), ytDlpVersion: "test" }; } } });
  try {
    const first = b.post("/api/download", { url: URL, format_id: "18", type: "video" });
    await eventually(async () => calls === 1);
    assert.equal((await b.post("/api/download", { url: URL, format_id: "18", type: "video" })).status, 429);
    assert.equal((await b.post("/api/fetch-info", { url: URL })).status, 429);
    assert.equal((await first).status, 201); assert.equal(calls, 1);
  } finally { await b.shutdown(); }
});
test("ticket expiration releases resources; statuses expire; unknown tokens cannot replace them", async () => {
  const b = await setup({ limits: { ticketMs: 100, statusMs: 300 } });
  try {
    const ready = await b.prepare(); await delay(150);
    assert.equal((await b.status(ready.token)).status, "expired");
    assert.equal((await fetch(b.base + ready.downloadUrl)).status, 404);
    assert.equal((await b.status(ready.token)).status, "expired");
    assert.equal((await b.post("/api/fetch-info", { url: URL })).status, 200);
    await delay(350); assert.equal((await fetch(b.base + `/api/download?status=${ready.token}`)).status, 404);
  } finally { await b.shutdown(); }
});
test("consumed tickets do not expire during a progressing stream", async () => {
  const b = await setup({ limits: { ticketMs: 100 }, engine: { dumpJson: async () => ({ raw: raw({ test_mode: "slow", test_size: 256 * 1024 }), ytDlpVersion: "test" }) } });
  try {
    const ready = await b.prepare(); const response = await fetch(b.base + ready.downloadUrl);
    let bytes = 0; for await (const chunk of chunks(response.body!)) bytes += chunk.length;
    assert.equal(bytes, 256 * 1024);
    await eventually(async () => (await b.status(ready.token)).status === "completed");
  } finally { await b.shutdown(); }
});
test("timeout 504, empty stream 502, spawn failure 503, size/duration 413", async () => {
  for (const [extra, expected] of [[{ test_mode: "hang" }, 504], [{ test_mode: "empty" }, 502], [{ duration: 1801 }, 413], [{ formats: [{ ...raw().formats[0], filesize: 300 * 1024 * 1024 }] }, 413]] as const) {
    const b = await setup({ limits: { firstMs: 100 }, engine: { dumpJson: async () => ({ raw: raw(extra), ytDlpVersion: "test" }) } });
    try { assert.equal((await b.post("/api/download", { url: URL, format_id: "18", type: "video" })).status, expected); }
    finally { await b.shutdown(); }
  }
  const b = await setup({ engine: { ytDlpBinary: () => "/nonexistent/vidfetch-test-engine" } });
  try { assert.equal((await b.post("/api/download", { url: URL, format_id: "18", type: "video" })).status, 503); }
  finally { await b.shutdown(); }
});
test("a nonzero process exit after some bytes never becomes completed", async () => {
  const b = await setup({ engine: { dumpJson: async () => ({ raw: raw({ test_mode: "fail" }), ytDlpVersion: "test" }) } });
  try {
    const ready = await b.prepare();
    try { const r = await fetch(b.base + ready.downloadUrl); for await (const _ of chunks(r.body!)) {} } catch { /* Expected truncated stream. */ }
    await eventually(async () => (await b.status(ready.token)).status === "failed");
    assert((await b.status(ready.token)).bytes > 0);
    await eventually(async () => (await b.post("/api/fetch-info", { url: URL })).status === 200);
  } finally { await b.shutdown(); }
});
test("disconnect during a stalled read kills yt-dlp and its descendant", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "vidfetch-test-"));
  const log = resolve(directory, "pids.txt"); process.env.VIDFETCH_TEST_PID_LOG = log;
  const b = await setup({ engine: { dumpJson: async () => ({ raw: raw({ test_mode: "descendant" }), ytDlpVersion: "test" }) } });
  try {
    const ready = await b.prepare();
    await new Promise<void>((resolve, reject) => {
      const req = request(b.base + ready.downloadUrl, res => { res.once("data", () => { res.destroy(); resolve(); }); });
      req.on("error", reject); req.end();
    });
    await eventually(async () => (await b.status(ready.token)).status === "aborted");
    const pids = (await readFile(log, "utf8")).trim().split("\n").map(Number);
    assert.equal(pids.length, 2);
    await eventually(async () => pids.every(pid => { try { process.kill(pid, 0); return false; } catch { return true; } }));
    assert.equal((await b.post("/api/fetch-info", { url: URL })).status, 200);
  } finally { delete process.env.VIDFETCH_TEST_PID_LOG; await b.shutdown(); }
});
test("disconnect while HTTP backpressure is active frees the slot", async () => {
  const b = await setup({ engine: { dumpJson: async () => ({ raw: raw({ test_size: 64 * 1024 * 1024 }), ytDlpVersion: "test" }) } });
  try {
    const ready = await b.prepare();
    await new Promise<void>((resolve, reject) => {
      const req = request(b.base + ready.downloadUrl, res => { res.pause(); setTimeout(() => { res.destroy(); resolve(); }, 150); });
      req.on("error", reject); req.end();
    });
    await eventually(async () => (await b.status(ready.token)).status === "aborted");
    await eventually(async () => (await b.post("/api/fetch-info", { url: URL })).status === 200);
  } finally { await b.shutdown(); }
});
test("idle and absolute timeouts fail ongoing streaming and release the slot", async () => {
  for (const limits of [{ idleMs: 100 }, { operationMs: 300 }]) {
    const b = await setup({ limits, engine: { dumpJson: async () => ({ raw: raw({ test_mode: "descendant" }), ytDlpVersion: "test" }) } });
    try {
      const ready = await b.prepare();
      try { const r = await fetch(b.base + ready.downloadUrl); for await (const _ of chunks(r.body!)) {} } catch {}
      await eventually(async () => (await b.status(ready.token)).status === "failed");
      await eventually(async () => (await b.post("/api/fetch-info", { url: URL })).status === 200);
    } finally { await b.shutdown(); }
  }
});
test("runtime size limit interrupts unknown-size streams", async () => {
  const b = await setup({ limits: { maxBytes: 128 * 1024 } });
  try {
    const ready = await b.prepare();
    try { const r = await fetch(b.base + ready.downloadUrl); for await (const _ of chunks(r.body!)) {} } catch {}
    await eventually(async () => (await b.status(ready.token)).status === "failed");
    assert((await b.status(ready.token)).bytes <= 128 * 1024);
  } finally { await b.shutdown(); }
});
test("real metadata runner is abortable, bounds output and cleans the process group", async () => {
  process.env.YTDLP_PATH = fake; process.env.FFMPEG_PATH = "/opt/homebrew/bin/ffmpeg";
  const controller = new AbortController();
  const dump = await dumpJson(URL, 1000, { signal: controller.signal, cache: false, maxMetadataBytes: 2048 });
  assert.equal(dump.raw.title, "fixture");
  await assert.rejects(dumpJson(URL, 1000, { cache: false, maxMetadataBytes: 2 }), { status: 502 });
  controller.abort(new EngineError("TIMEOUT", "cancelled", 504));
  await assert.rejects(dumpJson(URL, 1000, { signal: controller.signal, cache: false }), { status: 504 });
  process.env.VIDFETCH_TEST_METADATA_MODE = "hang";
  const directory = await mkdtemp(resolve(tmpdir(), "vidfetch-metadata-"));
  const log = resolve(directory, "pids.txt"); process.env.VIDFETCH_TEST_PID_LOG = log;
  try {
    await assert.rejects(dumpJson(URL, 100, { cache: false }), { code: "TIMEOUT", status: 504 });
    const nextController = new AbortController();
    const task = dumpJson(URL, 1000, { signal: nextController.signal, cache: false });
    await delay(60); nextController.abort(new EngineError("TIMEOUT", "cancelled", 504));
    await assert.rejects(task, { status: 504 });
    const pids = (await readFile(log, "utf8")).trim().split("\n").map(Number);
    await eventually(async () => pids.every(pid => { try { process.kill(pid, 0); return false; } catch { return true; } }));
  } finally { delete process.env.VIDFETCH_TEST_METADATA_MODE; delete process.env.VIDFETCH_TEST_PID_LOG; }
});
