/**
 * Cloudflare Pages Function: same-origin proxy for `/api/*`.
 *
 * The VidFetch download engine spawns yt-dlp and ffmpeg, which Workers cannot
 * do. This function forwards every `/api/*` request to a Node backend and
 * streams the response straight back, so the browser only ever talks to one
 * origin and no CORS configuration is required.
 *
 * Bindings (Pages project → Settings → Variables):
 *   API_ORIGIN  (required)  e.g. https://vidfetch-api.onrender.com
 *   API_TOKEN   (optional)  forwarded as X-VidFetch-Proxy-Token
 *
 * Prefer `NEXT_PUBLIC_API_ORIGIN` at build time for very large downloads: that
 * sends media straight from the backend to the browser and skips this Worker,
 * avoiding Pages Functions request quotas and Worker execution limits.
 */

/** Connection-scoped headers must not be forwarded; the runtime manages them. */
const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-authenticate",
  "proxy-authorization", "te", "trailer", "host", "content-length", "expect",
]);

const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "OPTIONS"]);

/** Error shape matches the backend so the UI can render it unchanged. */
function problem(status, code, error) {
  return new Response(JSON.stringify({ ok: false, code, error }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/**
 * @param {{ request: Request, env: Record<string, string | undefined> }} context
 * @returns {Promise<Response>}
 */
export async function onRequest({ request, env }) {
  if (!ALLOWED_METHODS.has(request.method)) {
    return problem(405, "METHOD_NOT_ALLOWED", `${request.method} is not supported by the VidFetch API.`);
  }

  const origin = (env.API_ORIGIN || "").trim().replace(/\/+$/, "");
  if (!origin) {
    return problem(503, "API_ORIGIN_MISSING", "This deployment has no download backend configured. Set the API_ORIGIN variable on the Cloudflare Pages project.");
  }

  let target;
  try {
    const base = new URL(origin);
    if (base.protocol !== "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1") {
      return problem(503, "API_ORIGIN_INSECURE", "The configured download backend must use HTTPS.");
    }
    const incoming = new URL(request.url);
    // Preserve the path and query exactly; only the origin changes.
    target = new URL(incoming.pathname + incoming.search, base);
  } catch {
    return problem(503, "API_ORIGIN_INVALID", "The configured download backend URL is not valid.");
  }

  const headers = new Headers();
  for (const [name, value] of request.headers) {
    if (!HOP_BY_HOP.has(name.toLowerCase())) headers.set(name, value);
  }
  const requestUrl = new URL(request.url);
  headers.set("X-Forwarded-Host", requestUrl.host);
  headers.set("X-Forwarded-Proto", requestUrl.protocol.replace(":", ""));
  // The incoming Origin header (if any) is forwarded as-is by the loop above.
  // Forging one here would make same-origin GETs fail a strict backend allowlist.
  if (env.API_TOKEN) headers.set("X-VidFetch-Proxy-Token", env.API_TOKEN);

  /** @type {RequestInit} */
  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method === "POST") {
    // Request bodies here are small JSON documents (the API caps them at 8 KB),
    // so buffering avoids streaming-upload edge cases. Responses stay streamed.
    init.body = await request.arrayBuffer();
  }

  let upstream;
  try {
    upstream = await fetch(target.toString(), init);
  } catch (cause) {
    console.error("[vidfetch-proxy] upstream unreachable", cause);
    return problem(502, "BACKEND_UNREACHABLE", "The download backend is not responding. Please try again in a moment.");
  }

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("transfer-encoding");
  responseHeaders.delete("connection");
  responseHeaders.set("X-VidFetch-Proxied", "cloudflare-pages");

  // Returning the body unread keeps the media streaming through the edge
  // without buffering the file in Worker memory.
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
