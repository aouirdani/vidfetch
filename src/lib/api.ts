import type { Locale } from "../i18n/config";
import { SecureDownloadClient } from "./secure-client";
import { resolveQueued,type QueueNotice } from "./queue-client";

export type ApiError = { ok: false; error: string; code: string };
export type EngineStatus = { ytDlp: string | null; ffmpeg: boolean };
export type FetchInfoSuccess = { ok: true; info: import("./media").MediaInfo; engine: EngineStatus };
export type FetchInfoResponse = FetchInfoSuccess | ApiError;
export type DownloadResponse = { ok: true; token: string; filename: string; downloadUrl: string } | ApiError;
export type DownloadStatusResponse = {
  ok: true;
  status: "ready" | "streaming" | "completed" | "failed" | "aborted" | "expired";
  bytes: number;
  error: string | null;
} | ApiError;

/**
 * Where the browser sends API calls.
 *
 * Empty (default): same-origin `/api/*`. That is the single-server Docker
 * deployment, and also Cloudflare Pages when the bundled Pages Function proxies
 * to the backend.
 *
 * Set at build time: requests go straight to that origin. Use this for a split
 * deployment so large media never traverses an edge proxy. The backend must
 * allow the site's origin through CORS (see `CORS_ORIGIN` in server.js).
 */
export const downloadsUnavailable = process.env.NEXT_PUBLIC_DOWNLOADS_UNAVAILABLE === "1";
export { DOWNLOADS_UNAVAILABLE_MESSAGE } from "./service-contract";
const API_ORIGIN = downloadsUnavailable ? "" : (process.env.NEXT_PUBLIC_API_ORIGIN ?? "").trim().replace(/\/+$/, "");
export const secureGateway = process.env.NEXT_PUBLIC_SECURE_GATEWAY === "1";
let client: SecureDownloadClient | null = null;
function origin() { return API_ORIGIN || (typeof window !== "undefined" ? window.location.origin : "https://vidfetch.app"); }
function secureClient() { return secureGateway ? (client ??= new SecureDownloadClient(origin())) : null; }
export async function authorizeDownloads(challenge: string) { await secureClient()?.authorize(challenge); window.dispatchEvent(new Event("vidfetch-access-ready")); }
export const openSecureTransfer = (locale: Locale = "en") => secureClient()?.openTransfer(locale);

/** Resolves an API path against the configured backend. Absolute URLs pass through. */
export function apiUrl(path: string): string {
  if (secureGateway) {
    const url = new URL(path, origin());
    if (url.origin !== origin() || !/^\/api\/(?:health|fetch-info|download|queue)$/.test(url.pathname) || url.username || url.password || url.hash) throw new Error("Invalid download API URL.");
    return url.href;
  }
  if (/^https?:\/\//i.test(path)) return path;
  const normalised = path.startsWith("/") ? path : `/${path}`;
  return API_ORIGIN ? `${API_ORIGIN}${normalised}` : normalised;
}

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const active = secureClient();
  if (active) { const url = new URL(apiUrl(path)); return active.request(url.pathname + url.search, init); }
  return fetch(apiUrl(path), init);
}

export async function postJson<T>(path: string, body: unknown, signal?: AbortSignal,onQueue?:(notice:QueueNotice)=>void): Promise<T> {
  const response = await apiFetch(path, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), cache: "no-store", signal,
  });
  const payload = await resolveQueued<T>(response,apiFetch,signal,onQueue) as T | null;
  if (payload === null) throw new Error(`The server returned an unreadable response (${response.status}). Please try again.`);
  return payload;
}
