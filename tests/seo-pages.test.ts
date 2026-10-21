import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { LOCALES, type Locale } from "../src/i18n/config";
import { dictionary } from "../src/i18n/dictionaries";
import { PLATFORM_TOOLS_TITLE, platformCandidates, availablePlatformPages, platformLinks, type PlatformCandidate, type PlatformCopy } from "../src/lib/platform-pages";
import { resolvePage, sitePages, languageAlternates } from "../src/lib/site-pages";
import { localizedMetadata, platformPageSchemas } from "../src/lib/localized-seo";
import { PLATFORM_META, detectPlatform } from "../src/lib/platforms";
import { guides } from "../src/lib/guides";
import { HOME_FAQS, OG_IMAGE, applicationSchema, howToSchema, organisationSchema } from "../src/lib/seo";
import manifest from "../src/app/manifest";

const PRIORITY: Array<[string, Locale]> = [
  ["tiktok-video-downloader", "en"], ["tiktok-video-downloader", "fr"], ["tiktok-mp3", "en"],
  ["instagram-reels-downloader", "en"], ["instagram-video-downloader", "es"], ["twitter-video-downloader", "en"],
];
const written = platformCandidates.flatMap(entry =>
  Object.entries(entry.copy ?? {}).map(([locale, copy]) => ({ entry, locale: locale as Locale, copy: copy as PlatformCopy })));
const text = (copy: PlatformCopy) => [copy.title, copy.description, copy.heading, copy.intro, ...copy.instructions, ...copy.supported, ...copy.limits,
  ...copy.faqs.flatMap(faq => [faq.question, faq.answer])].join("\n");
const source = (file: string) => readFileSync(file, "utf8");
/** Approve entries in memory for one test, then put the catalogue back exactly as it was. */
function approved<T>(ids: string[], run: () => T): T {
  const saved = platformCandidates.map(entry => JSON.stringify({ published: entry.published, gate: entry.gate }));
  try {
    for (const entry of platformCandidates.filter(e => ids.includes(e.id))) {
      entry.published = true;
      entry.gate = { authorizedMediaVerified: true, copyReviewed: true, permissionToPublish: true };
    }
    return run();
  } finally {
    platformCandidates.forEach((entry, i) => Object.assign(entry, JSON.parse(saved[i])));
  }
}

describe("priority platform pages: copy", () => {
  it("has complete, ready copy for the six priority pages", () => {
    for (const [id, locale] of PRIORITY) {
      const copy = platformCandidates.find(e => e.id === id)?.copy?.[locale];
      assert.ok(copy, `${id}/${locale} missing`);
      assert.equal(copy.status, "ready");
      assert.ok(copy.instructions.length >= 3 && copy.supported.length >= 1 && copy.limits.length >= 1 && copy.faqs.length >= 3, `${id}/${locale} incomplete`);
      assert.match(copy.publishedAt, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(copy.sections?.steps && copy.sections.formats && copy.sections.faq, `${id}/${locale}: page-specific H2 headings missing`);
    }
  });

  it("gives every priority page its own H1 and H2 outline", () => {
    const outlines = PRIORITY.map(([id, locale]) => {
      const copy = platformCandidates.find(e => e.id === id)!.copy![locale]!;
      return [copy.heading, copy.sections!.steps!, copy.sections!.formats!, copy.sections!.faq!];
    });
    const all = outlines.flat();
    assert.equal(new Set(all).size, all.length, "a heading is repeated across pages");
    for (const outline of outlines) assert.ok(outline.every(h => h.length >= 12 && h.length <= 70));
  });

  it("uses unique titles and descriptions that fit search results, distinct from every home page", () => {
    const titles = written.map(w => `${w.copy.title} | VidFetch`), descriptions = written.map(w => w.copy.description);
    const homes = LOCALES.flatMap(locale => [dictionary(locale).metaTitle, dictionary(locale).metaDescription]);
    assert.equal(new Set([...titles, ...homes.filter((_, i) => i % 2 === 0)]).size, titles.length + LOCALES.length);
    assert.equal(new Set([...descriptions, ...homes.filter((_, i) => i % 2 === 1)]).size, descriptions.length + LOCALES.length);
    for (const title of titles) assert.ok(title.length <= 60, `title too long: ${title}`);
    for (const description of descriptions) assert.ok(description.length >= 110 && description.length <= 160, `description ${description.length}: ${description}`);
  });

  it("names the platform in each heading and keeps one intent per page", () => {
    for (const { entry, locale, copy } of written) {
      const names = entry.platform === "twitter" ? ["X", "Twitter"] : [PLATFORM_META[entry.platform].name];
      assert.ok(names.some(name => copy.heading.includes(name)), `${entry.id}/${locale}: ${copy.heading}`);
    }
    const intents = written.map(w => `${w.locale}:${w.copy.heading.toLowerCase()}`);
    assert.equal(new Set(intents).size, intents.length);
  });

  it("states only limits that the engine and the gateway enforce", () => {
    const engine = source("backend/server.ts"), gateway = source("backend/gateway/main.ts"), ledger = source("backend/gateway/ledger.ts");
    for (const { entry, locale, copy } of written) {
      const all = text(copy);
      if (/256\s?(MB|Mo)/.test(all)) { assert.match(engine, /maxBytes: 256 \* 1024 \* 1024/); assert.match(gateway, /VIDFETCH_PUBLIC_MAX_MIB",onPi\?16:256,1,256/); }
      if (/30 minut/.test(all)) assert.match(engine, /maxDuration: 30 \* 60/);
      if (/192 kbps/.test(all)) assert.match(engine, /"-b:a", "192k"/);
      if (/\b8 (downloads|téléchargements|descargas)\b/.test(all)) assert.match(ledger, /index === 2 \? 100 : 8/);
      assert.ok(!/\d+\s?(GB|Go)\b/.test(all) || /1 Gio|1 GB/.test(all), `${entry.id}/${locale}: undocumented size`);
    }
  });

  it("only shows example links that the URL detector accepts for that platform", () => {
    for (const { entry, copy } of written) {
      for (const url of copy.supported.join(" ").match(/https?:\/\/[^\s…]+(?=\s|$)/g) ?? []) {
        if (url.includes("…")) continue;
        assert.equal(detectPlatform(url).platform, entry.platform, url);
      }
    }
  });

  it("makes no YouTube promise outside YouTube pages and no superlative or unlimited claim", () => {
    const banned = /\b(best|fastest|unlimited|guaranteed|100\s?%)\b|illimit|garanti|le meilleur|el mejor|ilimitad|sin límites/i;
    for (const { entry, locale, copy } of written) {
      if (entry.platform !== "youtube") assert.doesNotMatch(text(copy), /youtube|youtu\.be/i, `${entry.id}/${locale}`);
      assert.doesNotMatch(text(copy), banned, `${entry.id}/${locale}`);
      assert.doesNotMatch(text(copy), /without (a )?watermark guaranteed|sans filigrane garanti/i);
    }
  });

  it("links only to guides that exist", () => {
    const ids = new Set(guides("en").map(g => g.id));
    for (const { entry, copy } of written) for (const id of copy.relatedGuides) assert.ok(ids.has(id), `${entry.id}: ${id}`);
  });
});

describe("priority platform pages: publication", () => {
  it("publishes exactly the three approved TikTok pages; Instagram and X stay gated and not indexable", () => {
    const open = { authorizedMediaVerified: true, copyReviewed: true, permissionToPublish: true };
    const shut = { authorizedMediaVerified: false, copyReviewed: false, permissionToPublish: false };
    for (const [id] of PRIORITY) {
      const entry = platformCandidates.find(e => e.id === id) as PlatformCandidate;
      const tiktok = entry.platform === "tiktok";
      assert.equal(entry.published, tiktok, id);
      assert.deepEqual(entry.gate, tiktok ? open : shut, id);
    }
    const published = LOCALES.flatMap(locale => availablePlatformPages(locale).map(entry => `${locale}:${entry.id}`));
    assert.deepEqual(published, ["en:tiktok-video-downloader", "en:tiktok-mp3", "fr:tiktok-video-downloader"]);
    for (const segments of [["tiktok-video-downloader"], ["tiktok-to-mp3"], ["fr", "telecharger-video-tiktok"]]) assert.equal(resolvePage(segments)?.indexable, true, segments.join("/"));
    for (const segments of [["instagram-reels-downloader"], ["twitter-video-downloader"], ["youtube-video-downloader"]]) assert.equal(resolvePage(segments)?.indexable, false, segments.join("/"));
    for (const segments of [["es", "descargar-video-instagram"], ["fr", "telecharger-reels-instagram"], ["fr", "telecharger-video-x"], ["tiktok-mp3"]]) assert.equal(resolvePage(segments), undefined, segments.join("/"));
    assert.equal(sitePages().filter(p => p.indexable).length, 19);
  });

  it("once approved: indexable, self-canonical, reciprocal hreflang, in the sitemap, with structured data from the visible copy", () => {
    approved(["tiktok-video-downloader"], () => {
      const en = resolvePage(["tiktok-video-downloader"])!, fr = resolvePage(["fr", "telecharger-video-tiktok"])!;
      assert.equal(en.indexable && fr.indexable, true);
      const metaEn = localizedMetadata(en), metaFr = localizedMetadata(fr);
      assert.deepEqual(metaEn.robots, { index: true, follow: true });
      assert.equal(metaEn.alternates?.canonical, "https://vidfetch.app/tiktok-video-downloader");
      assert.equal(metaFr.alternates?.canonical, "https://vidfetch.app/fr/telecharger-video-tiktok");
      const expected = { en: "https://vidfetch.app/tiktok-video-downloader", fr: "https://vidfetch.app/fr/telecharger-video-tiktok", "x-default": "https://vidfetch.app/tiktok-video-downloader" };
      assert.deepEqual(languageAlternates(en), expected);
      assert.deepEqual(languageAlternates(fr), expected);
      const copy = platformCandidates.find(e => e.id === "tiktok-video-downloader")!.copy!.en!;
      assert.equal((metaEn.title as { absolute: string }).absolute, `${copy.title} | VidFetch`);
      const paths = sitePages().filter(p => p.indexable).map(p => p.path);
      assert.ok(paths.includes("/tiktok-video-downloader") && paths.includes("/fr/telecharger-video-tiktok"));
      const [crumbs, app] = platformPageSchemas(en, copy) as Array<Record<string, unknown>>;
      assert.equal(crumbs["@type"], "BreadcrumbList");
      assert.equal((crumbs.itemListElement as unknown[]).length, 2);
      assert.equal(app["@type"], "WebApplication");
      assert.deepEqual(app.featureList, copy.supported);
      assert.equal("aggregateRating" in app || "review" in app, false);
      assert.doesNotMatch(JSON.stringify([crumbs, app]), /youtube/i);
    });
    // and the catalogue is back to what is published: the two English TikTok pages
    assert.deepEqual(availablePlatformPages("en").map(e => e.id), ["tiktok-video-downloader", "tiktok-mp3"]);
  });

  it("links approved pages contextually from the home page and from each other, in their own language only", () => {
    // published today: TikTok only
    assert.deepEqual(LOCALES.map(locale => platformLinks(locale).map(l => l.href)), [["/tiktok-video-downloader", "/tiktok-to-mp3"], ["/fr/telecharger-video-tiktok"], [], [], [], [], [], []]);
    approved(["tiktok-video-downloader", "tiktok-mp3"], () => {
      assert.deepEqual(platformLinks("en").map(l => l.href), ["/tiktok-video-downloader", "/tiktok-to-mp3"]);
      assert.deepEqual(platformLinks("en", "tiktok-mp3").map(l => l.href), ["/tiktok-video-downloader"]);
      assert.deepEqual(platformLinks("fr").map(l => l.href), ["/fr/telecharger-video-tiktok"]);
      assert.deepEqual(platformLinks("es"), []);
      for (const link of platformLinks("en")) assert.equal(resolvePage(link.href.split("/").filter(Boolean))?.indexable, true);
    });
    for (const locale of LOCALES) assert.ok(PLATFORM_TOOLS_TITLE[locale].trim().length > 5);
  });

  it("gives a single-language page no foreign alternate", () => {
    approved(["instagram-video-downloader"], () => {
      const es = resolvePage(["es", "descargar-video-instagram"])!;
      assert.equal(es.indexable, true);
      assert.deepEqual(languageAlternates(es), { es: "https://vidfetch.app/es/descargar-video-instagram" });
    });
  });
});

describe("site-wide claims", () => {
  it("keeps YouTube out of the manifest and of the shared structured-data defaults", () => {
    const m = manifest();
    assert.doesNotMatch(m.description ?? "", /youtube/i);
    assert.equal((m.shortcuts ?? []).some(s => /youtube/i.test(`${s.name} ${s.url}`)), false);
    assert.doesNotMatch(JSON.stringify([organisationSchema(), applicationSchema(), howToSchema("https://vidfetch.app")]), /youtube/i);
  });

  it("does not claim the site has no advertising and says YouTube is blocked where it is named", () => {
    assert.doesNotMatch(JSON.stringify(HOME_FAQS), /no advertising|shows no ads/i);
    const platforms = HOME_FAQS.find(f => /platforms/i.test(f.question))!;
    assert.match(platforms.answer, /YouTube[^.]*blocked/);
  });

  it("ships a social image without platform claims", () => {
    assert.equal(OG_IMAGE.url, "/og-image-v3.jpg");
    assert.ok(existsSync(`public${OG_IMAGE.url}`));
    assert.doesNotMatch(source("public/og-image.svg"), /YouTube/);
  });
});
