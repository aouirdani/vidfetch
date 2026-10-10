import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Builds the Cloudflare Pages artifact: a static export of the VidFetch UI.
 *
 * Cloudflare Workers run on V8 isolates with no child processes and no
 * filesystem, so the download engine cannot run there. The `/api` route group
 * is therefore excluded from this build and served by a separate Node backend.
 *
 * Exclusion uses App Router "private folders": a directory whose name starts
 * with `_` is not routed. The rename is always reverted, including on failure.
 */
const API_DIR = join("src", "app", "api");
const PARKED_DIR = join("src", "app", "_api");
const OUT_DIR = "out";

const HEADERS = `# Written by scripts/build-pages.mjs — mirrors headers() from next.config.ts.
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN

# Hashed filenames: safe to cache permanently.
/_next/static/*
  Cache-Control: public, max-age=31536000, immutable

/icon.svg
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800
/og-image.jpg
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800

/robots.txt
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
/sitemap.xml
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
/manifest.webmanifest
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
`;

/**
 * Preview deployments get their own *.pages.dev hostname while the pages still
 * declare canonicals on the production domain. Marking them noindex keeps them
 * out of search results instead of competing with the live site.
 */
const NOINDEX = `
# Preview deployment: keep it out of search results.
/*
  X-Robots-Tag: noindex, nofollow
`;

/** The export must contain the marketing routes and no server-rendered API output. */
const REQUIRED = [
  "index.html", "404.html", "legal.html", "robots.txt", "sitemap.xml", "manifest.webmanifest",
  "icon.svg", "og-image.jpg", "youtube-video-downloader.html", "tiktok-video-downloader.html",
  "instagram-reels-downloader.html", "twitter-video-downloader.html",
];

let parked = false;

async function park() {
  if (existsSync(PARKED_DIR) && !existsSync(API_DIR)) {
    // A previous run was interrupted before restoring.
    parked = true;
    return;
  }
  if (!existsSync(API_DIR)) throw new Error(`Expected ${API_DIR} to exist. Run this script from the project root.`);
  if (existsSync(PARKED_DIR)) throw new Error(`Both ${API_DIR} and ${PARKED_DIR} exist. Remove or merge ${PARKED_DIR} before building.`);
  await rename(API_DIR, PARKED_DIR);
  parked = true;
}

async function restore() {
  if (!parked) return;
  parked = false;
  if (existsSync(PARKED_DIR)) await rename(PARKED_DIR, API_DIR);
}

// Never leave the working tree with the API routes renamed.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => { void restore().finally(() => process.exit(130)); });
}

try {
  await rm(OUT_DIR, { recursive: true, force: true });
  await park();
  console.log("[vidfetch] Building the static UI for Cloudflare Pages (API routes excluded)…");

  const build = spawnSync("npx", ["next", "build"], {
    stdio: "inherit",
    env: {
      ...process.env,
      VIDFETCH_TARGET: "cloudflare-pages",
      // No yt-dlp binary is needed: this artifact never runs the download engine.
      VIDFETCH_SKIP_ENGINE_SETUP: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
  if (build.error || build.status !== 0) throw new Error("next build failed for the Cloudflare Pages target.");
} finally {
  await restore();
}

if (!existsSync(OUT_DIR)) throw new Error(`next build produced no ${OUT_DIR}/ directory.`);

const missing = REQUIRED.filter((file) => !existsSync(join(OUT_DIR, file)));
if (missing.length > 0) throw new Error(`The export is missing expected files: ${missing.join(", ")}`);

const entries = await readdir(OUT_DIR);
if (entries.includes("api")) throw new Error("The export contains an api/ directory. API routes must not be deployed to Cloudflare Pages.");

const branch = process.env.CF_PAGES_BRANCH;
const productionBranch = process.env.VIDFETCH_PRODUCTION_BRANCH || "main";
const isPreview = Boolean(branch) && branch !== productionBranch;
await writeFile(join(OUT_DIR, "_headers"), isPreview ? HEADERS + NOINDEX : HEADERS);
if (isPreview) console.log(`[vidfetch] Preview branch "${branch}": the export is marked noindex.`);

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/$/, "");
console.log(`\n[vidfetch] Static export ready in ${OUT_DIR}/`);
console.log(`[vidfetch] API calls target: ${apiOrigin ? `${apiOrigin} (direct, CORS)` : "same-origin /api/* (proxied by functions/api/[[path]].js)"}`);
if (!apiOrigin) console.log("[vidfetch] Remember to set the API_ORIGIN variable on the Pages project so the proxy knows the backend.");
