import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The Pages Function is plain JS so the Cloudflare build needs no extra types.
 * Importing through a URL keeps it out of the app's TypeScript program while
 * still exercising the real module that gets deployed.
 */
type PagesFunction = (context: { request: Request; env: Record<string, string | undefined> }) => Promise<Response>;
let cached: PagesFunction | undefined;

async function onRequest(context: { request: Request; env: Record<string, string | undefined> }): Promise<Response> {
  cached ??= ((await import(new URL("../functions/api/[[path]].js", import.meta.url).href)) as { onRequest: PagesFunction }).onRequest;
  return cached(context);
}

const BACKEND = "https://backend.example.com";
const realFetch = globalThis.fetch;
let calls: Array<{ url: string; init: RequestInit }> = [];

function stubFetch(response: Response | (() => Response | Promise<Response>)) {
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    return typeof response === "function" ? await response() : response;
  }) as typeof fetch;
}

beforeEach(() => { calls = []; });
afterEach(() => { globalThis.fetch = realFetch; });

describe("Cloudflare Pages API proxy", () => {
  it("refuses to run without a configured backend", async () => {
    const response = await onRequest({ request: new Request("https://vidfetch.io/api/health"), env: {} });
    assert.equal(response.status, 503);
    assert.equal((await response.json() as { code: string }).code, "API_ORIGIN_MISSING");
  });

  it("rejects a plaintext backend origin", async () => {
    const response = await onRequest({ request: new Request("https://vidfetch.io/api/health"), env: { API_ORIGIN: "http://insecure.example.com" } });
    assert.equal(response.status, 503);
    assert.equal((await response.json() as { code: string }).code, "API_ORIGIN_INSECURE");
  });

  it("still allows a local backend for development", async () => {
    stubFetch(new Response("{}", { status: 200 }));
    const response = await onRequest({ request: new Request("https://vidfetch.io/api/health"), env: { API_ORIGIN: "http://localhost:3000" } });
    assert.equal(response.status, 200);
    assert.equal(calls[0].url, "http://localhost:3000/api/health");
  });

  it("blocks methods the API does not implement", async () => {
    const response = await onRequest({ request: new Request("https://vidfetch.io/api/download", { method: "DELETE" }), env: { API_ORIGIN: BACKEND } });
    assert.equal(response.status, 405);
    assert.equal(calls.length, 0);
  });

  it("preserves the path and query string exactly", async () => {
    stubFetch(new Response("{}", { status: 200 }));
    const url = "https://vidfetch.io/api/download?url=https%3A%2F%2Fwww.tiktok.com%2F%40a%2Fvideo%2F123&format_id=download&type=video";
    await onRequest({ request: new Request(url), env: { API_ORIGIN: `${BACKEND}/` } });
    assert.equal(calls[0].url, url.replace("https://vidfetch.io", BACKEND));
  });

  it("strips hop-by-hop headers but forwards the browser's Origin", async () => {
    stubFetch(new Response("{}", { status: 200 }));
    const request = new Request("https://vidfetch.io/api/fetch-info", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://vidfetch.io", Connection: "keep-alive" },
      body: JSON.stringify({ url: "https://youtu.be/aqz-KE-bpKQ" }),
    });
    await onRequest({ request, env: { API_ORIGIN: BACKEND } });
    const headers = calls[0].init.headers as Headers;
    assert.equal(headers.get("connection"), null);
    assert.equal(headers.get("origin"), "https://vidfetch.io", "the backend CORS allowlist needs the real site origin");
    assert.equal(headers.get("content-type"), "application/json");
    assert.equal(headers.get("x-forwarded-host"), "vidfetch.io");
    assert.equal(new TextDecoder().decode(calls[0].init.body as ArrayBuffer), JSON.stringify({ url: "https://youtu.be/aqz-KE-bpKQ" }));
  });

  it("passes the optional shared secret to the backend", async () => {
    stubFetch(new Response("{}", { status: 200 }));
    await onRequest({ request: new Request("https://vidfetch.io/api/health"), env: { API_ORIGIN: BACKEND, API_TOKEN: "s3cret" } });
    assert.equal((calls[0].init.headers as Headers).get("x-vidfetch-proxy-token"), "s3cret");
  });

  it("streams the download back with its attachment headers intact", async () => {
    const media = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
    stubFetch(new Response(new ReadableStream({ start(controller) { controller.enqueue(media); controller.close(); } }), {
      status: 200,
      headers: { "Content-Type": "video/mp4", "Content-Disposition": 'attachment; filename="VidFetch_clip.mp4"' },
    }));
    const response = await onRequest({ request: new Request("https://vidfetch.io/api/download?ticket=abc"), env: { API_ORIGIN: BACKEND } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-disposition"), 'attachment; filename="VidFetch_clip.mp4"');
    assert.equal(response.headers.get("content-type"), "video/mp4");
    assert.equal(response.headers.get("x-vidfetch-proxied"), "cloudflare-pages");
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), media);
  });

  it("relays backend error codes instead of masking them", async () => {
    stubFetch(new Response(JSON.stringify({ ok: false, code: "PRIVATE", error: "This video is private." }), {
      status: 404, headers: { "Content-Type": "application/json" },
    }));
    const response = await onRequest({ request: new Request("https://vidfetch.io/api/fetch-info", { method: "POST", body: "{}" }), env: { API_ORIGIN: BACKEND } });
    assert.equal(response.status, 404);
    assert.equal((await response.json() as { code: string }).code, "PRIVATE");
  });

  it("reports an unreachable backend as a gateway error", async () => {
    stubFetch(() => { throw new Error("connection refused"); });
    const response = await onRequest({ request: new Request("https://vidfetch.io/api/health"), env: { API_ORIGIN: BACKEND } });
    assert.equal(response.status, 502);
    assert.equal((await response.json() as { code: string }).code, "BACKEND_UNREACHABLE");
  });
});

describe("split-deployment client configuration", () => {
  it("defaults to same-origin paths", async () => {
    const { apiUrl } = await import("../src/lib/api");
    assert.equal(apiUrl("/api/health"), "/api/health");
    assert.equal(apiUrl("api/health"), "/api/health");
    assert.equal(apiUrl("https://cdn.example.com/file.mp4"), "https://cdn.example.com/file.mp4");
  });

  it("keeps the static export free of server-only API routes", () => {
    const script = readFileSync("scripts/build-pages.mjs", "utf8");
    // Workers cannot spawn yt-dlp, so the API group must never reach the bundle.
    assert.match(script, /src", "app", "api/);
    assert.match(script, /_api/);
    assert.match(script, /throw new Error\("The export contains an api\/ directory/);
    assert.match(script, /finally/, "the api directory rename must always be reverted");
  });
});
