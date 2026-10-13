import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mediaConfiguration, publicMediaConfiguration } from "../src/server/media-config";
import { verifyTurnstile } from "../src/server/turnstile";
import { configureDownloadOrigin } from "../src/lib/api";

const env = { VIDFETCH_TARGET: "ovh", VIDFETCH_CONNECTION_READY: "1", NEXT_PUBLIC_SITE_URL: "https://vidfetch.app",
  VIDFETCH_MEDIA_ORIGIN: "https://dl.vidfetch.app", TURNSTILE_SITE_KEY: "public-fixture-only",
  TURNSTILE_SECRET_KEY: "not-a-real-provider-key", VIDFETCH_ACCESS_SIGNING_KEY: randomBytes(32).toString("base64url") };
test("OVH runtime origin is separate, complete and never leaks service secrets", () => {
  const config = publicMediaConfiguration(env);
  assert.deepEqual(config, { ok: true, available: true, siteKey: env.TURNSTILE_SITE_KEY, gatewayOrigin: env.VIDFETCH_MEDIA_ORIGIN });
  assert(!JSON.stringify(config).includes(env.VIDFETCH_ACCESS_SIGNING_KEY));
  assert(!JSON.stringify(config).includes(env.TURNSTILE_SECRET_KEY));
  for (const key of Object.keys(env)) assert.equal(mediaConfiguration({ ...env, [key]: "" }), null, key);
  for (const origin of ["http://dl.vidfetch.app", "https://127.0.0.1", "https://dl.vidfetch.app/path", "https://u:p@dl.vidfetch.app", "https://dl.vidfetch.app:8789"]) {
    assert.equal(mediaConfiguration({ ...env, VIDFETCH_MEDIA_ORIGIN: origin }), null);
    assert.throws(() => configureDownloadOrigin(origin));
  }
  configureDownloadOrigin(env.VIDFETCH_MEDIA_ORIGIN);
});
test("Turnstile validates action and hostname, rejects expired/replayed challenges", async () => {
  const send = (value: unknown) => (async (url, init) => {
    assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.equal(init?.redirect, "error"); assert(init?.signal);
    return Response.json(value);
  }) as typeof fetch;
  assert.equal(await verifyTurnstile("fixture", "vidfetch.app", "test-only", send({ success: true, hostname: "vidfetch.app", action: "vidfetch" })), true);
  for (const result of [{ success: true, hostname: "evil.example", action: "vidfetch" }, { success: true, hostname: "vidfetch.app", action: "other" }, { success: false, "error-codes": ["timeout-or-duplicate"] }]) {
    assert.equal(await verifyTurnstile("fixture", "vidfetch.app", "test-only", send(result)), false);
  }
  for (const send of [(async () => new Response("a".repeat(16385))) as typeof fetch, (async () => new Response("bad json")) as typeof fetch,
    (async () => new Response("unavailable", { status: 503 })) as typeof fetch, (async () => { throw Error("network unavailable"); }) as typeof fetch]) {
    await assert.rejects(verifyTurnstile("fixture", "vidfetch.app", "test-only", send), { code: "BACKEND_UNAVAILABLE", status: 503 });
  }
});
