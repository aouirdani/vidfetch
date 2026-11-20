import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyEngineFailure } from "../src/lib/engine";
import { errorMessage } from "../src/i18n/errors";
import { dictionaries } from "../src/i18n/dictionaries";
import { LOCALES } from "../src/i18n/config";

test("known TikTok restriction is distinct from rate limits, global blocks, timeouts and deleted videos", () => {
  const issue = classifyEngineFailure(1, "ERROR: [TikTok] 6748451240264420610: Your IP address is blocked from accessing this post", "tiktok");
  assert.equal(issue.code, "POST_ACCESS_RESTRICTED"); assert.equal(issue.status, 403);
  for (const [stderr, code] of [["HTTP Error 429 Too Many Requests", "RATE_LIMITED"], ["HTTP Error 403 Forbidden", "UPSTREAM_BLOCKED"], ["The read operation timed out", "TIMEOUT"], ["This video is unavailable", "UNAVAILABLE"]]) {
    assert.equal(classifyEngineFailure(1, stderr, "tiktok").code, code);
  }
  assert.equal(classifyEngineFailure(1, "Your IP address is blocked from accessing this post", "instagram").code, "ENGINE_ERROR");
});

test("all eight UI languages explain the post restriction instead of a generic service/private-video failure", () => {
  const messages = LOCALES.map(locale => {
    const d = dictionaries[locale], message = errorMessage("POST_ACCESS_RESTRICTED", d, locale);
    assert.match(message, /TikTok/);
    for (const generic of [d.restricted, d.backendUnavailable, d.operationFailed]) assert.notEqual(message, generic);
    if (locale !== "en") assert.notEqual(message, errorMessage("POST_ACCESS_RESTRICTED", dictionaries.en));
    return message;
  });
  assert.equal(new Set(messages).size, 8);
  assert.match(errorMessage("POST_ACCESS_RESTRICTED", dictionaries.fr, "fr"), /notre serveur/);
});
