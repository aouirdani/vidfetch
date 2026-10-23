# Direct download (no new tab): security, compatibility and deployment

**Goal.** "Download MP4/MP3" no longer opens `dl.vidfetch.app/download-helper` in a new tab. The same helper runs in a hidden iframe of the page.

**Production.** Unchanged until each step below is explicitly authorized.

## 1. Why there was a tab, and what changes

The file must be downloaded from the gateway origin (`dl.vidfetch.app`), for three reasons:
- **Cookie.** The single-use cookie `__Secure-vidfetch-transfer` (HttpOnly, SameSite=Strict, `Path=/api/download`) is set by `/auth/transfer` on that origin.
- **Origin.** The gateway refuses the ticket `GET` unless it carries `Sec-Fetch-Site: same-origin`, meaning it must come from a `dl.vidfetch.app` document.
- **Framing.** The helper used to forbid framing (`frame-ancestors 'none'`), so only a separate window could host it.

The helper therefore stays on `dl.vidfetch.app`. It now runs in a **hidden iframe**, which changes two things:

| Before | After |
|---|---|
| `window.open(…/download-helper)`: a tab or popup | `<iframe hidden sandbox="allow-scripts allow-same-origin allow-downloads">` |
| `frame-ancestors 'none'` | `frame-ancestors` = the site's **exact** origins (`VIDFETCH_SITE_ORIGINS`, i.e. `https://vidfetch.app` in production); any value that is not an exact origin falls back to `'none'` |
| The helper obeys `opener` | The helper obeys `parent` when framed, otherwise `opener` (old frontend) |

**Unchanged:**
- Turnstile, then a 2-minute grant bound to the browser key, then request proofs;
- the single-use cookie bound to the ticket, `Sec-Fetch-Site: same-origin`, ticket expiry (55 s);
- quotas and the single concurrent transfer.

**Streaming.** The file is a native streamed `Content-Disposition: attachment` download; it never passes through the page's memory.

### iframe permissions

| `sandbox` token | Why it is needed | Proof |
|---|---|---|
| `allow-scripts` | the helper is a script (nonce, strict CSP) | without it nothing happens |
| `allow-same-origin` | keeps the helper's real origin `dl.vidfetch.app`; otherwise its origin would be opaque, so no cookie, no `same-origin`, gateway refusal | — |
| `allow-downloads` | lets the attachment be saved | **without it, no file is saved** (Chromium, Firefox, WebKit) |

**Not granted:**
- `allow-top-navigation`: the helper cannot navigate the site;
- `allow-popups`: no window;
- `allow-forms`, `allow-modals`.

`allow-scripts` + `allow-same-origin` would let a frame lift its own sandbox **only if it were same-origin with the page**. That is not the case here (`dl.` ≠ apex), so the sandbox holds.

### Who can use the helper

| Who | Result | Proof |
|---|---|---|
| Another site | cannot frame the helper (CSP `frame-ancestors`) | blocked in all 3 engines |
| Another subdomain of the same site | cannot frame the helper either | blocked in all 3 engines |
| A page that frames or opens it | the helper only accepts messages from **its** window (`event.source === host`) and from an allowed origin | — |
| Anyone, with a stolen ticket | useless without the HttpOnly cookie and the same-origin request | — |

## 2. Tests

| Suite | Where | What it covers |
|---|---|---|
| `backend/gateway/tests.test.ts` | CI | framing policy (exact origins, fallback to `'none'`), parent/opener guard, CSP served by the gateway |
| `tests/i18n.test.ts` | CI | helper of every language: `event.source!==host`, `frame-ancestors https://vidfetch.app` |
| `scripts/i18n/verify-site.mjs` | CI (Chromium, 8 languages) | download with no tab or popup, helper loaded exactly once, page unchanged, iframe removed after completion |
| `backend/gateway/browser-download.e2e.ts` (`node backend/gateway/run-browser-download.mjs`) | local, **not in CI** (needs Firefox and WebKit) | see below |

The local end-to-end harness uses the real gateway, real helper, real access issuer and real client. They run on two origins of one site (`app.example.com` and `dl.example.com` through a local proxy; nothing leaves the machine), in real browsers. It checks:
- MP4 and MP3 byte for byte, with no tab;
- `Sec-Fetch-Site: same-origin` and the single-use cookie;
- used ticket refused, expired ticket refused;
- cancel;
- removing the frame while a file is saving;
- framing refused for another origin and for another site.

Results:
- **Chromium, Firefox, WebKit (Linux)** and **Chromium, WebKit (macOS)**: 11/11 each.
- Compatibility scenarios: `BROWSER_E2E_SCENARIO=popup|refused|no-downloads`, see §3.

## 3. Compatibility between versions

| Frontend | Gateway | Result | Evidence |
|---|---|---|---|
| current (tab) | current | production today | — |
| **current (tab)** | **new** | ✅ works (the helper still obeys `opener`) | `popup`: Chromium, WebKit macOS, Firefox |
| new (iframe) | new | ✅ target | harness 11/11 |
| **new (iframe)** | **current** | ❌ **safe failure**: no download, no tab, nothing sent to `/auth/transfer`, message "download channel could not connect" after ≤ 15 s | `refused`: Chromium, Firefox, WebKit |

**Consequence: the gateway must be upgraded before the frontend.**

**Old popup flow and Linux WebKit.** Under Playwright, the old popup flow also fails in Linux WebKit **with the current gateway**: it is a limit of that environment, not a regression. It passes in macOS WebKit.

## 4. Behaviour expected on real devices (not tested: no devices)

Emulation would not prove anything here: what matters is how the system handles downloads.

### Safari iOS (iOS 16.4 or later recommended)
- **Expected:**
  - after the click, the button shows "Préparation en cours…" with a "Annuler" link;
  - once ready, Safari shows its download confirmation or banner (depending on the version: "Télécharger" / arrow icon in the address bar);
  - the file goes to **Fichiers › Téléchargements**;
  - **no new tab**, and the VidFetch page stays displayed.
- **Cookies.** `dl.vidfetch.app` is the same site as `vidfetch.app` (same registrable domain), so Safari's tracking protection should treat the cookie as first-party.
- **To check:**
  1. MP4 plays (Fichiers, then Photos if saved there) and MP3 plays.
  2. A second download after a new tap works.
  3. "Annuler" during preparation stops cleanly.
  4. Turnstile visible and passed.
  5. **Private browsing** and **Lockdown Mode**: note the behaviour.
  6. Any message after ≤ 15 s ("could not connect") → note the iOS version.
- **iOS before 16.4:** the `allow-downloads` token is unknown there, and is then ignored. The download should still work; to be confirmed if such a device is available.

### Chrome Android
- **Expected:**
  - "Préparation en cours…", then the system "Téléchargement…" notification or banner, then "Ouvrir";
  - the file lands in **Téléchargements**;
  - **no new tab**.
- **To check:**
  1. MP4 and MP3 play.
  2. **Second download:** Chrome may ask to "allow multiple downloads". A new tap on the button is a user gesture, so normally no prompt.
  3. Screen locked during the transfer.
  4. Mobile data saver.
  5. "Annuler" during preparation.
  6. Samsung Internet if available.

### On every device
- **Each attempt:** time, OS and browser version, OK/KO for each step, error code shown if any. **Never** copy a ticket, cookie or token.
- **On failure on a device:**
  - security failures are impossible by design (the ticket is useless without the cookie), so the worst case is an error message;
  - if a widespread platform fails, roll the frontend back (§5, rollback of phase B). The new gateway still supports the tab.

## 5. Progressive deployment with rollback

### Prerequisites (each one authorized separately)

1. **D4 done.** `guard-update.py accept /etc/vidfetch/web.env`, guard at 19/0. The CI promoter refuses any deployment while a guarded file differs, and `web.env` has changed since `11-downloads.sh open`.
2. **Split into two releases (recommended).** The text files (`src/i18n/messages/*.json`) are **embedded in the gateway bundle**, so any change to them changes its fingerprint.
   - **A: gateway + texts.** `helper.ts`, the 8 language files (`cancel` label), and the gateway and i18n tests. The frontend still opens the tab.
   - **B: frontend.** `secure-client.ts`, `VideoCard.tsx`, `verify-site.mjs`, the end-to-end harness. Its gateway bundle is **identical** to A's.

   This PR can be merged in two steps, A then B, or as one block with a short closure of downloads (variant below).

   Fingerprints checked on 2026-10-20:

   | Bundle | `main` (production) | This branch, A alone, A+B |
   |---|---|---|
   | gateway | `0fa1404530c2…` | `4718ed7ed9d7341c…` (A alone = A+B, so B passes the promoter once A is active) |
   | engine | `fa0d3d4e15a5…` | **unchanged** |
3. **Administrator-reviewed activation of a release whose gateway changed: to be built.**
   - The CI promoter (`promote.py verify|deploy`) refuses such a release on purpose: `Engine/gateway artifact changed; separate administrator review required`. **This lock is not bypassed.**
   - The tool that performs this review does **not exist yet**.
   - **Proposal** (separate PR, with tests, installed by the administrator via `09-ci-helper.sh`): a root-only `activate-reviewed.py`, never callable by the CI account, modelled on `rollback.py`. It refuses `SUDO_USER=vidfetch-deploy` and reuses the promoter's functions. It **only** accepts a release:
     - already transferred and verified (`operation=verify`);
     - whose **engine is unchanged**;
     - whose gateway bundle equals **the fingerprint the administrator rebuilt independently** from the merged commit (`node backend/gateway/build.mjs` then `sha256sum`).

     It then switches through the promoter's own `switch()` (same checks, `pending.json` / `previous.json`, so `rollback.py` keeps working). Each run is logged.

### Phase A: gateway first (no download interruption)

| Step | Command (VPS unless noted) | Expected |
|---|---|---|
| A0 Read-only state | snapshot + `00-preflight.sh`; `gh variable get VIDFETCH_DEPLOY_ENABLED` | `false`, guard 19/0, `ready=1`, `public-downloads` profile |
| A1 CI build of A | merge A into `main` (push run) | build success, deploy skipped |
| A2 Transfer without activation | `gh workflow run deploy.yml --ref main -f operation=verify -f artifact_run_id=<build>` | release verified, **not active** |
| A3 Independent fingerprint | locally: `git checkout <A>` then `node backend/gateway/build.mjs /tmp/g.cjs && sha256sum /tmp/g.cjs` | identical to the release manifest |
| A4 Reviewed activation | `sudo …/activate-reviewed.py <sha> <checksum> <gateway sha256>` | frontend A active, tab flow **unchanged** |
| A5 Gateway | `sudo bash 08-gateway.sh check <sha256>` then `upgrade <sha256>` (no `--origin-dl`, already done) | `UPGRADED`, `helper_fr=200 localized=True`, `deployment_signed=200`, `engine_health=200` |
| A6 Guard | `sudo python3 guard-update.py add …/20-gateway-release.conf /opt/vidfetch/releases/gateway-<16>/vidfetch-gateway.cjs`, then `accept` if listed | 0 differing |
| A7 Real tests | browser: MP4/MP3 via the **tab** (the old flow on the new gateway) + `verify-outsider.sh --public-dl` from the outside | everything OK, 401 anonymous |

**Rollback A** (any order, both tab-compatible):
1. `sudo bash 08-gateway.sh rollback`: bundle, environment and drop-in exactly as before, with verification.
2. `sudo /usr/local/libexec/vidfetch-ci/rollback.py`: frontend back to the previous release.
3. Put the guard's previous version back (`ci-web-test-guard.json.bak.<time>`).

### Phase B: frontend (iframe)

| Step | Command | Expected |
|---|---|---|
| B1 CI build of B | merge B | build success; **gateway bundle = A's** |
| B2 Transfer | `operation=verify` | verified |
| B3 Normal deployment (promoter accepts: gateway unchanged) | `VIDFETCH_DEPLOY_ENABLED=true` → `operation=deploy -f artifact_run_id=<verify>` → back to `false` | release B active; only the frontend restarts (a few seconds) |
| B4 Real tests | desktop Chrome, Safari, Firefox, then iPhone and Android (§4); `seo-check-open.sh`, `d3-monitor.sh`, leak scan | no tab, MP4/MP3 OK, SEO OK, no secret, no 5xx |

**Rollback B:** `sudo /usr/local/libexec/vidfetch-ci/rollback.py`. Back to frontend A (tab), right away; the gateway stays new and compatible.

### Variant: a single release (no split)

One downloads-closed window, a few minutes long:
1. `11-downloads.sh close`.
2. Reviewed activation of the release.
3. `08-gateway.sh upgrade`.
4. `11-downloads.sh open`.
5. Real tests.
6. Guard: `accept` for `web.env` (moved by `set-ready`) + `add` for the gateway.

**Rollback:**
1. `11-downloads.sh close`.
2. `rollback.py`.
3. `08-gateway.sh rollback`.
4. `11-downloads.sh open`.

The order matters: never leave the new frontend facing the old gateway while downloads are open.

### Invariants
- `VIDFETCH_DEPLOY_ENABLED` is `true` only for the duration of a CI `deploy`.
- No change to Caddy, nftables, SSH, Turnstile or quotas.
- The promoter lock is never bypassed.
- Every switch is followed by real tests before the next step.
- Any anomaly triggers the rollback for that phase.
