import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * Two build targets share one codebase:
 *
 *  - default: full Node.js server (Docker / VPS / Render / Koyeb). Pages are
 *    prerendered, and `/api/*` runs yt-dlp and ffmpeg as child processes.
 *  - cloudflare-pages: static export of the UI only. Cloudflare Workers cannot
 *    spawn binaries, so `scripts/build-pages.mjs` removes `/api/*` from the
 *    route tree and the deployed site talks to a separate backend origin.
 */
const isVercelBuild = process.env.VERCEL === "1" || process.env.VIDFETCH_TARGET === "vercel";
const isPagesBuild = !isVercelBuild && process.env.VIDFETCH_TARGET === "cloudflare-pages";
const unavailableApi = "./src/server/unavailable-api.ts";

export default function configuration(phase: string): NextConfig {
  const needsEngine = !isPagesBuild && !isVercelBuild
    && [PHASE_PRODUCTION_BUILD, PHASE_DEVELOPMENT_SERVER].includes(phase)
    && process.env.VIDFETCH_SKIP_ENGINE_SETUP !== "1";

  if (needsEngine) {
    const setup = spawnSync(process.execPath, ["scripts/setup-media.mjs"], { stdio: "inherit", timeout: 180000 });
    if (setup.error || setup.status !== 0) throw new Error("VidFetch media engine setup failed. Install yt-dlp with curl_cffi or set YTDLP_PATH to a working standalone binary.");
  }

  return {
    // Until an authenticated HTTPS gateway exists, Vercel serves the UI only.
    // Alias at build time: engines and database code never enter its API bundles.
    env: {
      NEXT_PUBLIC_DOWNLOADS_UNAVAILABLE: isVercelBuild ? "1" : "0",
      NEXT_PUBLIC_API_ORIGIN: isVercelBuild ? "" : (process.env.NEXT_PUBLIC_API_ORIGIN ?? ""),
    },
    turbopack: {
      root: resolve("."),
      ...(isVercelBuild ? { resolveAlias: { "@vidfetch/media-api": unavailableApi } } : {}),
    },
    ...(isVercelBuild ? {
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
