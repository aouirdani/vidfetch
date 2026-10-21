# VidFetch — SEO and GEO audit, plan and PR (21 October 2026)

**Scope.** The production site https://vidfetch.app (release `64a243ed`) and the code on `main` (`070287ce`). Nothing in production was changed.

**Evidence collected** (scratchpad of the session, not in the repository):
- a read-only crawl of every served URL (status codes, head, headings, JSON-LD, hreflang);
- redirect and crawler User-Agent probes;
- Lighthouse 12.6.1 mobile runs on the live site;
- a code review of the routes, the content gates and the engine and gateway limits.

**Not available in this session:**
- Search Console data, beyond the figures given by the owner;
- verified search volumes;
- SERP and backlink data;
- field Core Web Vitals (CrUX) for an origin with this little traffic.

## 1. Audit

### Inventory

| Route family | Served | Indexable | Notes |
|---|---|---|---|
| Home × 8 languages (`/`, `/fr/`, `/es/`, `/pt/`, `/id/`, `/de/`, `/it/`, `/ar/`) | 200 | yes | in the sitemap; reciprocal hreflang across all 8, plus `x-default` = `/` |
| Legal × 8 | 200 | yes | in the sitemap |
| Historical English landings (`/tiktok-video-downloader`, `/instagram-reels-downloader`, `/twitter-video-downloader`, `/youtube-video-downloader`) | 200 | **noindex** | title "… — Platform availability is being verified", 138–169 words |
| `/blog` and 10 English guides | 200 | **noindex** | the guides are `ready` but have no `published` date |
| Guide translations (70) | — | no | `review` status |
| Localized platform pages (11 intents × 8 slugs in `content/platforms/catalogue.json`) | 404 | no | every gate is `false` and there is no copy |
| `/fr/blog`, unknown paths, `/en` | 404 | `noindex` | correct |

**Redirects:**
- `http` → `https`: 308;
- `www` → apex: 301;
- `/fr` → `/fr/`: 308;
- `/legal/` → `/legal`: 308;
- `/FR/` → `/FR` → 404.

All of them are correct and single-hop.

`robots.txt` allows everything except `/api/`, `/auth/`, `/download-helper`, `/test/` and `/staging/`, and declares the sitemap. There is no AI-crawler rule, and no Cloudflare managed `robots.txt` content.

### Findings

| Sev. | Finding | Evidence | Action |
|---|---|---|---|
| **P0** | **No indexable page targets a non-brand intent.** The 16 indexable URLs are 8 homes and 8 legal pages. Platform pages and guides exist in code but are gated or unpublished. This alone explains why Search Console shows only "vidfetch" and "video fetch". | sitemap: 16 URLs; catalogue: 0 copy, all gates false; guides: `published` null | PR: copy for six priority pages, published page by page after approval (§3) |
| **P0** | **Instagram and X are not evidenced on production.** D3 recorded 6 user PASS but only 3 production reservations, all before 19:15:11 UTC on 20 October. TikTok is the only platform with production evidence. Pages promising Instagram or X before that proof would be misleading. | `d3/RESULTS.md`, ledger snapshots | gate `authorizedMediaVerified` stays false for Instagram and X until a before/after ledger check |
| **P1** | **Live misleading YouTube claims.** The web manifest says "Download … from YouTube" and offers a YouTube shortcut; the social image says "YouTube · TikTok · Instagram · X". YouTube is blocked by the provider's anti-bot checks. | `/manifest.webmanifest`, `og-image-v2.jpg` | fixed in the PR (manifest, new `og-image-v3.jpg`) |
| **P1** | Unused code in `seo.ts` carries false claims: `HOME_FAQS` says the site "shows no advertising" (AdSense is on every page), and the schema defaults present YouTube as working. Harmless today, wrong the day it is reused. | `src/lib/seo.ts` | fixed in the PR |
| **P1** | Home H1s are slogans ("A video worth keeping. A simple way to save it.") with no descriptive term, and home titles are generic. Acceptable for the brand query; weak for discovery. | crawl | proposed for a later PR (§3, "not in this PR") |
| **P2** | The supported-links hint on every page still lists YouTube ("Recognizes … YouTube … links. Availability varies by source"). The FAQ is explicit that YouTube access is blocked, so this is nuanced but not ideal. | crawl | needs a dictionary change: see the gateway constraint below |
| **P2** | The H1 is rendered as two lines with no space in the text ("keeping.A simple"). Visual only. | crawl | later |
| **P2** | A cold-cache first view was slow: Lighthouse mobile scored 75, LCP 5.0 s, FCP 2.9 s. Warm runs score 98 (LCP 1.1–1.2 s, CLS 0, TBT 100–180 ms). Third parties: AdSense (222 KiB) and Funding Choices (73 KiB); 228 KiB of unused JavaScript on a cold run. Performance is not the bottleneck. | Lighthouse JSON | none for now; the Cloudflare edge cache of HTML could be revisited later (needs a Caddy/Cloudflare decision) |
| **P2** | Next.js logs "Failed to update prerender cache … ENOENT" for every random path probed by Internet scanners, because the release directory is read-only. Noise only. | frontend journal | later (frontend configuration) |
| OK | Canonicals self-reference; hreflang is reciprocal with `x-default`; `<html lang>` and `dir` (RTL for Arabic) are correct. | crawl | — |
| OK | Content is server-rendered: headings, copy and FAQ are present in the HTML without JavaScript. The download tool itself needs JavaScript. | crawl | — |
| OK | Lighthouse SEO, accessibility and best practices: 100. No `noindex` on indexable pages; no blocked resources. | Lighthouse | — |
| OK | Crawler access: Googlebot (desktop and mobile), Bingbot, GPTBot, OAI-SearchBot, ChatGPT-User, PerplexityBot, ClaudeBot, Applebot and CCBot User-Agents all get 200 on `/`, `/fr/` and `robots.txt`. | UA probes | Real bots are identified by IP; check Search Console URL Inspection and Cloudflare Security → Events once pages are published |
| OK | The structured data on the homes is truthful: Organization, WebSite, WebPage, FAQPage mirroring the visible FAQ, WebApplication (free, no rating) and HowTo. The FAQ says YouTube is blocked. | crawl | FAQPage and HowTo no longer produce rich results on Google; they stay as plain, truthful markup |
| OK | No duplication or cannibalization today: one home per language, distinct titles. | crawl | The new pages each target one intent, distinct from the home (§2) |

**Hard constraint discovered.** The gateway bundle embeds the i18n dictionaries (`src/i18n/messages/*.json`).
- Any wording change there changes the gateway, and the CI promoter then refuses the release ("Engine/gateway artifact changed").
- That would require the reviewed gateway procedure (PR #16, window W0–W7).
- So the SEO PR keeps all its copy **outside** the dictionaries.
- Engine and gateway bundles built from the SEO branch are byte-identical to production: gateway `0fa1404530c272b7`, engine `fa0d3d4e15a5a45c`.

## 2. Keyword and URL map

**Volumes.** No volume is verified: no keyword tool data was available.
- The local `open-seo` instance can query DataForSEO, but that is a paid API and was not used without approval.
- Volumes must come from one of: Search Console impressions after publication, Google Keyword Planner (owner account), or DataForSEO with authorization.

**Difficulty** is an estimate on a 1–5 scale, with this method:
1. **Head-term competition.** Downloader head terms are dominated by long-established single-purpose tools with large link profiles. This comes from general knowledge, not from a SERP measured in this audit.
2. **Our domain.** It is new, with near-zero referring domains.
3. **Specificity.** Long-tail and language-specific variants are easier.

| # | Intent | Main keyword (variants) | Lang | Diff. | Target URL | Page | Potential | Differentiation |
|---|---|---|---|---|---|---|---|---|
| 1 | Save a TikTok video | tiktok video downloader (download tiktok video, save tiktok video, tiktok downloader mp4) | en | 5 | `/tiktok-video-downloader` | historical route, new copy | high volume, slow ranking | video/MP4 intent; share-link and share-text support; honest watermark answer |
| 2 | TikTok sound to audio | tiktok to mp3 (tiktok mp3, tiktok audio download, tiktok sound download) | en | 4 | `/tiktok-to-mp3` | new | medium | audio intent only; real 192 kbps MP3; sound pages not supported (said) |
| 3 | Save a TikTok video, FR | télécharger vidéo tiktok (télécharger tiktok, enregistrer vidéo tiktok, tiktok en mp4) | fr | 3–4 | `/fr/telecharger-video-tiktok` | new | medium, less competition than en | native French copy, hreflang pair with #1 |
| 4 | Save an Instagram Reel | instagram reels downloader (download instagram reel, reels downloader mp4) | en | 5 | `/instagram-reels-downloader` | historical route, new copy | high, **gated on production proof** | Reel-specific; source resolution kept; refusal reasons explained |
| 5 | Save an Instagram video, ES | descargar vídeos de instagram (descargar reels de instagram, bajar video instagram) | es | 3–4 | `/es/descargar-video-instagram` | new | medium, **gated** | native Spanish copy, posts and Reels |
| 6 | Save an X video | twitter video downloader (x video downloader, download twitter video, save x video) | en | 5 | `/twitter-video-downloader` | historical route, new copy | high, **gated** | renditions and bitrates explained; protected posts not accessible |
| 7 | Brand | vidfetch, vid fetch, video fetch | all | 1 | `/` and language homes | existing | already visible | — |

**Next candidates.** These come only after the six pages are indexed and Search Console shows impressions:
- `fr` TikTok en MP3 (`/fr/tiktok-en-mp3`);
- `es` TikTok (`/es/descargar-video-tiktok`);
- `fr` Instagram (`/fr/telecharger-reels-instagram`);
- `pt-BR` TikTok;
- `ar` TikTok.

The catalogue already reserves the slugs. Nothing is created in bulk; each page needs its own copy and evidence.

## 3. The SEO PR (`work/vidfetch-seo-geo-20261021`, not merged)

**What it changes:**
- **Copy for the six priority pages** in `content/platforms/catalogue.json`. Each page has its own title, description, H1, page-specific H2 outline, steps, supported links, limits and FAQ.
- **Facts are limited to what the code enforces:**
  - 256 MB per file;
  - 30 minutes per video;
  - MP3 at 192 kbps;
  - 8 downloads per day per connection;
  - first carousel item only;
  - no watermark removal;
  - public content only.
- **Gates and `published` unchanged:** nothing becomes reachable or indexable until approved.
- **Platform pages, once approved**, also carry:
  - a BreadcrumbList matching the visible breadcrumb;
  - a WebApplication node whose `featureList` is the visible "supported" list;
  - no invented rating.
- **Internal linking.** Each home lists its language's approved platform pages ("Download by platform"), and platform pages link to each other. Nothing appears until a page is approved.
- **Truthful claims:**
  - manifest without YouTube;
  - schema defaults and unused FAQ corrected;
  - new social image `og-image-v3.jpg` without the platform list (`v2` is still served for existing shares).
- **Gateway and engine bundles unchanged:** verified byte for byte against production.

**Not in this PR:**
- **Home titles and H1** would change dictionary strings, and therefore the gateway (see §1). They can be done through a page-level override, the same mechanism as the platform pages, in a follow-up once the platform pages are live.
- **Publishing the 10 English guides** is an owner decision (§7).
- **The funnel measurement beacon** (§5) needs a privacy-text update and its own PR.

## 4. Tests

### New: `tests/seo-pages.test.ts` (15 tests)

**Copy:**
- complete copy for the six pages;
- unique titles (≤ 60 characters with the brand) and descriptions (110–160), distinct from every home;
- one intent and an own H1/H2 outline per page;
- limits stated only when the engine, gateway or quota code enforces them;
- example links accepted by the URL detector;
- no YouTube promise or superlative;
- related guides exist.

**Publication:**
- the pages stay unpublished until every gate is approved;
- once approved, a page is:
  - indexable and self-canonical;
  - linked by reciprocal hreflang with `x-default`;
  - present in the sitemap;
  - described by structured data built from its visible copy;
- a single-language page gets no foreign alternate;
- internal links follow the language and only point to indexable pages.

**Site-wide:**
- manifest and schema defaults without YouTube;
- no "no advertising" claim;
- social image without platform claims.

**Mutations caught:**
- a gate flipped;
- a YouTube claim in a TikTok page;
- the YouTube shortcut put back in the manifest.

### Full suite and builds

- Full suite: 169/169.
- `lint` and `typecheck`: OK.
- `next build`: OK.

**Rendered preview.** A throwaway build with only the TikTok pages, and then also the Spanish Instagram page, approved in a local copy was crawled:
- server-side titles, H1/H2, canonical, hreflang (`en`/`fr`/`x-default`; `es` alone) and the four JSON-LD types are present;
- the sitemap includes the approved pages;
- unapproved pages stay `noindex` or 404;
- the internal links are rendered.

### At deployment (each step authorized)

- CI `validate` on the PR.
- After deployment:
  - read-only crawl of the new URLs;
  - Rich Results Test and Search Console URL Inspection (owner).

## 5. GEO (generative engines)

**Descriptive identity**, to use the same way everywhere (site, directories, profiles):
> VidFetch (vidfetch.app) is a free web app that saves a public video as MP4, or its soundtrack as MP3, from a link — no account, no install. It works with TikTok links today. Instagram and X links are recognized, and are confirmed once tested in production. YouTube is currently unavailable from its hosting.

**Direct answers.** Each platform page answers the real questions in one or two factual sentences: watermark, share links, refusals, limits, MP3 quality, accounts. The facts are verifiable against the code (tested).

**Verifiable facts to keep stable:**
- free, financed by advertising;
- no account;
- a verification step (Cloudflare Turnstile);
- limits: 256 MB, 30 minutes, 8 per day per connection, one preparation at a time;
- MP3 at 192 kbps;
- public content only;
- no permanent copy kept (privacy page).

**Structure.** The HTML is server-rendered, with one H1 per page, an explicit H2 outline, a FAQ in `<details>` (present in the HTML) and JSON-LD consistent with the visible text.

**Crawler access.** Today every AI crawler is allowed, by `robots.txt` and by the absence of a User-Agent block. Two decisions belong to the owner:
- keep allowing answer and search agents (OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude crawlers, Applebot);
- decide on training-only crawlers (GPTBot, CCBot, Google-Extended).

Before the next publication, check Cloudflare → Security → Bots ("Block AI bots", "AI Labyrinth") so that the behaviour seen with spoofed User-Agents matches what real bots get.

**No guarantee.** Neither `llms.txt` nor any markup guarantees a presence in AI answers. Nothing in this plan claims otherwise.

**Measuring AI mentions:**
- **Observable:**
  - referrals from `chatgpt.com`, `perplexity.ai`, `copilot.microsoft.com` and `gemini.google.com`, once the funnel beacon (§6) records the referrer per landing page;
  - a weekly fixed panel of about 20 prompts (en, fr, es) across ChatGPT search, Perplexity, Gemini and Copilot, logging cited or not, with the URL. This is a sample, not a measure of reach.
  - Bot fetches would need an access log on the apex, which is a Caddy change and not part of this work.
- **Not measurable:** how often VidFetch appears in AI answers overall, and whether content was used for training.

## 6. Measurement and distribution

**Daily tracking.** A sheet or a small script reading the Search Console API needs the owner to grant access, through OAuth or a service account added to the property.

| Metric | Source |
|---|---|
| Clicks, impressions, CTR, average position (total and per page) | Search Console API, `searchanalytics.query`, dimension `date` |
| Brand vs non-brand | same, query filter on the regex `vid ?fetch\|video fetch` |
| Indexed pages | Page indexing report (weekly) and URL Inspection API for the new URLs (daily, quota permitting) |
| Top URLs, countries, mobile/desktop | dimensions `page`, `country` and `device` |
| Funnel: SEO page → link analysed → download completed | **not available today**: the gateway ledger only counts downloads per day, globally |

**Proposed funnel beacon** (frontend-only PR, authorization and privacy-text update needed):
- three aggregate counters per landing page and day: view, analysis success and download completed;
- no IP, no cookie, no URL of the media;
- sent to a frontend route.

**Legitimate distribution and editorial links (no paid links, no networks, no automated posting):**
1. **Product listings:** AlternativeTo, Product Hunt (prepared launch, honest feature list), and relevant free-tools directories.
2. **Helpful answers** where self-promotion is allowed: Reddit, Quora and Stack Exchange threads about saving your own TikToks, or converting a TikTok to audio for editing. Disclose the affiliation.
3. **Outreach** to authors of "TikTok downloader" and "save Instagram Reels" comparison articles in en, fr and es, with the factual identity, the limits and the privacy stance. Ask for an evaluation, not a link.
4. **Creator and education angle:** a guide on backing up *your own* videos (the guide already exists and could be published), offered to creator newsletters.
5. **Brand consistency:** the same identity sentence and logo on every profile, for both entity recognition and GEO.

## 7. Calendar, 21 October – 3 November

| Day | Action | Owner | Needs authorization |
|---|---|---|---|
| 21/10 | Audit and PR prepared, not merged | Claude | — |
| 21–22/10 | Finish D3 (`chrome://downloads` check, T1–T4); review the six texts | owner | — |
| 22/10 | D4 (`guard-update.py accept web.env`): prerequisite for any CI deployment | owner + Claude | yes |
| 22/10 | CI `validate` of the SEO PR | Claude | yes |
| 22/10 | Approve TikTok pages (gates; 3 pages) and merge the SEO PR **before PR #15** (see note) | owner | yes |
| 22–23/10 | Deploy through the CI promoter; read-only crawl; Search Console: submit the sitemap, inspect the 3 URLs; Bing Webmaster import | owner + Claude | yes (deployment) |
| 23–24/10 | Instagram and X production proof (one download each, ledger before and after) → approve their pages; decide on the 10 English guides | owner | yes |
| 24–28/10 | Distribution items 1–3; first Search Console reading of impressions per page | owner (accounts) + Claude (drafts) | yes, for anything published under the brand |
| 28–31/10 | Adjust titles and descriptions where impressions show a mismatch (no keyword stuffing); prepare the next pages (fr TikTok MP3, es TikTok) with real copy | Claude | yes, for merge and deployment |
| 1–3/11 | Report: indexing, impressions and clicks per page, brand vs non-brand, funnel (if the beacon is approved) | Claude | — |

**Ordering with PRs #15, #16 and #17.** PR #15 changes the gateway (dictionaries).
- Once it is merged, CI deployments are refused until the gateway window (PR #16, W0–W7) is completed.
- So the SEO PR should be deployed before PR #15 is merged, or after the window.

## 8. Expected impact (assumptions, no ranking promise)

**Starting point:**
- Search Console shows about 5 clicks and 31 impressions in total, all brand;
- 16 indexable URLs;
- 0 non-brand pages;
- a new domain with almost no referring domains.

**Assumptions:**
- the new pages are crawled and indexed within 3–10 days of deployment;
- they first rank beyond page 2 for head terms;
- they reach page 1 only for some fr/es long-tail variants in the first weeks;
- head-term rankings in this niche usually take months and editorial links.

**Scenarios on 3 November:**
- **conservative:** 5–20 organic clicks per day;
- **optimistic:** 30–80 per day, if indexing is fast, fr/es variants reach the top 10 and distribution brings a few links.

**1,000 organic clicks per day by 3 November is very unlikely.** It would require top-3 positions on several high-volume head terms within days of indexing, which a new domain does not get. The objective is better treated as a direction, measured weekly.

## 9. Exact list of changes that need an authorization

1. Pushing this branch and opening the PR: done as preparation, no merge.
2. One CI `validate` run on the PR.
3. For each of the six pages:
   - `copyReviewed` (text review by the owner);
   - `authorizedMediaVerified` (production proof; TikTok has it, Instagram and X do not yet);
   - `permissionToPublish` and `published` (a one-line catalogue commit per page).
4. Publishing the 10 English guides (setting their `published` dates).
5. D4: `guard-update.py accept /etc/vidfetch/web.env`, the prerequisite for any CI deployment.
6. Merging the SEO PR.
7. Deploying: a CI deploy operation with the deploy switch, or the documented manual procedure.
8. Owner-account actions:
   - Search Console: sitemap, URL Inspection, API access for daily tracking;
   - Bing Webmaster Tools;
   - Cloudflare bot settings review.
9. Paid keyword data through DataForSEO (`open-seo`).
10. The funnel-beacon PR and the matching privacy-text update.
11. Any publication under the VidFetch name: directories, Product Hunt, community answers, outreach emails.
