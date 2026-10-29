import { test } from "node:test";
import assert from "node:assert/strict";
import { guides, guideFor, guideSchema, headingId } from "../src/lib/guides";
import { SITE, jsonLdGraph } from "../src/lib/seo";

test("ten complete guides have unique metadata, real dates and resolvable internal links", () => {
  const all = guides(); assert.equal(all.length, 13);
  assert.equal(new Set(all.map(a => a.title)).size, 13);
  assert.equal(new Set(all.map(a => a.description)).size, 13);
  for (const a of all) {
    assert.ok(a.body.split(/\s+/).length >= 380, a.slug);
    const today = new Date().toISOString().slice(0, 10);
    assert.ok(a.updated >= a.created && a.updated <= today);
    if (a.published) assert.ok(a.published >= a.created && a.published <= today);
    assert.ok(a.sources.length >= 2);
    assert.ok(a.related.every(slug => guideFor(slug)));
    for (const match of a.body.matchAll(/\]\(\/blog\/([a-z0-9-]+)\)/g)) assert.ok(guideFor(match[1]), match[1]);
    const ids = [...a.body.matchAll(/^## (.+)$/gm)].map(m => headingId(m[1]));
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.length >= 5);
    assert.doesNotMatch(a.body, /TODO|lorem ipsum|placeholder/i);
    assert.equal(guideSchema(a).url, `https://vidfetch.app/blog/${a.slug}`);
  }
  assert.equal(guideFor("../.env"), undefined);
});
test("canonical identity is production domain and JSON-LD cannot close a script", () => {
  assert.equal(SITE.url, "https://vidfetch.app");
  const text = jsonLdGraph([{ name: "</script><script>alert(1)</script>" }]);
  assert.doesNotMatch(text, /<\/script>/);
  assert.equal(JSON.parse(text)["@graph"][0].name, "</script><script>alert(1)</script>");
});
