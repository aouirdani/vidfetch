import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { isLocalEngineHosting } from "./src/lib/deployment";

/**
 * Build targets share one codebase:
 *
 *  - default / vercel: frontend with unavailable media API; no database required.
 *  - node: explicit full Node.js server (Docker / VPS / Render / Koyeb). Pages are
 *    prerendered, and `/api/*` runs yt-dlp and ffmpeg as child processes.
 *  - cloudflare-pages: static export of the UI only. Cloudflare Workers cannot
 *    spawn binaries, so `scripts/build-pages.mjs` removes `/api/*` from the
 *    route tree and the deployed site talks to a separate backend origin.
 */
export default function configuration(phase: string): NextConfig {
  const isNodeHost = isLocalEngineHosting(process.env);
  const isPagesBuild = process.env.VIDFETCH_TARGET === "cloudflare-pages"
    && process.env.VERCEL !== "1" && !process.env.VERCEL_ENV;
  const downloadsUnavailable = !isNodeHost && !isPagesBuild;
  const unavailableApi = "./src/server/unavailable-api.ts";
  const needsEngine = isNodeHost
    && [PHASE_PRODUCTION_BUILD, PHASE_DEVELOPMENT_SERVER].includes(phase)
    && process.env.VIDFETCH_SKIP_ENGINE_SETUP !== "1";

  if (needsEngine) {
    const setup = spawnSync(process.execPath, ["scripts/setup-media.mjs"], { stdio: "inherit", timeout: 180000 });
    if (setup.error || setup.status !== 0) throw new Error("VidFetch media engine setup failed. Install yt-dlp with curl_cffi or set YTDLP_PATH to a working standalone binary.");
  }

  return {
    // The default frontend never needs engines, database credentials or platform flags.
    // Alias at build time: engines and database code never enter its API bundles.
    env: {
      NEXT_PUBLIC_DOWNLOADS_UNAVAILABLE: downloadsUnavailable ? "1" : "0",
      NEXT_PUBLIC_API_ORIGIN: downloadsUnavailable ? "" : (process.env.NEXT_PUBLIC_API_ORIGIN ?? ""),
    },
    turbopack: {
      root: resolve("."),
      ...(!isNodeHost ? { resolveAlias: { "@vidfetch/media-api": unavailableApi } } : {}),
    },
    ...(!isNodeHost ? {
      webpack(config) {
        config.resolve.alias["@vidfetch/media-api"] = resolve(unavailableApi);
        return config;
      },
    } : {}),
    // `output: export` emits plain HTML/CSS/JS that Cloudflare Pages serves from its CDN.
    ...(isPagesBuild ? { output: "export" as const, images: { unoptimized: true } } : {}),
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
    // Static exports have no server to run headers(); Pages reads `out/_headers` instead,
    // which `scripts/build-pages.mjs` writes with the same values.
    ...(isPagesBuild ? {} : {
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
    }),
  };
}
