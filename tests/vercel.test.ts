import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import configuration from "../next.config";
import { GET as healthGET } from "../src/app/api/health/route";
import { POST as fetchInfoPOST } from "../src/app/api/fetch-info/route";
import { POST as downloadPOST, GET as downloadGET } from "../src/app/api/download/route";
import { isLocalEngineHosting } from "../src/lib/deployment";

const keys = ["DATABASE_URL", "VIDFETCH_TARGET", "VERCEL", "VERCEL_ENV", "NEXT_PUBLIC_API_ORIGIN"];
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
});
afterEach(() => {
  for (const key of keys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("Vercel without a secure download gateway", () => {
  it("reports frontend health separately from download availability", async () => {
    const response = await healthGET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const data = await response.json();
    assert.equal(data.ok, true);
    assert.deepEqual(data.engine, { ytDlp: null, ffmpeg: false });
    assert.equal(data.downloads.available, false);
  });

  it("refuses extraction, preparation, tickets and statuses without starting engines", async () => {
    for (const handler of [fetchInfoPOST, downloadPOST, downloadGET]) {
      const response = await handler(new Request("https://vidfetch.test/api/download?ticket=test", { method: "POST", body: "{" }));
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, "BACKEND_UNAVAILABLE");
    }
    assert.equal((globalThis as { __vidfetchTransfers?: unknown }).__vidfetchTransfers, undefined, "Local download module must not be loaded");
  });

  it("provides both Turbopack and webpack with an engine-free API alias", () => {
    process.env.NEXT_PUBLIC_API_ORIGIN = "http://192.168.1.112:8788";
    // No Vercel flags, target or DATABASE_URL: the plain build must still be safe.
    const config = configuration("phase-production-build");
    assert.equal(config.env?.NEXT_PUBLIC_DOWNLOADS_UNAVAILABLE, "1");
    assert.equal(config.env?.NEXT_PUBLIC_API_ORIGIN, "");
    assert.equal(config.turbopack?.resolveAlias?.["@vidfetch/media-api"], "./src/server/unavailable-api.ts");
    assert.ok(config.webpack);
  });

  it("keeps local engines opt-in and prevents that opt-in on Vercel", () => {
    assert.equal(isLocalEngineHosting({}), false);
    assert.equal(isLocalEngineHosting({ VIDFETCH_TARGET: "node" }), true);
    for (const flags of [{ VERCEL: "1" }, { VERCEL_ENV: "preview" }, { VERCEL_ENV: "production" }]) {
      assert.equal(isLocalEngineHosting({ VIDFETCH_TARGET: "node", ...flags }), false);
    }
    process.env.VIDFETCH_TARGET = "node";
    const config = configuration("phase-production-server");
    assert.equal(config.env?.NEXT_PUBLIC_DOWNLOADS_UNAVAILABLE, "0");
    assert.equal(config.turbopack?.resolveAlias?.["@vidfetch/media-api"], undefined);
  });

  it("loads database-backed modules without credentials, then requires them on access", async () => {
    const { getDb } = await import("../src/db");
    assert.throws(getDb, /DATABASE_URL is required to use database features/);
    // Health remains able to report a genuine database failure in explicit Node mode.
    process.env.VIDFETCH_TARGET = "node";
    const response = await healthGET();
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { ok: false });
    assert.equal((globalThis as { __arenaNextJsPostgresqlPool?: unknown }).__arenaNextJsPostgresqlPool, undefined);
  });
});
