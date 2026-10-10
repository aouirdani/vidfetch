# VidFetch · vidfetch.io

An English-language video downloader for YouTube, TikTok, Instagram and X. Built with Next.js/React, Tailwind, Lucide, PostgreSQL/Drizzle, yt-dlp and ffmpeg. The optional Express entrypoint serves the same UI and API implementations; there is no second, divergent download engine.

## What works

- Instagram public Reels, video posts, IGTV-style links and individual story links when the source permits access. Instagram `/share/reel/` links are resolved to their original post URL where possible.
- TikTok individual videos, mobile URLs, `vm.tiktok.com`, `vt.tiktok.com` and `/t/` share URLs. Pasted share captions containing a URL are accepted.
- Video formats with missing codec metadata (common on Instagram) are retained. Silent videos remain downloadable without a fabricated audio track.
- MP3 conversion is a real yt-dlp → ffmpeg streaming pipeline, not a renamed MP4/WebM file.
- Progressive files are passed through unchanged. Separate tracks and DASH/HLS streams are muxed to fragmented MP4, not incorrectly labeled MPEG-TS.
- Actual source headers and signed URLs from yt-dlp metadata are preserved for the download.
- No guessed `Content-Length`, no complete-file buffering, and no permanent media-file storage. Client cancellation stops the process group.
- English UI, API errors, HTML language, metadata, legal pages, units, status labels and accessibility labels.

**Important:** supported does not mean unrestricted. Private or deleted posts, expired share links, source rate limits, login requirements, regional restrictions and datacenter IP blocking can prevent access. VidFetch reports these conditions and cannot guarantee every URL. Only download content you own or have permission to save. Photo-only posts, profiles and bulk playlists are not supported; a carousel extraction currently selects its first item.

## Local development

1. Copy `.env.example` to `.env` and configure `DATABASE_URL`.
2. Install dependencies with `npm install`.
3. Initialize PostgreSQL tables with `npx drizzle-kit push --config=drizzle.config.ts`.
4. Run `npm run dev` and open `http://localhost:3000`.

A Next development or production build runs `scripts/setup-media.mjs` if necessary. It downloads the official standalone yt-dlp release, validates its SHA-256 checksum and caches it in `.media-bin/`. Unlike the minimal Unix zip, the standalone binary includes browser-request support (`curl_cffi`) used by Instagram and TikTok. `ffmpeg-static` supplies ffmpeg when no system binary is present.

For a provisioned deployment, set `YTDLP_PATH` and `FFMPEG_PATH`. To skip automatic engine installation, set `VIDFETCH_SKIP_ENGINE_SETUP=1` **only after** provisioning yt-dlp with the required dependencies. Refresh a cached engine by removing `.media-bin/yt-dlp` and rerunning `node scripts/setup-media.mjs`.

## Production Node / Express

Build once with `npm run build`, then run either:

- `npm run start`: standard Next.js Node server, usually port 3000.
- `NODE_ENV=production PORT=5000 node server.js`: Express with restrictive CORS, the React UI, the same Next API handlers, and no overall download response timeout.

`CORS_ORIGIN` is a comma-separated allowlist, defaulting to `https://vidfetch.io`. Local origins are automatically added in development. For testing the production Express server locally, explicitly include `http://localhost:5000`.

The media pipeline needs a long-running Node process. Do not deploy its download route to a short-lived edge/serverless function. Disable reverse-proxy buffering and configure suitable proxy idle timeouts. Multiple replicas need sticky routing because short-lived download tickets and metadata caches are process-local.

## Docker

The Docker image contains Node 22, Python 3, current `yt-dlp[default,curl-cffi]`, ffmpeg and an unprivileged runtime user. `tini` reaps child processes. Docker Compose provisions PostgreSQL, runs Drizzle schema setup, then starts the app on port 5000.

Configure `POSTGRES_USER`, `POSTGRES_DB` and a generated URL-safe `POSTGRES_PASSWORD` in `.env`. `openssl rand -hex 24` can generate the password. Set `CORS_ORIGIN=https://vidfetch.io,http://localhost:5000` if testing locally. Then run `docker compose up -d --build`.

For a separately managed database: `docker build -t vidfetch .`, initialize the schema using the configured `DATABASE_URL`, and run `docker run --env-file .env -p 5000:5000 vidfetch`.

Rebuild the image periodically to pick up platform extractor updates. Secrets, local cookies and the development binary cache are excluded from the image build context.

## Deploying to Cloudflare Pages

Cloudflare Workers cannot spawn `yt-dlp` or `ffmpeg`, so the download engine
cannot run on Pages. The supported arrangement puts the static interface on
Cloudflare Pages and the API on a Node host:

```bash
node scripts/build-pages.mjs   # static export of the UI -> out/
```

Pages settings: build command `node scripts/build-pages.mjs`, output directory
`out`, framework preset **None**, `NODE_VERSION=22`. Point the UI at the backend
with either `NEXT_PUBLIC_API_ORIGIN` (direct, recommended for large files) or
`API_ORIGIN` (same-origin proxy via `functions/api/[[path]].js`).

Preview locally with the real proxy module:

```bash
npm run build && npm run start                                   # backend
node scripts/build-pages.mjs
API_ORIGIN=http://localhost:3000 node scripts/preview-pages.mjs  # http://localhost:8788
```

Full instructions, DNS notes and troubleshooting: [DEPLOY-CLOUDFLARE.md](DEPLOY-CLOUDFLARE.md).

## Optional authorized platform sessions

Some public posts are login-gated by Instagram or TikTok. The site operator may provide a Netscape-format cookie file as a mounted server-side secret:

- `YTDLP_INSTAGRAM_COOKIES`: Instagram-only session file.
- `YTDLP_TIKTOK_COOKIES`: TikTok-only session file.
- `YTDLP_COOKIES_FILE`: fallback session file.

Only use sessions and content you are authorized to access. These are **not** browser-upload fields or `NEXT_PUBLIC_*` variables. Each subprocess receives a temporary writable copy; the mounted secret is not modified. Temporary cookie copies are deleted when the process exits. Do not publish cookie files or raw extractor metadata.

`YTDLP_PROXY` optionally configures the operator's outbound proxy. Session/proxy settings do not guarantee access and should not be used to override access permissions.

## API

| Request | Behavior |
| --- | --- |
| `POST /api/fetch-info` with `{ "url": "…" }` | Validates/canonicalizes the URL, extracts metadata and returns video/audio formats plus engine capabilities. |
| `POST /api/download` with `{ "url": "…", "format_id": "…", "type": "video" }` | Opens the real upstream stream, waits for media bytes, then returns a single-use download ticket and `downloadUrl`. Use `type: "audio", format_id: "mp3"` for conversion. |
| `GET /api/download?ticket=…` | Saves the prepared stream as a native browser attachment. Unused tickets expire after 60 seconds. |
| `GET /api/download?status=…` | Transfer state, byte count and any stream failure; used by the English progress UI. |
| `GET /api/download?url=…&format_id=…&type=video` | Original direct-download contract, using the same validation and streaming pipeline. |
| `GET /api/health` | Database health and yt-dlp / ffmpeg availability. |

Errors are JSON with `ok: false`, a stable `code` and an English `error` message. Invalid URLs produce 400; authentication requirements 401; missing/private content 404; expired tickets 410; rate limits or exhausted download slots 429; blocked/missing engines 503; upstream timeouts 504. Raw stderr is logged only on the server.

Metadata is cached for five minutes in a bounded in-memory cache. PostgreSQL records source URLs, titles, thumbnails, requested formats, timestamps and transfer outcomes for operating and debugging the service. None of it is published: there is no usage dashboard and no public statistics endpoint. See `/legal#privacy` for disclosure.

## SEO and page speed

**On-page**

- Unique, length-checked `<title>` and meta description on every route, with absolute titles so the brand suffix is never duplicated.
- Self-referencing canonical URLs, Open Graph and Twitter cards, and a 1200x630 share image at `public/og-image.jpg`.
- One `<h1>` per page with an ordered heading outline, landmark regions, breadcrumb navigation, a skip link and `alt` text plus intrinsic dimensions on the thumbnail.
- `app/sitemap.ts` and `app/robots.ts` generate `/sitemap.xml` and `/robots.txt`; `/api/` is disallowed and the 404 page is `noindex, follow`.
- Valid schema.org JSON-LD in a single `@graph` per page: `Organization` and `WebSite` site-wide, plus `WebApplication`, `HowTo`, `FAQPage`, `BreadcrumbList` and `WebPage` where relevant. No invented ratings or reviews.
- A web app manifest, an SVG icon and `dateModified` on every page.
- Four keyword-focused landing pages (`/youtube-video-downloader`, `/tiktok-video-downloader`, `/instagram-reels-downloader`, `/twitter-video-downloader`) with unique copy, honest platform limitations, FAQs and internal links. Unknown slugs return a real 404 instead of thin pages.
- The FAQ is server-rendered `<details>` markup, so answers are in the HTML for crawlers with no JavaScript required.
- Every `HowTo` and `FAQPage` block mirrors copy that is visible on the same page, including the step list on each landing page, so the markup matches what users see.

**Page speed**

- The marketing routes are statically prerendered and revalidated daily; only `/api/*` runs per request. Database queries and `yt-dlp` process probes were removed from page rendering.
- The result card is code-split and loaded only after a successful extraction, so the landing HTML ships none of it.
- The header is a server component; a small client island performs one idle-time health check instead of polling.
- `content-visibility` defers off-screen section paint, `backdrop-filter` is limited to larger screens, the decorative grid renders on large screens only, and `prefers-reduced-motion` is respected.
- No web fonts are downloaded, icons are tree-shaken via `optimizePackageImports`, and the thumbnail CDNs are DNS-prefetched.

**Measured with `scripts/measure-performance.mjs`** (Chromium, 390x844 mobile emulation, 4x CPU throttling, 1.6 Mbps / 150 ms RTT, cold profile):

| Home page | Before | After |
| --- | --- | --- |
| Rendering | dynamic SSR | static prerender |
| TTFB | 209 ms | 8 ms |
| FCP | 688 ms | 272 ms |
| LCP | 688 ms | 332 ms |
| CLS | 0 | 0 |
| Long tasks | 3 (323 ms) | 1 (188 ms) |
| Render-blocking CSS request | yes | none (inlined) |
| Canonical / JSON-LD | none | canonical + 7 schema types |

The largest paint win came from `experimental.inlineCss`. An A/B run with everything else unchanged measured FCP/LCP at 688 ms with an external stylesheet versus 272 ms inlined. The trade-off is weight: Next emits the CSS both in a `<style>` tag and inside the RSC payload, so the compressed document grows from about 17 KB to about 49 KB while the separate ~9 KB CSS request disappears. Roughly 22 KB more on the wire buys a 400 ms earlier first paint on a throttled connection, which is the better deal for Core Web Vitals; revisit it if Next stops duplicating the payload.

Numbers move between runs and are not Lighthouse scores. LCP is still dominated by emulated network latency rather than application code.

## UI and UX

- Hero built around one action: paste, extract, pick a quality, download. Free / no ads / no daily limit / nothing stored are stated up front.
- **Shared-link entry point.** `/?url=…` runs an extraction on arrival, and `?text=` is parsed too so a shared caption containing a link still works. The query is cleared afterwards so a refresh does not silently re-run it. Unsupported links are ignored rather than throwing an error at someone who just opened the page.
- **Installable share target.** The web manifest registers VidFetch in the Android share sheet, so sharing a post from the TikTok or Instagram app opens the site with the link already extracting. The manifest also exposes per-platform shortcuts.
- **Example result card** under the hero shows the quality picker before any search. It is inert, carries no invented creator names or view counts, and is labelled "Example result" so it is never mistaken for live data.
- Numbered step cards (Copy → Paste → Save) and a device strip stating the browsers and platforms this runs on.
- The quality picker is a real ARIA radio group with roving focus, so arrow keys, Home and End move between formats.
- Download feedback is explicit: preparing, a live byte counter with an indeterminate progress bar, then a confirmation naming the saved size. Failures surface the server's reason with a retry and a link to the original post.
- Platform pages reuse the same form, but show that platform's link shape in the inline hint and an on-brand example card.
- The result card takes focus when it appears and scrolls into view on small screens; status changes are announced through a polite live region.
- Skeletons mirror the real card's grid and heights, holding CLS at 0 while the lazy chunk loads.
- Tap targets are at least 44 px high, focus rings are visible on every control, and `prefers-reduced-motion` disables animation and smooth scrolling.
- **No usage dashboard.** The service-activity panel and its `/api/stats` endpoint were removed outright. Nothing about what other people download is published, and the home page ends on the FAQ instead of a stats block.
- **Palette.** Aqua (`#22d3ee`) to sky (`#0ea5e9`) on a teal-tinted near-black (`#04090d`). Primary actions use near-black text on the bright accent, which measures 7.6:1 to 10.4:1 from rendered pixels — far clearer than white on a mid-tone fill. Amber stays reserved for caution, red for errors and emerald for success, so no semantic colour collides with the brand.

## Tests

- Unit/regression tests: `npx tsx --test tests/*.test.ts` (media pipeline, SEO metadata and structured data, Cloudflare proxy function).
- Live production API/file tests: `BASE_URL=http://localhost:3000 node scripts/smoke-media.mjs`.
- Browser tests: install Chromium using `npx playwright install --with-deps chromium`, then run `BASE_URL=http://localhost:3000 node scripts/smoke-browser.mjs`.
- Build checks: `npx next typegen`, `npm exec tsc -- --noEmit --pretty false`, `npm run build`.
- Performance and SEO snapshot: `BASE_URL=http://localhost:3000 node scripts/measure-performance.mjs` (set `PERF_LABEL` and `PERF_ROUTES` to compare runs).

The live test script downloads the official Instagram sample Reel and a public TikTok clip, verifies file codecs with ffprobe, fully decodes the files with ffmpeg, checks a genuine TikTok MP3 conversion, tests the original GET contract, and checks English error responses. Browser tests exercise the real visible buttons, save the native attachments, verify completion feedback, and check English desktop/mobile pages for runtime errors and horizontal overflow. Override `SMOKE_INSTAGRAM_URL` and `SMOKE_TIKTOK_URL` with other authorized public videos when running the API tests.

Test downloads are temporary and removed afterwards. Browser screenshots are saved under the git-ignored `test-results/` directory. These are live tests of selected public posts, not a promise that platform access restrictions never change.
