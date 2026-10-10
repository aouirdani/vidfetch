import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat, readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Local preview of the Cloudflare Pages deployment.
 *
 * Serves `out/` the way Pages serves static assets and runs the real
 * `functions/api/[[path]].js` module for `/api/*`, so the proxy behaviour can
 * be exercised before deploying.
 *
 *   node scripts/build-pages.mjs
 *   API_ORIGIN=http://localhost:3000 node scripts/preview-pages.mjs
 *
 * This is a development aid, not a reimplementation of the Cloudflare runtime.
 */
const ROOT = resolve("out");
const PORT = Number(process.env.PORT || 8788);
const API_ORIGIN = process.env.API_ORIGIN || "http://localhost:3000";

const { onRequest } = await import("../functions/api/[[path]].js");

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".ico": "image/x-icon",
};

/** Resolves a URL path to a file inside out/, mirroring Pages' asset lookup. */
async function resolveAsset(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidates = clean.endsWith("/")
    ? [join(clean, "index.html")]
    : [clean, `${clean}.html`, join(clean, "index.html")];
  for (const candidate of candidates) {
    const file = resolve(ROOT, `.${sep}${candidate}`);
    if (!file.startsWith(ROOT)) continue;
    try {
      const info = await stat(file);
      if (info.isFile()) return { file, size: info.size };
    } catch { /* try the next candidate */ }
  }
  return null;
}

/** Node request -> Web Request, so the Pages Function receives what Workers would. */
async function toWebRequest(req) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else if (value !== undefined) headers.set(key, value);
  }
  let body;
  if (!["GET", "HEAD"].includes(req.method)) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = Buffer.concat(chunks);
  }
  return new Request(url, { method: req.method, headers, body });
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    try {
      if (url.pathname.startsWith("/api/")) {
        const response = await onRequest({ request: await toWebRequest(req), env: { API_ORIGIN, API_TOKEN: process.env.API_TOKEN } });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        if (response.body) await pipeline(Readable.fromWeb(response.body), res);
        else res.end();
        return;
      }

      const asset = await resolveAsset(url.pathname);
      if (!asset) {
        const notFound = await readFile(join(ROOT, "404.html")).catch(() => null);
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        res.end(notFound ?? "Not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": TYPES[extname(asset.file)] ?? "application/octet-stream",
        "Content-Length": asset.size,
        "X-Content-Type-Options": "nosniff",
      });
      await pipeline(createReadStream(asset.file), res);
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      console.error("[pages-preview]", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, code: "PREVIEW_ERROR", error: "The local Pages preview failed to handle this request." }));
    }
  })();
});

server.timeout = 0;
server.requestTimeout = 0;
server.listen(PORT, () => {
  console.log(`[pages-preview] Static site from out/ on http://localhost:${PORT}`);
  console.log(`[pages-preview] /api/* proxied to ${API_ORIGIN} by functions/api/[[path]].js`);
});
