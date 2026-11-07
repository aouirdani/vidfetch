import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import configuration from "../next.config";
import { AbuseLink } from "../src/components/AbuseLink";
import { dictionary } from "../src/i18n/dictionaries";
import { articlePath, LANGUAGES, LOCALES } from "../src/i18n/config";
import { guideSchema, isPublishedGuide } from "../src/lib/guides";
import { homeGuides, tiktokGuides, TIKTOK_GUIDE_IDS } from "../src/lib/guide-links";
import { localizedMetadata } from "../src/lib/localized-seo";
import { languageAlternates, resolvePage } from "../src/lib/site-pages";
import { platformLinks } from "../src/lib/platform-pages";

test("the three TikTok guides have eight published equivalents and links to both local tools", () => {
  for (const locale of LOCALES) {
    assert.equal(homeGuides(locale).length, 3, locale);
    assert.deepEqual(tiktokGuides(locale).map(g => g.id).sort(), [...TIKTOK_GUIDE_IDS].sort());
    for (const guide of tiktokGuides(locale)) {
      assert.ok(isPublishedGuide(guide));
      const path = articlePath(locale, guide.slug), page = resolvePage(path.split("/").filter(Boolean))!;
      assert.equal(page.indexable, true, path);
      assert.equal(guideSchema(guide).inLanguage, locale);
      assert.equal(guideSchema(guide).url, new URL(path, "https://vidfetch.app").href);
      assert.deepEqual(Object.keys(languageAlternates(page)).sort(), [...LOCALES, "x-default"].sort());
      const metadata = localizedMetadata(page);
      const alternatives = metadata.openGraph?.alternateLocale;
      assert.ok(Array.isArray(alternatives));
      assert.deepEqual(alternatives.slice().sort(), LOCALES.filter(l => l !== locale).map(l => LANGUAGES[l].og).sort());
      if (!["en", "fr"].includes(locale)) {
        assert.ok(guide.body.split(/\s+/).length >= 350, path);
        for (const tool of platformLinks(locale)) assert.ok(guide.body.includes(`](${tool.href})`), `${path} -> ${tool.href}`);
      }
      for (const [, href] of guide.body.matchAll(/\]\((\/[^\s)]+)\)/g)) assert.ok(resolvePage(href.split("/").filter(Boolean)), `${path} -> ${href}`);
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
  assert.deepEqual(localizedMetadata(resolvePage(["blog", "mp4-vs-webm"])!).openGraph?.alternateLocale, []);
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
