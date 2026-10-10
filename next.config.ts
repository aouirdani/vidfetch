import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import { spawnSync } from "node:child_process";

export default function configuration(phase: string): NextConfig {
  if ([PHASE_PRODUCTION_BUILD, PHASE_DEVELOPMENT_SERVER].includes(phase) && process.env.VIDFETCH_SKIP_ENGINE_SETUP !== "1") {
    const setup = spawnSync(process.execPath, ["scripts/setup-media.mjs"], { stdio: "inherit", timeout: 180000 });
    if (setup.error || setup.status !== 0) throw new Error("VidFetch media engine setup failed. Install yt-dlp with curl_cffi or set YTDLP_PATH to a working standalone binary.");
  }
  return {
    serverExternalPackages: ["ffmpeg-static", "ffprobe-static", "yt-dlp-exec"],
    poweredByHeader: false,
    compress: true,
    reactStrictMode: true,
    experimental: {
      // Rewrites icon imports to per-icon modules instead of the barrel file.
      optimizePackageImports: ["lucide-react"],
      // Inlines the stylesheet: first paint no longer waits on a second request.
      // Measured on throttled mobile: FCP/LCP 688ms -> 264ms. Next also repeats the
      // CSS inside the RSC payload, costing ~22KB extra wire, which the paint win repays.
      inlineCss: true,
    },
    async headers() {
      return [
        { source: "/:path*", headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ] },
        { source: "/:file(icon.svg|og-image.jpg)", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
        { source: "/:path(sitemap.xml|robots.txt|manifest.webmanifest)", headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }] },
      ];
    },
  };
}
