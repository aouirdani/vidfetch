import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

// Canonical spelling: language homes end with "/", every other page does not. Each redirect must point at the
// canonical URL, never at the requested one (that was an endless 308 loop on /fr and /legal/).
function target(path: string) {
  const response = proxy(new NextRequest(new URL(path, "https://vidfetch.app")));
  return { status: response.status, location: response.headers.get("location") };
}

describe("canonical URL redirects", () => {
  for (const home of ["fr", "es", "pt", "id", "de", "it", "ar"]) {
    it(`/${home} redirects once to /${home}/`, () => {
      assert.deepEqual(target(`/${home}`), { status: 308, location: `https://vidfetch.app/${home}/` });
    });
  }
  for (const [from, to] of [["/legal/", "/legal"], ["/fr/mentions-legales/", "/fr/mentions-legales"], ["/blog//", "/blog"]]) {
    it(`${from} redirects once to ${to}`, () => {
      assert.deepEqual(target(from), { status: 308, location: `https://vidfetch.app${to}` });
    });
  }
  it("keeps the query string", () => {
    assert.deepEqual(target("/de?x=1"), { status: 308, location: "https://vidfetch.app/de/?x=1" });
  });
  for (const canonical of ["/", "/fr/", "/legal", "/fr/mentions-legales", "/ar/"]) {
    it(`${canonical} is served without a redirect`, () => {
      assert.equal(target(canonical).location, null);
    });
  }
});
