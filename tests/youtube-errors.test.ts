import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyEngineFailure } from "../src/lib/engine";
import { errorMessage } from "../src/i18n/errors";
import { dictionaries } from "../src/i18n/dictionaries";

// YouTube audit of 13 Oct 2026 (docs/VIDFETCH-YOUTUBE-AUDIT.md). Messages are either captured from
// yt-dlp 2026.08.19 on the OVH VPS / offline, or copied from that version's extractor source.
// For the captcha case only the suffix is yt-dlp's wording; the leading reason is illustrative.
// Nothing here changes behaviour: passing tests pin what already works, `todo` tests record the gaps.
const hint = "Use --cookies-from-browser or --cookies for the authentication. See  https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp  for how to manually pass cookies. Also see  https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies  for tips on effectively exporting YouTube cookies";
const botCheck = `ERROR: [youtube] aqz-KE-bpKQ: Sign in to confirm you’re not a bot. ${hint}`; // captured on OVH, engine flags
const ageGate = `ERROR: [youtube] xxxxxxxxxxx: Sign in to confirm your age. This video may be inappropriate for some users. ${hint}`;
const privateVideo = `ERROR: [youtube] xxxxxxxxxxx: Private video. Sign in if you've been granted access to this video. ${hint}`;
const sessionLimit = "ERROR: [youtube] xxxxxxxxxxx: This content isn't available, try again later. The current session has been rate-limited by YouTube for up to an hour. It is recommended to use `-t sleep` to add a delay between video requests to avoid exceeding the rate limit.";
const captcha = "ERROR: [youtube] xxxxxxxxxxx: Playback on other websites has been disabled. YouTube is requiring a captcha challenge before playback";
const forbidden = "ERROR: unable to download video data: HTTP Error 403: Forbidden";
const missingFormat = "ERROR: [youtube] xxxxxxxxxxx: Requested format is not available. Use --list-formats for a list of available formats";
const dnsFailure = "ERROR: [youtube] aqz-KE-bpKQ: Unable to download API page: HTTPSConnection(host='www.youtube.com', port=443): Failed to resolve 'www.youtube.com' ([Errno -3] Temporary failure in name resolution)"; // captured offline
const code = (stderr: string) => classifyEngineFailure(1, stderr, "youtube").code;

describe("YouTube failures seen or expected on the OVH engine", () => {
  it("keeps real account requirements, private videos, rate limits and 403s apart", () => {
    assert.equal(code(ageGate), "AUTH_REQUIRED");
    assert.equal(code(privateVideo), "PRIVATE");
    assert.equal(classifyEngineFailure(1, sessionLimit, "youtube").status, 429);
    assert.equal(code(captcha), "UPSTREAM_BLOCKED");
    assert.equal(code(forbidden), "UPSTREAM_BLOCKED");
    assert.equal(code("ERROR: [youtube] xxxxxxxxxxx: Unable to download API page: Read timed out. (read timeout=20.0)"), "TIMEOUT");
  });
  it("never tells the visitor that a restriction can be bypassed", () => {
    for (const locale of ["en", "fr"] as const) {
      const text = errorMessage(code(botCheck), dictionaries[locale]);
      assert.equal(text, dictionaries[locale].restricted);
    }
  });
  it("current behaviour: the OVH bot check is reported exactly like an age-restricted video", () => {
    // Documented, not endorsed: see the todo below.
    assert.equal(code(botCheck), code(ageGate));
    assert.equal(classifyEngineFailure(1, botCheck, "youtube").status, 401);
  });
  it("reports the bot check on a public video as a server-side block, not as missing authorization", { todo: "engine change: needs an administrator engine release (the CI guard refuses changed engine bundles)" }, () => {
    assert.equal(code(botCheck), "UPSTREAM_BLOCKED");
    assert.doesNotMatch(classifyEngineFailure(1, botCheck, "youtube").message, /cookies|authorized session/i);
  });
  it("does not present a missing format as an unavailable video", { todo: "engine change" }, () => {
    assert.notEqual(code(missingFormat), "UNAVAILABLE");
  });
  it("distinguishes a server network failure from a generic engine error", { todo: "engine change" }, () => {
    assert.notEqual(code(dnsFailure), "ENGINE_ERROR");
  });
  it("does not show 'service temporarily unavailable' for a video that is itself unavailable", { todo: "frontend-only change in src/i18n/errors.ts" }, () => {
    assert.notEqual(errorMessage("UNAVAILABLE", dictionaries.en), dictionaries.en.backendUnavailable);
  });
});
