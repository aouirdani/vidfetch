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
 * Aggregate counters only. Individual transfer records are deliberately not
 * exposed: download titles are never published on the public dashboard.
 */
export type StatsPayload = {
  totals: { fetches: number; downloads: number; bytesStreamed: number };
  platforms: Array<{ platform: string; fetches: number; downloads: number }>;
  engine: EngineStatus;
};

export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), cache: "no-store", signal,
  });
  const payload = await response.json().catch(() => null) as T | null;
  if (payload === null) throw new Error(`The server returned an unreadable response (${response.status}). Please try again.`);
  return payload;
}

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to refresh the service status (${response.status}).`);
  return await response.json() as T;
}
