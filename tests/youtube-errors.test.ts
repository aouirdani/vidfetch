import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyEngineFailure, engineContext } from "../src/lib/engine";
import { errorMessage } from "../src/i18n/errors";
import { dictionaries, type Messages } from "../src/i18n/dictionaries";
import { LOCALES } from "../src/i18n/config";

// YouTube audit of 13 Oct 2026 (docs/VIDFETCH-YOUTUBE-AUDIT.md). The bot-check message is the exact stderr captured
// on the OVH VPS with the engine's flags; the DNS failure was captured offline; the other messages are copied from
// the yt-dlp 2026.08.19 extractor source (for the captcha case only the suffix is yt-dlp's wording).
const hint = "Use --cookies-from-browser or --cookies for the authentication. See  https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp  for how to manually pass cookies. Also see  https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies  for tips on effectively exporting YouTube cookies";
const botCheck = readFileSync("backend/tests/fixtures/youtube-bot-check.stderr", "utf8");
const ageGate = `ERROR: [youtube] xxxxxxxxxxx: Sign in to confirm your age. This video may be inappropriate for some users. ${hint}`;
const membersOnly = `ERROR: [youtube] xxxxxxxxxxx: Join this channel to get access to members-only content like this video, and other exclusive perks. Sign in. ${hint}`;
const privateVideo = `ERROR: [youtube] xxxxxxxxxxx: Private video. Sign in if you've been granted access to this video. ${hint}`;
const removed = "ERROR: [youtube] xxxxxxxxxxx: Video unavailable. This video has been removed by the uploader";
const geoBlocked = "ERROR: [youtube] xxxxxxxxxxx: The uploader has not made this video available in your country";
const missingFormat = "ERROR: [youtube] xxxxxxxxxxx: Requested format is not available. Use --list-formats for a list of available formats";
const sessionLimit = "ERROR: [youtube] xxxxxxxxxxx: This content isn't available, try again later. The current session has been rate-limited by YouTube for up to an hour. It is recommended to use `-t sleep` to add a delay between video requests to avoid exceeding the rate limit.";
const captcha = "ERROR: [youtube] xxxxxxxxxxx: Playback on other websites has been disabled. YouTube is requiring a captcha challenge before playback";
const forbidden = "ERROR: unable to download video data: HTTP Error 403: Forbidden";
const dnsFailure = "ERROR: [youtube] aqz-KE-bpKQ: Unable to download API page: HTTPSConnection(host='www.youtube.com', port=443): Failed to resolve 'www.youtube.com' ([Errno -3] Temporary failure in name resolution) (caused by TransportError(\"HTTPSConnection(host='www.youtube.com', port=443): Failed to resolve 'www.youtube.com' ([Errno -3] Temporary failure in name resolution)\"))";
const refused = "ERROR: [youtube] xxxxxxxxxxx: Unable to download webpage: [Errno 111] Connection refused";
const timedOut = "ERROR: [youtube] xxxxxxxxxxx: Unable to download API page: Read timed out. (read timeout=20.0)";
const failure = (stderr: string) => classifyEngineFailure(1, stderr, "youtube");
const code = (stderr: string) => failure(stderr).code;

describe("engine: YouTube failures are told apart", () => {
  it("anti-bot refusal of the server (captured on OVH): a block, not a login requirement", () => {
    assert.match(botCheck, /^ERROR: \[youtube\] aqz-KE-bpKQ: Sign in to confirm you’re not a bot\./);
    const issue = failure(botCheck);
    assert.equal(issue.code, "UPSTREAM_BLOCKED");
    assert.equal(issue.status, 503);
    assert.match(issue.message, /YouTube is refusing automated requests from this server/);
    assert.match(issue.message, /does not bypass/);
    assert.doesNotMatch(issue.message, /cookie|authorized session|sign in/i);
    assert.match(issue.detail ?? "", /not a bot/);  // the raw reason stays available to operators
  });
  it("videos that really need an account: AUTH_REQUIRED", () => {
    for (const stderr of [ageGate, membersOnly, "Login required"]) {
      assert.equal(code(stderr), "AUTH_REQUIRED", stderr.slice(0, 60));
      assert.equal(failure(stderr).status, 401);
    }
    assert.notEqual(code(botCheck), code(ageGate));
  });
  it("videos that are gone, private, region-locked, or whose format vanished: content errors (404)", () => {
    assert.equal(code(privateVideo), "PRIVATE");
    for (const stderr of [removed, geoBlocked, missingFormat, "HTTP Error 404: Not Found"]) {
      assert.equal(code(stderr), "UNAVAILABLE", stderr.slice(0, 60));
      assert.equal(failure(stderr).status, 404);
    }
    assert.match(failure(missingFormat).message, /format is no longer available/);
    assert.match(failure(removed).message, /unavailable, deleted, region-restricted/);
  });
  it("real outages of the service: the server cannot reach the platform", () => {
    for (const stderr of [dnsFailure, refused]) {
      assert.equal(code(stderr), "UPSTREAM_UNREACHABLE", stderr.slice(0, 60));
      assert.equal(failure(stderr).status, 503);
    }
    assert.equal(code(timedOut), "TIMEOUT");
  });
  it("other refusals keep their meaning: rate limit, captcha, HTTP 403", () => {
    assert.equal(failure(sessionLimit).status, 429);
    assert.equal(code(captcha), "UPSTREAM_BLOCKED");
    assert.equal(code(forbidden), "UPSTREAM_BLOCKED");
  });
  it("a video id that looks like an HTTP status does not change the diagnosis", () => {
    assert.equal(code(ageGate.replace("xxxxxxxxxxx", "x-429-abcDE")), "AUTH_REQUIRED");
    assert.equal(code(removed.replace("xxxxxxxxxxx", "a_403_bcdEF")), "UNAVAILABLE");
    assert.equal(code(ageGate.replace("xxxxxxxxxxx", "zz-404-yyyy")), "AUTH_REQUIRED");
    assert.equal(code("ERROR: [youtube] x-429-abcDE: Unable to download API page: HTTP Error 429: Too Many Requests"), "RATE_LIMITED");
  });
  it("other platforms are classified as before", () => {
    assert.equal(classifyEngineFailure(1, "Login required", "instagram").code, "AUTH_REQUIRED");
    assert.equal(classifyEngineFailure(1, "HTTP Error 429 Too Many Requests", "tiktok").status, 429);
    assert.equal(classifyEngineFailure(1, "This is a private account", "instagram").status, 404);
    assert.equal(classifyEngineFailure(1, "Unexpected response from webpage request", "tiktok").code, "UPSTREAM_BLOCKED");
    assert.equal(classifyEngineFailure(1, "something unexpected", "twitter").code, "ENGINE_ERROR");
  });
});

describe("no workaround is introduced", () => {
  it("the engine passes no cookies, proxy, PO token or client override unless the operator configured one", async () => {
    const saved: Record<string, string | undefined> = {};
    for (const name of ["YTDLP_COOKIES_FILE", "YTDLP_YOUTUBE_COOKIES", "YTDLP_PROXY"]) { saved[name] = process.env[name]; delete process.env[name]; }
    try {
      const context = await engineContext("youtube");
      try {
        const flags = context.flags.join(" ");
        assert.doesNotMatch(flags, /--cookies|--proxy|--extractor-args|po_token|player_client|visitor_data|--username|--netrc/);
      } finally { await context.cleanup(); }
    } finally { for (const [name, value] of Object.entries(saved)) if (value !== undefined) process.env[name] = value; }
  });
  it("the classifier and the error mapping contain no retry-with-credentials logic", () => {
    const engine = readFileSync("src/lib/engine.ts", "utf8");
    assert.doesNotMatch(engine, /po_token|player_client|visitor_data|cookies-from-browser|bgutil/);
  });
});

describe("frontend: each situation has its own clear message", () => {
  const shown = (stderr: string, messages: Messages) => errorMessage(code(stderr), messages);
  for (const locale of LOCALES) {
    it(`${locale}: block, account, unavailable video and service outage read differently`, () => {
      const d = dictionaries[locale];
      const texts = [shown(botCheck, d), shown(ageGate, d), shown(removed, d), shown(dnsFailure, d)];
      assert.deepEqual(texts, [d.sourceBlocked, d.loginRequired, d.videoUnavailable, d.backendUnavailable]);
      assert.equal(new Set(texts).size, 4);
      for (const text of texts) assert.ok(text.trim().length > 30, text);
      assert.match(d.sourceBlocked, /VidFetch/);
      if (locale !== "en") for (const key of ["sourceBlocked", "loginRequired", "videoUnavailable"] as const) assert.notEqual(d[key], dictionaries.en[key], key);
    });
  }
  it("the block message blames neither the link nor the visitor, and promises no bypass", () => {
    assert.match(dictionaries.en.sourceBlocked, /Your link is not the problem/);
    assert.match(dictionaries.en.sourceBlocked, /does not bypass/);
    assert.match(dictionaries.fr.sourceBlocked, /ne contourne pas/);
    for (const locale of LOCALES) assert.doesNotMatch(dictionaries[locale].sourceBlocked + dictionaries[locale].loginRequired, /cookie/i);
  });
  it("a video that is itself unavailable is no longer announced as a service outage", () => {
    for (const locale of LOCALES) {
      const d = dictionaries[locale];
      assert.notEqual(errorMessage("UNAVAILABLE", d), d.backendUnavailable);
      assert.equal(errorMessage("BACKEND_UNAVAILABLE", d), d.backendUnavailable);
    }
  });
  it("every known code keeps a deliberate message (no silent regression)", () => {
    const expected: Record<string, keyof Messages> = {
      UPSTREAM_BLOCKED: "sourceBlocked", AUTH_REQUIRED: "loginRequired", UNAVAILABLE: "videoUnavailable",
      BACKEND_UNAVAILABLE: "backendUnavailable", ENGINE_MISSING: "backendUnavailable", UPSTREAM_UNREACHABLE: "backendUnavailable",
      SECURITY_NOT_READY: "backendUnavailable", RESOURCE_GUARD: "backendUnavailable",
      PRIVATE: "restricted", FORBIDDEN_ORIGIN: "restricted", FORBIDDEN_HOST: "restricted", FORBIDDEN_PROXY: "restricted", CHALLENGE_REQUIRED: "restricted",
      RATE_LIMITED: "rateLimited", QUOTA_EXCEEDED: "rateLimited", QUEUE_FULL: "rateLimited", BUSY: "rateLimited",
      EXPIRED: "expired", EXPIRED_ACCESS: "expired", QUEUE_EXPIRED: "expired", INVALID_ACCESS: "expired",
      BODY_TOO_LARGE: "limitError", TOO_LARGE: "limitError", TIMEOUT: "timeoutError",
      INVALID_URL: "invalidLink", UNSUPPORTED_PLATFORM: "invalidLink", INVALID_FORMAT: "noFormats", POPUP_BLOCKED: "popupBlocked",
      ENGINE_ERROR: "operationFailed", NO_VIDEO: "operationFailed", UPSTREAM_INVALID: "operationFailed", NOT_FOUND: "operationFailed",
      INVALID_PROOF: "operationFailed", REPLAYED_PROOF: "operationFailed", INVALID_JSON: "operationFailed", QUEUE_DUPLICATE: "operationFailed",
      QUEUE_WAIT: "operationFailed", METHOD_NOT_ALLOWED: "operationFailed", HTTPS_REQUIRED: "operationFailed", INVALID_QUEUE_REQUEST: "operationFailed",
    };
    for (const [name, key] of Object.entries(expected)) assert.equal(errorMessage(name, dictionaries.en), dictionaries.en[key], name);
    assert.equal(errorMessage(undefined, dictionaries.en), dictionaries.en.operationFailed);
  });
});
