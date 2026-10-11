import { DOWNLOADS_UNAVAILABLE_MESSAGE } from "../lib/api";

const headers = { "Cache-Control": "no-store" };

export async function healthGET() {
  return Response.json({
    ok: true,
    service: "vidfetch.io",
    engine: { ytDlp: null, ffmpeg: false },
    downloads: { available: false, code: "BACKEND_UNAVAILABLE", error: DOWNLOADS_UNAVAILABLE_MESSAGE },
    timestamp: new Date().toISOString(),
  }, { headers });
}

export async function fetchInfoPOST() {
  return Response.json({ ok: false, code: "BACKEND_UNAVAILABLE", error: DOWNLOADS_UNAVAILABLE_MESSAGE }, { status: 503, headers });
}

export const downloadPOST = fetchInfoPOST;
export const downloadGET = fetchInfoPOST;
