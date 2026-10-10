# Deploying VidFetch with Cloudflare Pages

## Read this first

**Cloudflare Pages cannot run the VidFetch download engine.** Downloads work by
spawning `yt-dlp` and `ffmpeg` as child processes and streaming their output.
Cloudflare Pages Functions and Workers run on V8 isolates: no child processes,
no filesystem, no executing binaries, and strict execution limits. Hosting the
whole app there is not possible — not with `@cloudflare/next-on-pages`, not with
the OpenNext adapter. The build would succeed and every download would fail.

The working arrangement splits the app in two:

| Part | Runs on | What it does |
| --- | --- | --- |
| Interface | Cloudflare Pages | Static HTML/CSS/JS for the home page, the four platform pages, `/legal`, `sitemap.xml`, `robots.txt` |
| Download engine | A Node host (Render, Koyeb, Fly.io, Railway, VPS) | `/api/*`: extraction with yt-dlp, MP3 conversion with ffmpeg, file streaming, PostgreSQL |

You get Cloudflare's CDN, preview deployments and custom domains for the UI,
while downloads keep a real long-running Node server. If you would rather not
run two services, deploy the existing `Dockerfile` on its own — it serves the
interface and the API from one container, and you can still put Cloudflare in
front of it as a proxied DNS record.

---

## Step 1 — Deploy the backend

The backend is the repository's existing Docker image. It already contains
Node 22, Python 3, `yt-dlp[default,curl-cffi]` and ffmpeg, and starts
`node server.js` (Express + CORS + the Next API handlers).

On **Render** or **Koyeb**: create a Web Service from this repository, choose
the Docker runtime, and set:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `5000` (or whatever the host injects) |
| `DATABASE_URL` | your PostgreSQL connection string |
| `CORS_ORIGIN` | `https://vidfetch.io,https://vidfetch.pages.dev` |
| `YTDLP_PATH` | `/opt/vidfetch/bin/yt-dlp` |
| `FFMPEG_PATH` | `/usr/bin/ffmpeg` |

Apply the database schema once, from a machine with the same `DATABASE_URL`:

```bash
npx drizzle-kit push --config=drizzle.config.ts
```

Check that it is alive and that both binaries resolved:

```bash
curl https://your-backend.example.com/api/health
# {"ok":true,...,"engine":{"ytDlp":"2026.08.19","ffmpeg":true}}
```

If `ffmpeg` is `false`, MP3 conversion and track merging are unavailable.

**Give the backend its own hostname**, for example `api.vidfetch.io`. If that
record is proxied through Cloudflare (orange cloud), note that the free plan
applies a 100 MB response cap and a 100-second origin timeout — both of which
large downloads will exceed. Set the record to **DNS only** (grey cloud), or
point the frontend at the host's own domain.

---

## Step 2 — Choose how the browser reaches the API

Two options, both supported.

### Option A — Direct to the backend (recommended)

The browser calls the backend hostname directly. Media never passes through a
Worker, so there are no Functions quotas or execution limits on downloads.

Set this as a **build-time** variable on the Pages project:

```
NEXT_PUBLIC_API_ORIGIN = https://api.vidfetch.io
```

The backend's `CORS_ORIGIN` must list your Pages domain, because the browser
sends an `Origin` header on the `POST` requests.

### Option B — Same-origin proxy

Leave `NEXT_PUBLIC_API_ORIGIN` empty. The bundled
`functions/api/[[path]].js` forwards `/api/*` to the backend and streams the
response back, so the browser only sees one origin and CORS is irrelevant.

Set this as a **runtime** variable on the Pages project:

```
API_ORIGIN = https://api.vidfetch.io
```

Trade-off: every API call, including the file transfer, consumes a Pages
Functions invocation and runs inside a Worker. That is fine for short clips and
convenient for a single-domain setup, but Option A is safer for large files.

Optional: set `API_TOKEN` on the Pages project to have the proxy send
`X-VidFetch-Proxy-Token`, so the backend can reject requests that bypass it.

---

## Step 3 — Create the Pages project

In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to
Git**, pick the repository, then set:

| Setting | Value |
| --- | --- |
| Framework preset | **None** (do not pick Next.js — this is a static export) |
| Build command | `node scripts/build-pages.mjs` |
| Build output directory | `out` |
| Node version | `NODE_VERSION = 22` |

Add the variables from Step 2, plus `NEXT_PUBLIC_SITE_URL=https://vidfetch.io`
so canonical URLs, `sitemap.xml` and Open Graph tags use the real domain.

`scripts/build-pages.mjs` temporarily moves `src/app/api` out of the route tree
(App Router private folder), runs `next build` with `output: "export"`, restores
the directory, writes `out/_headers`, and fails the build if any API route
reached the output. `DATABASE_URL` is **not** needed for this build.

Or deploy from your machine:

```bash
node scripts/build-pages.mjs
npx wrangler pages deploy      # settings come from wrangler.toml
```

---

## Step 4 — Domain and DNS

In **Pages → Custom domains**, add `vidfetch.io` (and `www`). Cloudflare creates
the records automatically.

```
vidfetch.io       → Pages project        (proxied)
api.vidfetch.io   → backend host          (DNS only — see Step 1)
```

---

## Test locally before deploying

```bash
# Terminal 1 — the real backend
npm run build && npm run start

# Terminal 2 — the exported site plus the real Pages Function
node scripts/build-pages.mjs
API_ORIGIN=http://localhost:3000 node scripts/preview-pages.mjs
# → http://localhost:8788
```

`scripts/preview-pages.mjs` serves `out/` the way Pages serves assets and runs
the actual `functions/api/[[path]].js` module for `/api/*`. The regression
suites run against it unchanged:

```bash
BASE_URL=http://localhost:8788 node scripts/smoke-media.mjs
BASE_URL=http://localhost:8788 node scripts/smoke-browser.mjs
```

Both were run against this setup: Instagram and TikTok videos and a TikTok MP3
downloaded through the proxy, verified with ffprobe and fully decoded.

---

## What to expect

- **Previews are noindex.** Builds on a non-production branch get an
  `X-Robots-Tag: noindex` header, so `*.pages.dev` previews never compete with
  the live domain. Change the production branch with `VIDFETCH_PRODUCTION_BRANCH`.
- **The UI is fully static.** It loads and renders even when the backend is
  down; the header badge then reports "Engine unavailable" and extraction
  returns a clear error.
- **Rebuild to refresh content.** Pages serves a build artifact, so copy changes
  require a new deployment. Live counters come from the API at runtime.
- **Keep the backend updated.** Platform extractors change often. Rebuild the
  Docker image periodically to pick up a newer `yt-dlp`.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `API_ORIGIN_MISSING` (503) | Option B selected but `API_ORIGIN` is not set on the Pages project |
| `BACKEND_UNREACHABLE` (502) | Backend is down, asleep on a free tier, or the hostname is wrong |
| CORS errors in the console | Option A selected and the Pages domain is missing from the backend's `CORS_ORIGIN` |
| Downloads stop near 100 MB | The backend hostname is proxied through Cloudflare; set the record to DNS only |
| Build fails with `output: export` errors | A new dynamic route or server-only page was added outside `src/app/api` |
| Build output is empty | Framework preset is set to Next.js; it must be **None** with output directory `out` |
