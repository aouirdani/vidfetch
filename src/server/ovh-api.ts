import { readFileSync } from "node:fs";
import { resolve } from "node:path";
function release() { try { return JSON.parse(readFileSync(resolve(process.cwd(), "../manifest.json"), "utf8")).release; } catch { return "development"; } }
export { fetchInfoPOST, downloadGET, downloadPOST } from "./unavailable-api";

/** Public readiness, separate from the signed gateway and private engine health. */
export async function healthGET() {
  return Response.json({ ok: true, service: "VidFetch", frontend: { ready: true },
    release: release(),
    downloads: { available: process.env.VIDFETCH_CONNECTION_READY === "1" && !!process.env.TURNSTILE_SECRET_KEY && !!(process.env.TURNSTILE_SITE_KEY ?? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) },
  }, { headers: { "Cache-Control": "no-store" } });
}
