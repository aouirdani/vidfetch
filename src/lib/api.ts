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
export const DOWNLOADS_UNAVAILABLE_MESSAGE = "Video extraction and downloads are temporarily unavailable. Please try again once the download service is connected.";
const API_ORIGIN = downloadsUnavailable ? "" : (process.env.NEXT_PUBLIC_API_ORIGIN ?? "").trim().replace(/\/+$/, "");

/** Resolves an API path against the configured backend. Absolute URLs pass through. */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalised = path.startsWith("/") ? path : `/${path}`;
  return API_ORIGIN ? `${API_ORIGIN}${normalised}` : normalised;
}

export async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), cache: "no-store", signal,
  });
  const payload = await response.json().catch(() => null) as T | null;
  if (payload === null) throw new Error(`The server returned an unreadable response (${response.status}). Please try again.`);
  return payload;
}

