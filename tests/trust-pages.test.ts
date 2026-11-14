import test from "node:test";
import assert from "node:assert/strict";
import { LOCALES } from "../src/i18n/config";
import { PUBLISHER, hasUnfinishedFields } from "../src/lib/publisher";
import { availableTrustPages, proposedTrustPath, trustPages, TRUST_IDS } from "../src/lib/trust-pages";
import { resolvePage, sitePages } from "../src/lib/site-pages";
import { certifiedCmpSource, CONSENT_CMP_ENABLED } from "../src/lib/consent";
import { isReviewedGuide, guides } from "../src/lib/guides";

test("unfinished trust content never resolves publicly or enters the sitemap/navigation inventory", () => {
  for (const locale of LOCALES) {
    assert.equal(trustPages(locale).length, 6);
    for (const page of trustPages(locale)) {
      const path = proposedTrustPath(locale, page.id);
      if (hasUnfinishedFields(page)) {
        assert.equal(resolvePage(path.split("/").filter(Boolean)), undefined, path);
        assert.ok(!sitePages().some(p => p.path === path), path);
      }
    }
    assert.ok(availableTrustPages(locale).every(p => !hasUnfinishedFields(p)));
  }
});
test("all 48 source pages are complete structures with six distinct localized slugs", () => {
  const confirmed = PUBLISHER;
  for (const locale of LOCALES) {
    const pages = trustPages(locale, confirmed);
    assert.equal(new Set(pages.map(p => p.slug)).size, TRUST_IDS.length);
    for (const page of pages) {
      assert.ok(!hasUnfinishedFields(page), `${locale}:${page.id}`);
      assert.ok(page.sections.length >= 2);
      assert.ok(page.title.length + " | VidFetch".length <= 60, page.title);
      assert.ok(page.description.length <= 155, page.description);
    }
  }
});
test("a ready/requested guide cannot bypass the visible-placeholder publication guard", () => {
  const original = guides().find(g => g.id === "720p-1080p-4k")!;
  assert.equal(isReviewedGuide({ ...original, status: "ready", body: `${original.body}\n[À COMPLÉTER : auteur]`, publicationRequested: true }), false);
});
test("Google CMP is disabled and rejects missing or untrusted activation URLs", () => {
  assert.equal(CONSENT_CMP_ENABLED, false);
  assert.equal(certifiedCmpSource(), null);
  assert.throws(() => certifiedCmpSource(true, null));
  assert.throws(() => certifiedCmpSource(true, "https://example.com/consent.js"));
  assert.equal(certifiedCmpSource(true, "https://fundingchoicesmessages.google.com/i/test"), "https://fundingchoicesmessages.google.com/i/test");
});

test("confirmed pages expose real identity and contacts, with reciprocal equivalents", () => {
  for (const locale of LOCALES) {
    assert.equal(availableTrustPages(locale).length, 6);
    for (const page of availableTrustPages(locale)) {
      const route = resolvePage(proposedTrustPath(locale, page.id).split('/').filter(Boolean));
      assert.equal(route?.indexable, true);
      assert.doesNotMatch(JSON.stringify(page), /\{\w+\}|\[À COMPLÉTER/);
    }
    const contact = JSON.stringify(trustPages(locale).find(p => p.id === 'contact'));
    for (const address of Object.values(PUBLISHER.contacts)) assert.ok(contact.includes(address));
    assert.ok(JSON.stringify(trustPages(locale).find(p => p.id === 'about')).includes(PUBLISHER.name));
  }
});
