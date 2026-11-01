import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { LANGUAGES, LOCALES, homePath, sectionPath, interpolate } from "../src/i18n/config";
import { dictionaries } from "../src/i18n/dictionaries";
import { sitePages, resolvePage, languageAlternates } from "../src/lib/site-pages";
import { localizedMetadata } from "../src/lib/localized-seo";
import { LanguageSelector } from "../src/components/LanguageSelector";
import { downloadHelper } from "../backend/gateway/helper";
import sitemap from "../src/app/sitemap";
import { guides, isPublishedGuide, headingId } from "../src/lib/guides";
import { normaliseFormat } from "../src/lib/media";
import { localizedFormatLabel } from "../src/i18n/formats";
import { createHash } from "node:crypto";
import { platformCandidates, availablePlatformPages, approvedPlatformCopy } from "../src/lib/platform-pages";

for (const locale of LOCALES) {
  test(`${locale}: complete dictionary, placeholders and stable localized routes`, () => {
    const d = dictionaries[locale];
    assert.deepEqual(Object.keys(d).sort(), Object.keys(dictionaries.en).sort());
    for (const key of Object.keys(d) as Array<keyof typeof d>) {
      assert.ok(d[key].trim(), key);
      assert.deepEqual([...d[key].matchAll(/\{\w+\}/g)].map(m => m[0]).sort(), [...dictionaries.en[key].matchAll(/\{\w+\}/g)].map(m => m[0]).sort(), key);
    }
    if (locale !== "en") for (const key of ["heroTitle", "metaTitle", "placeholder", "legalIntro", "faq2a", "networkError"] as const) assert.notEqual(d[key], dictionaries.en[key], key);
    for (const path of [homePath(locale), sectionPath(locale, "legal")]) {
      assert.equal(resolvePage(path.split("/").filter(Boolean))?.locale, locale);
    }
    // a guide index exists only in a language with guides to show (English today), never as an empty page
    assert.equal(resolvePage(sectionPath(locale, "blog").split("/").filter(Boolean))?.identity.kind, ["en", "fr"].includes(locale) ? "blog" : undefined);
    assert.equal(resolvePage([LANGUAGES[locale].prefix, "api", "download"]), undefined);
    assert.equal(resolvePage([LANGUAGES[locale].prefix, "does-not-exist"]), undefined);
    assert.doesNotMatch(interpolate(d.waiting, { position: 2, seconds: 90 }), /\{\w+\}/);
  });
  test(`${locale}: canonical, OG and reciprocal real equivalents`, () => {
    const page = resolvePage(homePath(locale).split("/").filter(Boolean))!;
    const alternates = languageAlternates(page), metadata = localizedMetadata(page);
    assert.equal(metadata.alternates?.canonical, new URL(homePath(locale), "https://vidfetch.app").href);
    assert.equal(metadata.openGraph?.locale, LANGUAGES[locale].og);
    assert.deepEqual(Object.keys(alternates).sort(), [...LOCALES, "x-default"].sort());
    for (const target of LOCALES) {
      const other = resolvePage(new URL(alternates[target]).pathname.split("/").filter(Boolean))!;
      assert.deepEqual(languageAlternates(other), alternates);
      assert.equal(alternates[target], new URL(other.path, "https://vidfetch.app").href);
    }
    assert.equal(alternates["x-default"], "https://vidfetch.app/");
  });
  test(`${locale}: accessible selector keeps equivalents and falls back from drafts`, () => {
    const home = renderToStaticMarkup(createElement(LanguageSelector, { locale, identity: { kind: "home" } }));
    assert.equal([...home.matchAll(/hreflang=/gi)].length, 8);
    const article = renderToStaticMarkup(createElement(LanguageSelector, { locale, identity: { kind: "guide", id: "mp4-vs-webm" } }));
    for (const target of LOCALES.filter(l => l !== "en")) assert.ok(article.includes(`href="${homePath(target)}"`));
    assert.ok(article.includes('href="/blog/mp4-vs-webm"'));
  });
  test(`${locale}: download helper preserves auth boundaries and localized messages`, () => {
    const helper = downloadHelper(["https://vidfetch.app"], locale);
    assert.ok(helper.html.includes(`lang="${locale}" dir="${LANGUAGES[locale].dir}"`));
    assert.ok(helper.html.includes(dictionaries[locale].helperWaiting));
    assert.ok(helper.html.includes('event.source!==opener'));
    assert.ok(helper.html.includes("'/auth/transfer'"));
    assert.match(helper.csp, /default-src 'none'/);
  });
}
test("sitemap contains exactly published canonical equivalents and excludes unverified content", () => {
  const entries = sitemap();
  assert.equal(entries.length, sitePages().filter(p => p.indexable).length);
  assert.equal(new Set(entries.map(p => p.url)).size, entries.length);
  assert.equal(entries.length, 82);   // 8 homes + 8 legal + 4 approved TikTok pages (en video, en MP3, fr video, fr MP3)
  for (const entry of entries) {
    const parts = new URL(entry.url).pathname.split("/").filter(Boolean).map(decodeURIComponent);
    assert.ok(resolvePage(parts)?.indexable);
    const tiktok = { "/tiktok-video-downloader": [...LOCALES, "x-default"], "/fr/telecharger-video-tiktok": [...LOCALES, "x-default"], "/tiktok-to-mp3": [...LOCALES, "x-default"], "/fr/tiktok-en-mp3": [...LOCALES, "x-default"] } as Record<string, string[]>;
    const path = new URL(entry.url).pathname;
    if (tiktok[path]) assert.deepEqual(Object.keys(entry.alternates?.languages ?? {}).sort(), tiktok[path].sort(), path);
    else assert.equal(Object.keys(entry.alternates?.languages ?? {}).length, /\/(?:blog|fr\/guides)(?:\/|$)/.test(entry.url) ? (entry.alternates?.languages?.fr ? 3 : 2) : 9);
    assert.ok(entry.lastModified instanceof Date && entry.lastModified <= new Date());
    assert.doesNotMatch(entry.url, /youtube|api\//);
  }
  assert.equal(sitePages().filter(p => p.identity.kind === "guide").length, 16);
  assert.ok(sitePages().filter(p => p.identity.kind === "guide").every(p => p.indexable));
  assert.equal(sitePages().filter(p => p.identity.kind === "platform" && p.indexable).length, 16);
});
test("article publication rejects review, missing dates and future dates; Unicode anchors survive", () => {
  const original = guides()[0];
  assert.equal(isPublishedGuide(original), true);
  assert.equal(isPublishedGuide({ ...original, status: "review", published: "2026-10-12" }), false);
  assert.equal(isPublishedGuide({ ...original, published: "2999-01-01" }), false);
  assert.equal(isPublishedGuide({ ...original, published: "2026-10-12" }), true);
  assert.notEqual(headingId("اختيار الصيغة"), "");
  assert.notEqual(headingId("اختيار الصيغة"), headingId("حفظ النسخة"));
});
test("Arabic route lookup accepts encoded slugs and rejects encoded separators", () => {
  assert.equal(resolvePage(["ar", encodeURIComponent(LANGUAGES.ar.legal)])?.identity.kind, "legal");
  assert.equal(resolvePage(["ar", "%2fapi%2fdownload"]), undefined);
  assert.equal(resolvePage(["ar", "%ZZ"]), undefined);
});
test("seventy complete translations retain provenance and remain unavailable pending review", () => {
  let total = 0;
  for (const locale of LOCALES.filter(l => l !== "en")) {
    const translations = guides(locale).filter(g => g.status === "review");
    assert.equal(translations.length, 10, locale);
    assert.deepEqual(translations.map(g => g.id).sort(), guides().filter(g => !g.id.startsWith("save-tiktok") && g.id !== "why-cant-i-save-tiktok").map(g => g.id).sort());
    assert.equal(new Set(translations.map(g => g.slug)).size, 10);
    assert.equal(new Set(translations.map(g => g.title)).size, 10);
    assert.equal(new Set(translations.map(g => g.description)).size, 10);
    for (const guide of translations) {
      assert.equal(guide.status, "review"); assert.equal(guide.published, null);
      assert.equal(isPublishedGuide(guide), false);
      assert.match(guide.sourceSha256!, /^[a-f0-9]{64}$/);
      assert.equal(guide.sourceBodySha256, createHash("sha256").update(guides().find(g => g.id === guide.id)!.body).digest("hex"));
      assert.ok(guide.body.split(/\s+/).length >= 250, `${locale}/${guide.id}`);
      assert.ok([...guide.body.matchAll(/^## /gm)].length >= 5);
      assert.ok([...guide.body.matchAll(/^### /gm)].length >= 1);
      assert.equal(resolvePage((sectionPath(locale, "blog") + "/" + guide.slug).split("/").filter(Boolean)), undefined);
      for (const match of guide.body.matchAll(/\]\(\/blog\/([a-z0-9-]+)\)/g)) assert.ok(guides().some(g => g.id === match[1]), match[1]);
      if (guide.id === "video-to-audio") assert.match(guide.body, /libmp3lame -b:a 192k/);
      if (guide.id === "reduce-video-size") assert.match(guide.body, /-crf 23 -preset medium/);
      if (guide.id === "bitrate-vs-resolution") assert.match(guide.body, /22500000/);
      if (guide.id === "backup-your-videos") assert.match(guide.body, /sha256sum -c/);
    }
    total += translations.length;
  }
  assert.equal(total, 70);
});
test("localized format presentation preserves portrait resolution and high frame rates", () => {
  const format = normaliseFormat({ format_id: "portrait", ext: "mp4", height: 1920, width: 1080, fps: 60, vcodec: "h264", acodec: "aac" })!;
  for (const locale of LOCALES) assert.equal(localizedFormatLabel(format, dictionaries[locale]), "1080p · 60 fps");
});
test("eleven platform intents have eight slugs and cannot publish without evidence and reviewed copy", () => {
  assert.equal(platformCandidates.length, 11);
  for (const locale of LOCALES) {
    // Only the TikTok pages with approved copy are published: en and fr (video, MP3).
    assert.deepEqual(availablePlatformPages(locale).map(entry => entry.id), ["tiktok-video-downloader", "tiktok-mp3"]);
    assert.equal(new Set(platformCandidates.map(entry => entry.slugs[locale])).size, 11);
    for (const entry of platformCandidates.filter(e => e.platform !== "tiktok")) assert.equal(approvedPlatformCopy({ ...entry, published: true }, locale), undefined);
  }
});
