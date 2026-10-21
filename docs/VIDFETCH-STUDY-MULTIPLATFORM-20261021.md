# VidFetch — study: YouTube, EGM-Downloader and multi-platform downloads (21 October 2026)

**Study only.** Nothing in production, the engine, the gateway, Caddy, nftables or the secrets was changed. No YouTube request was made from OVH for this study. No cookie was imported.

**Sources:**
- the EGM-Downloader code, read and never executed: <https://github.com/egmtm/EGM-Downloader>, `main` at `995d8d7`, v1.5.0 build 169, 21/10/2026;
- the VidFetch code on `main` (`d6fc88a1`);
- the yt-dlp releases (GitHub API);
- our PR #6, the YouTube audit on OVH.

## 1. EGM-Downloader versus VidFetch

| Topic | EGM-Downloader (read in the code) | VidFetch (production) |
|---|---|---|
| Nature | **Local desktop app**: Flask on `127.0.0.1` plus Electron (Windows, macOS, Linux). Runs on the user's machine and the user's IP. | **Public web service** on an OVH VPS. Runs on a datacenter IP, shared by every visitor. |
| yt-dlp | `yt-dlp>=2026.8.19` from PyPI (floating floor), updated by the app ("Update Plugins") | Official standalone `yt-dlp_linux` **2026.08.19**, pinned, root-owned, checked against the official SHA-256 manifest. It is the **latest stable** (GitHub, 21/10). |
| JavaScript challenges (YouTube) | `--remote-components ejs:github`: the EJS solver scripts are **downloaded from GitHub at run time**. Deno is downloaded on first launch from `releases/latest`, **not pinned**. | `--js-runtimes node` (Node 22.23.3) with the EJS bundled in the standalone build (0.8.0, PR #6). Nothing is downloaded at run time. |
| PO tokens (BotGuard) | **`bgutil-ytdlp-pot-provider`**: generates proof-of-origin tokens through Deno to pass YouTube's bot checks | None. Excluded by our rules (§2). |
| Browser impersonation | `curl_cffi` 0.16.x (TLS fingerprint of Chrome or Safari) | `curl_cffi` bundled in the standalone build, used by yt-dlp where an extractor asks for it (TikTok, Instagram) |
| Cookies | `--cookies cookies.txt` when the user provides one (account cookies) | Supported by the code (`YTDLP_<PLATFORM>_COOKIES`), **never configured** in production. Our rules forbid account cookies. |
| Platform detection | **None in the app.** Any `http(s)` URL goes to yt-dlp (`--no-playlist -j <url>`), including its *generic* extractor. Detection = yt-dlp's ~1,800 extractors. | **Strict allowlist** (`src/lib/platforms.ts`): YouTube, TikTok, Instagram and X, individual media only. The same detector runs in the frontend, the gateway and the engine. |
| Network safety | Fine for a local app: binds to loopback, API token, SSRF guard on thumbnails only | Every source and media destination resolves to public IPs (`assertPublicUrl`, `validateMediaDestinations`). The engine runs in its own netns behind an egress filter that drops private ranges and IPv6. Turnstile, gateway grants, proof of possession, quotas, size and time limits. |
| MP4 | `-f` with an H.264/AAC preference, `--merge-output-format mp4 --remux-video mp4`, optional re-encode with a hardware encoder | Formats deduplicated by resolution; separate video and audio merged by ffmpeg into MP4 **without re-encoding** (`-f mp4`, codec copy) |
| MP3 | `-x --audio-format mp3` at 128, 192 or 320 kbps; also FLAC, M4A, Opus | `libmp3lame` 192 kbps, decoded and re-encoded through a pipe |
| Errors | Regex classification: login/bot, private, 429, region… | Code mapping (`AUTH_REQUIRED`, `PRIVATE`, `UNAVAILABLE`…). PR #7 refines "platform block / account / unavailable / outage". |
| Playlists, live | Playlists, live recording, subtitles | Single item (`--no-playlist --playlist-items 1`), no live |
| License | **AGPL-3.0** (whole repository) | Proprietary repository |

**AGPL-3.0, before any reuse of EGM code.**
- Copying or adapting EGM code into VidFetch would make the combined work AGPL-3.0.
- §13 (network use): users who interact with the modified program over the network must be offered its **complete corresponding source**. For a web service that means publishing the VidFetch source involved under AGPL.
- **Recommendation: copy no EGM code.**
  - Ideas, behaviours and architecture are not covered by copyright.
  - yt-dlp itself is **Unlicense** (public domain), so it can be used directly.
  - Bundled tools keep their own licenses: FFmpeg (LGPL or GPL depending on the build), Deno (MIT), Electron (MIT), Flask (BSD-3).
- Any exception needs a written legal review first.

## 2. Why YouTube fails from OVH

**Facts:**
- PR #6, 13/10, from the OVH address, without authentication, on Creative Commons media: **5 attempts out of 5 refused**, with stable 2026.08.19 and nightly 2026.10.10, in 2–3 s, with `LOGIN_REQUIRED` / "Sign in to confirm you're not a bot".
- No HTTP 403 or 429, the watch page loads, Node and EJS are up to date.

**Diagnosis:**

| # | Question | Answer |
|---|---|---|
| 1 | Do versions or dependencies need an update? | **No.** yt-dlp 2026.08.19 is the latest stable on 21/10; the nightly fails the same way; Node and EJS are present. EGM uses the same yt-dlp floor. Keep watching releases and update through the reviewed procedure when one fixes YouTube. |
| 2 | Is there an official way to process authorized public videos? | **Not for downloading other people's videos.** The YouTube Terms forbid downloading except through a download feature YouTube provides. The YouTube Data API serves metadata, not media. Official routes exist **only for the creator's own content** (YouTube Studio, Google Takeout) and the YouTube Premium offline feature, which are all outside our service. |
| 3 | Is the main problem the OVH IP? | **Most likely yes.** YouTube asks datacenter IPs to prove they are not bots (login or a PO token), while residential tests worked. The extent and the duration of the block are unknown: one address, over four minutes. |
| 4 | What can be done on the server within our rules? | **Nothing that would make it work reliably.** The usual "fixes" (account cookies, PO-token generators such as bgutil, residential or rotating proxies, client spoofing) all get around YouTube's bot protection. They are excluded by our rules and contrary to the YouTube Terms. What can be done: classify the error clearly (PR #7), keep YouTube "unavailable" in the interface and the SEO pages, and run **one authorized re-test** per quarter, or after a relevant yt-dlp release, on a Creative Commons video. |
| 5 | Would an optional local app help? | **Technically, partly**: it would run on the user's IP. But it would be a separate product: signing, updates, support, the attack surface of a local server, and legal exposure as the distributor of a YouTube downloader (see the 2020 youtube-dl takedown). It could not reuse EGM code because of the AGPL. **Not recommended now.** |

**YouTube is not functional on VidFetch, and nothing in this study shows otherwise.**

## 3. A safe multi-platform design

**Goal.** The user pastes any video link; VidFetch says which supported platform it is, offers the formats that really exist, or explains clearly why it cannot.

```
paste URL ─► 1. parse + normalise (http/https only, no credentials, length bound)
          ─► 2. platform registry lookup (host + path patterns) ─► unknown host → "not supported" (no fetch at all)
          ─► 3. short-link resolution: HEAD/GET hop by hop, max 3 hops, every hop re-checked against the SAME
                platform's host list and assertPublicUrl (no cross-platform or private redirect)
          ─► 4. engine (isolated netns): yt-dlp --use-extractors <the platform's extractor keys only>
                (never "generic"), --no-playlist, existing size / duration / time limits
          ─► 5. validateMediaDestinations on every format URL (+ optional CDN host allowlist per platform)
          ─► 6. formats: MP4 (H.264/AAC preferred, remux only), MP3 192 kbps; others hidden
          ─► 7. errors mapped per platform (login wall, private, region, rate limit, extractor broken, outage)
```

**What does not change:**
- Turnstile, the gateway grants and proof of possession;
- quotas (8 per address and per browser, 100 per day in total), the 256 MiB limit, 30 min, 600 s;
- one operation at a time and the queue;
- the egress filter and the netns.

**Platform registry**, a single data file with one entry per platform:
- host and path patterns, and extractor keys;
- a status: `disabled`, `experimental` or `validated` (date and evidence);
- an SEO gate, which only allows `validated` platforms to be claimed;
- the formats offered;
- error notes.

**Cost of this registry.** It feeds the detector, which today is compiled into the **engine and the gateway**. Every new platform therefore changes both protected bundles:
- the CI promoter refuses such a release;
- PR #16 only covers a **gateway** change;
- **an engine-change procedure still has to be written and reviewed.**

So the registry is worth building once, with platforms switched on through `validated` entries, and each switch-on goes through the reviewed procedure.

### Platforms, in priority order

Feasibility is estimated from experience with yt-dlp extractors and datacenter IPs. **None has been tested from OVH**: each needs one authorized probe on content we may use, plus a ToS reading.

| Rank | Platform | Content | Server-side feasibility (estimate) | Access conditions and risks | Recommendation |
|---|---|---|---|---|---|
| 1 | **Vimeo** | public videos | good (maintained extractor; private, password-protected or domain-restricted videos refused) | Vimeo terms: downloads only where the owner enabled them. Consider offering only the owner-enabled "download" renditions. | GO for one probe and a legal reading |
| 2 | **Dailymotion** | public videos | good (geo restrictions possible) | ToS reading needed | GO for one probe |
| 3 | **Twitch clips** | public clips (short) | good (clips are short; VODs may be sub-only) | ToS; clips only at first | GO for one probe |
| 4 | **Bluesky** | public video posts (HLS) | probably good (extractor exists) | ToS of the PDS/AppView; small volume | GO for one probe |
| 5 | **Reddit** (v.redd.it) | public posts (DASH, needs a merge) | uncertain: Reddit often refuses unauthenticated datacenter traffic | API/ToS restrictions | probe, low expectations |
| 6 | **Streamable, Rumble** | public videos | good | small demand | later |
| 7 | **Facebook** (public videos, Reels) | public | **poor**: frequent login walls and rate limits from servers, unstable extractor | Meta terms forbid automated collection without permission | **NO-GO for now** |
| 8 | **SoundCloud** | audio | medium | downloads only where the artist enabled them | NO-GO unless limited to "downloadable" tracks |
| 9 | **Kick** | VOD | broken (yt-dlp #17284, 404 on VODs) | — | NO-GO until fixed upstream |
| — | Threads, LinkedIn, Snapchat | — | login walls | — | NO-GO |

**The current platforms are not all proven in production either.** TikTok has production evidence. Instagram and X do not yet: in D3, no production reservation matched the user's successful tests. They need the same proof before any public claim.

## 4. Small, independent PRs

| PR | Content | Protected bundles | Prerequisite |
|---|---|---|---|
| A | **#7** (error classification), already open | engine + gateway | engine-change procedure (B) |
| B | **Reviewed engine-change procedure** (`activate-reviewed` extended to the engine, like PR #16 for the gateway) plus its tests | none (admin tooling) | — |
| C | **Platform registry**, data-driven, no new platform; `--use-extractors` restricted per platform (defence in depth: generic extractor never used) | engine + gateway | B |
| D | **Hop-by-hop short-link resolver** generalised (Instagram share resolver → registry), SSRF negative tests | engine | C |
| E | **Probe runbook and harness**: one authorized request per platform from OVH, on usable content, rate-limited, evidence recorded; offline fixture tests per platform | none | — |
| F1, F2… | **One platform per PR** (Vimeo, Dailymotion, Twitch clips, Bluesky), entry `experimental`, then `validated` after the production probe | engine + gateway (registry) | C, E, legal reading |
| G | **SEO**: generic hub + platform pages generated **only** from `validated` registry entries | frontend only | at least one F validated |
| H | **Funnel beacon** (aggregate counters: SEO page view → analysis → download done, per page and day; no IP, no cookie) and privacy text | frontend only | owner approval |

## 5. Tests, risks, costs and compatibility

**Tests:**
- Unit:
  - detection and normalisation per platform;
  - redirect resolution (cross-platform, private, IPv6, decimal and octal IPs, DNS rebinding);
  - extractor restriction;
  - format selection (MP4 remux, MP3).
- Engine integration: with recorded yt-dlp JSON fixtures.
- Real netns egress test: private destinations dropped.
- Gateway end-to-end: with a mocked engine.
- Quota, size and time limits unchanged.
- SEO tests: claims gated by `validated`.
- **Production probes:** one per platform, authorized, before `validated`.

**Risks:**
- **Legal and ToS:** each platform's terms; DMCA notices. Keep "only content you own or may use", the report and takedown flow, and no YouTube.
- **AdSense:** Google's publisher policies restrict monetising tools that facilitate copyright infringement, and YouTube download features increase that risk. Check before adding YouTube-like features.
- **Datacenter blocking:** any platform can start refusing OVH; the registry status and errors must make that visible quickly.
- **Maintenance:** extractors break. yt-dlp updates are an admin tool change (pinned binary, checksum, tests) through their own reviewed procedure.
- **Abuse and bandwidth:** more platforms bring more traffic. The current caps (100 downloads and 4 GiB per day, one operation at a time on 2 vCPU and 3.8 GB RAM) will saturate first. Capacity scaling (queue, second engine host) must be planned before any broad "any site" positioning.

**Costs:** no new paid service. CPU for merges and MP3 grows with use. Bandwidth is mostly egress of media through the gateway. Engineering per platform: one small PR plus a probe plus a legal reading.

**Compatibility:**
- no change to the browser flow, Turnstile or grants;
- an MP3 and MP4 contract identical for every platform;
- every registry change goes through the reviewed engine and gateway procedure.

## 6. SEO and GEO roadmap tied to features

| Target query | Intent | Page | When |
|---|---|---|---|
| download video from link, video downloader by URL, online video downloader | generic | the **home page** of each language (hub), listing only validated platforms, with a dynamic "Supported sites" table carrying a validation date | today's home + list = TikTok only; extended as platforms are validated |
| télécharger une vidéo depuis un lien | generic, FR | `/fr/` home (hub) | same |
| MP4 video downloader | format | section of the hub (MP4 container and codecs, remux, limits). A separate page only if Search Console shows distinct demand; avoid cannibalising the home. | after the first Search Console readings |
| platform + downloader (Vimeo, Dailymotion…) | platform | one page per validated platform (existing gated catalogue) | after each production validation |

**Rules:**
- claim only validated platforms and formats;
- no "any site" or "all platforms" wording;
- YouTube pages stay unpublished;
- home title and H1 changes go through the page-level override (no dictionary change, so no gateway change) or the gateway window.

**GEO:**
- the same identity sentence everywhere;
- a "Supported sites" table with validation dates and limits, readable in the HTML;
- a FAQ answering "which sites", "why not YouTube" and "limits";
- no promise that `llms.txt` or any markup guarantees citations.

## 7. GO / NO-GO

| Option | Decision | Reason |
|---|---|---|
| Update yt-dlp now | **NO-GO** | already the latest stable; nightly fails the same on YouTube |
| YouTube server-side with cookies, PO tokens, proxies or client spoofing | **NO-GO** | bypasses YouTube's protection; forbidden by our rules and the YouTube Terms |
| YouTube "official" server-side method | **NO-GO** | none exists for third-party content |
| One authorized YouTube re-test from OVH (Creative Commons video) | **optional GO** | refreshes the evidence; low expected value |
| Optional local app | **NO-GO now** | separate product, legal exposure, support cost; EGM code unusable (AGPL) |
| Reuse EGM code | **NO-GO** | AGPL-3.0 §13; use ideas only, yt-dlp directly |
| Engine-change procedure (PR B) | **GO** | prerequisite to every engine change, PR #7 included |
| Platform registry + extractor restriction (PR C, D) | **GO after B** | security and maintainability |
| Vimeo, Dailymotion, Twitch clips, Bluesky | **GO for one authorized probe each**, then decide | feasibility unproven from OVH |
| Reddit | probe, low priority | datacenter refusals likely |
| Facebook, SoundCloud (beyond "downloadable"), Kick, Threads, LinkedIn | **NO-GO** | login walls, terms or broken extractor |
| Generic "download video from link" SEO | **GO, limited to validated platforms** | the hub is the home; no broad claim |
