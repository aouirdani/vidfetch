import { describe, it } from "node:test";
import assert from "node:assert/strict";
import configuration from "../next.config";
import { healthGET, fetchInfoPOST, downloadPOST, downloadGET } from "../src/server/unavailable-api";

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
      const response = await handler();
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, "BACKEND_UNAVAILABLE");
    }
  });

  it("provides both Turbopack and webpack with an engine-free API alias", () => {
    const config = configuration("phase-production-server");
    if (process.env.VIDFETCH_TARGET === "vercel" || process.env.VERCEL === "1") {
      assert.equal(config.env?.NEXT_PUBLIC_DOWNLOADS_UNAVAILABLE, "1");
      assert.equal(config.env?.NEXT_PUBLIC_API_ORIGIN, "");
      assert.equal(config.turbopack?.resolveAlias?.["@vidfetch/media-api"], "./src/server/unavailable-api.ts");
      assert.ok(config.webpack);
    } else {
      assert.equal(config.env?.NEXT_PUBLIC_DOWNLOADS_UNAVAILABLE, "0");
    }
  });
});
