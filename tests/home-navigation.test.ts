import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LOCALES } from "../src/i18n/config";
import { dictionary } from "../src/i18n/dictionaries";
import { HOME_COPY, HOME_UPDATED, homeCopy } from "../src/lib/home-copy";
import { FORM_COPY, TIKTOK_LINK_SHAPES } from "../src/lib/form-copy";
import { CONTACTS, withOfficialContacts } from "../src/lib/contact";
import { dictionaries } from "../src/i18n/dictionaries";
import { showsAds } from "../src/lib/adsense";
import { availablePlatformPages, approvedPlatformCopy, englishPlatformLinks, navigationPlatformLinks, platformCandidates } from "../src/lib/platform-pages";
import { resolvePage, sitePages } from "../src/lib/site-pages";
import { localizedMetadata } from "../src/lib/localized-seo";
import { availableGuides } from "../src/lib/guides";
import { detectPlatform } from "../src/lib/platforms";

const source = (file: string) => readFileSync(file, "utf8");
const banned = /\b(best|fastest|unlimited|guaranteed|100\s?%)\b|illimit|garanti|le meilleur|el mejor|ilimitad|watermark|filigrane|marca d'água|wasserzeichen/i;

// New wording is published only where it was reviewed (English, French); the other languages keep the dictionaries.
const REVIEWED = ["en", "fr"] as const;

describe("home pages: TikTok search intent", () => {
  it("has distinct localized metadata and a useful format-specific heading", () => {
    assert.deepEqual(Object.keys(HOME_COPY).sort(), [...LOCALES].sort());
    for (const locale of LOCALES) {
      const copy = homeCopy(locale);
      assert.ok(copy.title.length <= 60 && copy.title.endsWith("| VidFetch"));
      assert.ok(copy.description.length <= 160);
      assert.match(copy.heroTitle, /TikTok|تيك توك/);
      assert.match(copy.platformsAnswer, /YouTube|يوتيوب/);
      assert.equal(copy.updated, HOME_UPDATED);
      for (const entry of availablePlatformPages(locale)) {
        const tool = approvedPlatformCopy(entry, locale)!;
        assert.notEqual(copy.title, `${tool.title} | VidFetch`);
        assert.notEqual(`${copy.heroTitle} ${copy.heroAccent}`, tool.heading);
      }
    }
  });
});

describe("navigation", () => {
  it("links the TikTok pages from every language: its own pages, otherwise the English ones marked hreflang=en", () => {
    for (const locale of LOCALES) {
      const links = navigationPlatformLinks(locale);
      const own = true;
      assert.deepEqual(links.map(l => l.href), availablePlatformPages(locale).map(e => `${locale === "en" ? "" : "/" + (locale === "pt-BR" ? "pt" : locale)}/${e.slugs[locale]}`));
      for (const link of links) {
        assert.equal(resolvePage(link.href.split("/").filter(Boolean))?.indexable, true, link.href);
        assert.match(link.label, /MP[34]/); assert.match(link.label, /TikTok|تيك توك/);
        assert.equal(link.hrefLang, own ? undefined : "en", locale);
        // elsewhere: the labels already published on that language's home (lot 1), not new wording
        if (!own) assert.ok(englishPlatformLinks(locale).some(l => l.href === link.href && l.label === link.label && l.note === link.note), `${locale} ${link.label}`);
        if (!own) assert.ok(link.note && link.note.trim().length > 5, locale);
      }
    }
    const header = source("src/components/Header.tsx"), footer = source("src/components/Footer.tsx");
    assert.match(header, /navigationPlatformLinks\(locale\)\.filter\(tool => !tool\.hrefLang\)/);
    assert.match(footer, /navigationPlatformLinks\(locale\)\.map/);
    assert.match(footer, /hrefLang=\{tool\.hrefLang\}/);
  });

  it("never links an empty guide index: Guides appears only in a language with guides to show", () => {
    for (const locale of LOCALES) {
      const has = availableGuides(locale).length > 0;
      assert.equal(has, locale === "en", locale);
      assert.equal(sitePages().some(p => p.locale === locale && p.identity.kind === "blog"), has, locale);
    }
    for (const file of ["src/components/Header.tsx", "src/components/Footer.tsx"]) {
      for (const link of source(file).match(/<Link href=\{sectionPath\(locale, "blog"\)\}[^>]*>/g) ?? []) {
        const at = source(file).indexOf(link);
        assert.match(source(file).slice(Math.max(0, at - 40), at), /(guides|availableGuides\(locale\)\.length > 0) && $/, `${file}: ${link}`);
      }
    }
    assert.match(source("src/views/SiteViews.tsx"), /\{recent\.length > 0 && <section className="defer-paint mt-16">/);
  });
});

describe("the link form", () => {
  it("states TikTok as the verified platform (English, French) and shows link shapes, not example buttons", () => {
    for (const locale of REVIEWED) {
      const copy = FORM_COPY[locale]!;
      assert.match(copy.supportedHint, /TikTok/, locale); assert.match(copy.supportedHint, /YouTube/, locale);
      assert.match(copy.tiktokHint, /TikTok/, locale);
      assert.doesNotMatch(copy.tiktokHint, /YouTube|Instagram/, locale);
    }
    // each shape is a TikTok link form the detector accepts
    const samples = ["https://www.tiktok.com/@creator/video/7059698374567611694", "https://vm.tiktok.com/ZMabc123/", "https://www.tiktok.com/t/ZTabc123/"];
    assert.equal(samples.length, TIKTOK_LINK_SHAPES.length);
    for (const url of samples) assert.equal(detectPlatform(url).platform, "tiktok", url);
    const form = source("src/components/FetchForm.tsx");
    assert.match(form, /\(platform === "tiktok" \? form\?\.tiktokHint : form\?\.supportedHint\) \?\? d\.supportedHint/);
    // the label before the link shapes is the dictionary's existing "Links look like"
    assert.match(form, /<span>\{d\.linkExample\}\{" "\}<\/span>/);
    // the only submit buttons are Extract and Retry (the user's own link): no button submits a link written in the code
    assert.doesNotMatch(form, /void submit\((?:example|["'`]https?:)/);
  });
});

describe("TikTok pages: practical sections", () => {
  it("adds sections of their own to the four TikTok pages, without repeating a heading or a paragraph", () => {
    const headings: string[] = [], paragraphs: string[] = [];
    for (const entry of platformCandidates.filter(e => e.platform === "tiktok" && e.published)) {
      for (const locale of ["en", "fr"] as const) {
        const copy = approvedPlatformCopy(entry, locale)!;
        assert.ok(copy.details && copy.details.length >= 3, `${entry.id}/${locale}`);
        assert.equal(copy.updated, "2026-10-27");
        for (const section of copy.details) {
          headings.push(section.heading); paragraphs.push(...section.paragraphs);
          assert.ok(section.heading.length >= 12 && section.heading.length <= 70, section.heading);
          assert.doesNotMatch([section.heading, ...section.paragraphs].join(" "), banned);
          assert.doesNotMatch([section.heading, ...section.paragraphs].join(" "), /youtube/i);
        }
      }
    }
    assert.equal(new Set(headings).size, headings.length); assert.equal(new Set(paragraphs).size, paragraphs.length);
  });

  it("drops a page whose practical section is incomplete", () => {
    const entry = platformCandidates.find(e => e.id === "tiktok-mp3")!, copy = entry.copy!.en!;
    const saved = copy.details;
    try {
      copy.details = [{ heading: "Empty section", paragraphs: [] }];
      assert.equal(approvedPlatformCopy(entry, "en"), undefined);
    } finally { copy.details = saved; }
    assert.ok(approvedPlatformCopy(entry, "en"));
  });
});

describe("AdSense tag placement", () => {
  it("loads the tag on content pages only: never on a 404, a noindex draft or the legal page", () => {
    for (const locale of LOCALES) {
      for (const page of sitePages().filter(p => p.locale === locale)) {
        const expected = page.indexable && page.identity.kind !== "legal";
        assert.equal(showsAds(page), expected, `${locale} ${page.path}`);
      }
    }
    assert.equal(showsAds(resolvePage([])), true);
    assert.equal(showsAds(resolvePage(["tiktok-to-mp3"])), true);
    assert.equal(showsAds(resolvePage(["legal"])), false);
    assert.equal(showsAds(resolvePage(["blog", "mp4-vs-webm"])), true, "an unpublished guide");
    assert.equal(showsAds(resolvePage(["missing-page"])), false);
    assert.equal(showsAds(undefined), false);
  });
});

describe("favicon", () => {
  it("ships /favicon.ico with a 48 px image and declares it with the SVG icon", () => {
    const ico = readFileSync("public/favicon.ico");
    assert.deepEqual([...ico.subarray(0, 4)], [0, 0, 1, 0]);
    const count = ico.readUInt16LE(4), sizes = Array.from({ length: count }, (_, i) => ico[6 + 16 * i]);
    assert.ok(sizes.includes(48) && sizes.includes(32) && sizes.includes(16), String(sizes));
    assert.match(source("src/app/(site)/[[...segments]]/layout.tsx"), /\{ url: "\/favicon\.ico", sizes: "48x48" \}, \{ url: "\/icon\.svg", type: "image\/svg\+xml" \}/);
  });
});

describe("contact addresses: vidfetch.app only", () => {
  it("shows every contact address on vidfetch.app, in every language, without changing the gateway dictionaries", () => {
    for (const domain of Object.values(CONTACTS)) assert.match(domain, /^[a-z]+@vidfetch\.app$/);
    for (const locale of LOCALES) {
      const shown = withOfficialContacts(dictionaries[locale]);
      assert.doesNotMatch(JSON.stringify(shown), /vidfetch\.io/, locale);
      for (const key of ["notice1", "privacy6", "report1"] as const) {
        assert.match(shown[key], /@vidfetch\.app\b/, `${locale} ${key}`);
        // only the domain changes: the reviewed sentence stays the same
        assert.equal(shown[key], dictionaries[locale][key].replace(/@vidfetch\.io\b/g, "@vidfetch.app"), `${locale} ${key}`);
      }
    }
    for (const file of ["src/components/Footer.tsx", "src/lib/seo.ts", "src/views/SiteViews.tsx", "src/app/(site)/[[...segments]]/layout.tsx", "src/server/unavailable-api.ts", "src/server/local-api/health.ts"]) assert.doesNotMatch(source(file), /vidfetch\.io/, file);
    assert.match(source("src/views/SiteViews.tsx"), /const d = withOfficialContacts\(dictionary\(page\.locale\)\);/);
    assert.match(source("src/app/(site)/[[...segments]]/layout.tsx"), /messages=\{\{ \.\.\.withOfficialContacts\(d\), privacy1: ADVERTISING_PRIVACY\[locale\] \}\}/);
  });
});
