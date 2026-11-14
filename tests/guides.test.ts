import { test } from "node:test";
import assert from "node:assert/strict";
import { guides, availableGuides, guideFor, guideSchema, headingId } from "../src/lib/guides";
import { SITE, jsonLdGraph } from "../src/lib/seo";

test("published baseline and prepared guides have unique metadata, real dates and resolvable internal links", () => {
  const all = guides(); assert.equal(availableGuides("en").length, 0);
  assert.equal(new Set(all.map(a => a.title)).size, all.length);
  assert.equal(new Set(all.map(a => a.description)).size, all.length);
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
    assert.ok(ids.length >= (a.series ? 3 : 5), a.slug);
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

test("human publication gate rejects bypasses and invalid calendar dates in every locale", async () => {
  const { isPublishedGuide, isReviewedGuide } = await import('../src/lib/guides');
  for (const locale of ['en', 'fr', 'es'] as const) {
    const original = guides(locale).find(g => g.id === 'save-tiktok-phone-gallery')!;
    // In-memory fixture only: these values never enter the guide files.
    const good = { ...original, status: 'published' as const, reviewedBy: 'Aymane Ouirdani', reviewedAt: '2026-11-07', published: '2026-11-08', updated: '2026-11-08' };
    assert.equal(isPublishedGuide(good), true, locale);
    const schema = guideSchema(good);
    assert.equal(schema.author['@type'], 'Person');
    assert.equal(schema.author.name, 'Aymane Ouirdani');
    assert.ok(schema.author.url?.startsWith('https://vidfetch.app/'));
    assert.equal(schema.datePublished, good.published);
    assert.equal(schema.dateModified, good.updated);
    assert.equal(isPublishedGuide({...good,status:'ready'}), false);
    for (const reviewedBy of [null, '', 'VidFetch', 'Someone else']) assert.equal(isPublishedGuide({...good,reviewedBy}), false);
    for (const reviewedAt of [null, '', '2026-02-30', '2026-13-01', '2026-1-1', '2999-01-01']) assert.equal(isPublishedGuide({...good,reviewedAt}), false);
    assert.equal(isPublishedGuide({...good,reviewedAt:'2026-11-09'}), false, 'review follows last modification');
    assert.equal(isPublishedGuide({...good,published:original.published}), true, 'historical first publication date survives a later review');
    assert.equal(isPublishedGuide({...good,updated:'2026-11-05'}), false, 'modification precedes publication');
    assert.equal(isPublishedGuide({...good,published:'2026-02-30'}), false);
    assert.equal(isReviewedGuide({...good,reviewedBy:null,publicationRequested:true}), false);
    if(locale!=='en') assert.equal(isPublishedGuide({...good,sourceBodySha256:'0'.repeat(64)}), false);
  }
});
