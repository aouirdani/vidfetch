import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { request } from "node:http";
export { fetchInfoPOST, downloadGET, downloadPOST } from "./unavailable-api";
function release() { try { return JSON.parse(readFileSync(resolve(process.cwd(), "../manifest.json"), "utf8")).release; } catch { return "development"; } }
let probe: { expires: number; result: Promise<boolean> } | undefined;
function engineReady(): Promise<boolean> {
  if (probe && probe.expires > Date.now()) return probe.result;
  const result = new Promise<boolean>(resolve => {
    const req = request({ hostname: "127.0.0.1", port: 8788, path: "/api/health", headers: { Host: "127.0.0.1:8788" } }, res => {
      let body = "";
      res.on("data", chunk => { body += chunk.toString(); if (body.length > 32768) req.destroy(); });
      res.on("error", () => resolve(false));
      res.on("end", () => { try { const health = JSON.parse(body); resolve(res.statusCode === 200 && health.ok === true && health.engine?.isolationProfile === "vidfetch-uid-nft-v1"); } catch { resolve(false); } });
    });
    const timer = setTimeout(() => req.destroy(), 1500);
    req.on("error", () => resolve(false)); req.on("close", () => clearTimeout(timer)); req.end();
  });
  probe = { expires: Date.now() + 2000, result }; return result;
}
/** Frontend remains usable when downloads are unavailable; probes stay internal. */
export async function healthGET() {
  const configured = process.env.VIDFETCH_CONNECTION_READY === "1" && !!process.env.TURNSTILE_SECRET_KEY && !!(process.env.TURNSTILE_SITE_KEY ?? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  return Response.json({ ok: true, service: "VidFetch", frontend: { ready: true }, release: release(), downloads: { available: configured && await engineReady() } }, { headers: { "Cache-Control": "no-store" } });
}
