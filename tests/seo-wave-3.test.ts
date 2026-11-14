import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import configuration from "../next.config";
import { AbuseLink, ContactText } from "../src/components/AbuseLink";
import { dictionary } from "../src/i18n/dictionaries";
import { articlePath, LANGUAGES, LOCALES } from "../src/i18n/config";
import { guides, isPublishedGuide } from "../src/lib/guides";
import { homeGuides, tiktokGuides, TIKTOK_GUIDE_IDS } from "../src/lib/guide-links";
import { localizedMetadata } from "../src/lib/localized-seo";
import { resolvePage } from "../src/lib/site-pages";
import { withOfficialContacts } from "../src/lib/contact";

test("the TikTok guides retain their local tool content but require a publisher-confirmed review", () => {
  for (const locale of LOCALES) {
    assert.equal(homeGuides(locale).length, 0, locale);
    assert.equal(tiktokGuides(locale).length, 0, locale);
    for (const id of TIKTOK_GUIDE_IDS) {
      const guide = guides(locale).find(g => g.id === id)!;
      assert.ok(guide);
      assert.equal(isPublishedGuide(guide), false);
      assert.equal(resolvePage(articlePath(locale, guide.slug).split('/').filter(Boolean)), undefined);
      assert.equal(guide.reviewedBy, null);
      assert.equal(guide.reviewedAt, null);
    }
  }
});

test("Open Graph includes all other existing versions, with no duplicates or unrelated language", () => {
  for (const locale of LOCALES) {
    const home = resolvePage(locale === "en" ? [] : [LANGUAGES[locale].prefix])!;
    const alternatives = localizedMetadata(home).openGraph?.alternateLocale;
    assert.ok(Array.isArray(alternatives));
    assert.deepEqual(alternatives.slice().sort(), LOCALES.filter(l => l !== locale).map(l => LANGUAGES[l].og).sort());
  }
  assert.equal(resolvePage(["blog", "mp4-vs-webm"]), undefined);
});

test("abuse mailto remains server-rendered inside Cloudflare's opt-out, with escaped labels", () => {
  for (const locale of LOCALES) {
    const html = renderToStaticMarkup(createElement(AbuseLink, { label: dictionary(locale).reportAbuse }));
    assert.match(html, /<!--email_off--><a href="mailto:abuse@vidfetch\.app">/);
    assert.match(html, /<\/a><!--\/email_off-->/);
    assert.doesNotMatch(html, /email-protection|<script/);
  }
  const untrustedLabel = renderToStaticMarkup(createElement(AbuseLink, { label: '<img src=x onerror="alert(1)">' }));
  assert.doesNotMatch(untrustedLabel, /<img/);
});

test("plain legal contact paragraphs are protected too, in all eight languages", () => {
  for (const locale of LOCALES) {
    const d = withOfficialContacts(dictionary(locale));
    for (const key of ["notice1", "privacy6", "report1"] as const) {
      const html = renderToStaticMarkup(createElement(ContactText, { text: d[key] }));
      assert.match(html, /<!--email_off-->/);
      assert.match(html, /<!--\/email_off-->/);
      assert.doesNotMatch(html, /<a|email-protection/);
      assert.match(html, /@vidfetch\.app/);
    }
  }
  assert.doesNotMatch(renderToStaticMarkup(createElement(ContactText, { text: '<img src=x> abuse@vidfetch.app' })), /<img/);
  assert.equal(renderToStaticMarkup(createElement(ContactText, { text: "No contact here" })), "No contact here");
});

test("the application adds security headers with an observational CSP compatible with local media and Turnstile", async () => {
  const config = configuration("phase-production-server");
  const rules = await config.headers!();
  const headers = Object.fromEntries(rules.find(rule => rule.source === "/:path*")!.headers.map(h => [h.key, h.value]));
  assert.equal(headers["Strict-Transport-Security"], "max-age=31536000");
  assert.equal(headers["X-Frame-Options"], "SAMEORIGIN");
  assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.equal(headers["Content-Security-Policy"], undefined);
  const csp = headers["Content-Security-Policy-Report-Only"];
  assert.match(csp, /script-src [^;]*'wasm-unsafe-eval'/);
  assert.match(csp, /worker-src 'self' blob:/);
  for (const directive of ["script-src", "connect-src", "frame-src"]) assert.match(csp, new RegExp(directive + " [^;]*https://challenges.cloudflare.com"));
});
