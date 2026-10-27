import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { LOCALES, type Locale } from "../src/i18n/config";
import { dictionary } from "../src/i18n/dictionaries";
import { PLATFORM_TOOLS_TITLE, platformCandidates, availablePlatformPages, englishPlatformLinks, platformLinks, type PlatformCandidate, type PlatformCopy } from "../src/lib/platform-pages";
import sitemap from "../src/app/sitemap";
import { YOUTUBE_NOTICE } from "../src/lib/youtube-notice";
import { resolvePage, sitePages, languageAlternates } from "../src/lib/site-pages";
import { localizedMetadata, platformPageSchemas } from "../src/lib/localized-seo";
import { PLATFORM_META, detectPlatform } from "../src/lib/platforms";
import { guides } from "../src/lib/guides";
import { HOME_FAQS, OG_IMAGE, applicationSchema, howToSchema, organisationSchema } from "../src/lib/seo";
import { homeCopy } from "../src/lib/home-copy";
import manifest from "../src/app/manifest";

const PRIORITY: Array<[string, Locale]> = [
  ["tiktok-video-downloader", "en"], ["tiktok-video-downloader", "fr"], ["tiktok-mp3", "en"],
  ["instagram-reels-downloader", "en"], ["instagram-video-downloader", "es"], ["twitter-video-downloader", "en"],
];
const written = platformCandidates.flatMap(entry =>
  Object.entries(entry.copy ?? {}).map(([locale, copy]) => ({ entry, locale: locale as Locale, copy: copy as PlatformCopy })));
const text = (copy: PlatformCopy) => [copy.title, copy.description, copy.heading, copy.intro, ...copy.instructions, ...copy.supported, ...copy.limits,
  ...copy.faqs.flatMap(faq => [faq.question, faq.answer]), ...(copy.details ?? []).flatMap(section => [section.heading, ...section.paragraphs])].join("\n");
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
    const homes = LOCALES.flatMap(locale => [homeCopy(locale).title, homeCopy(locale).description]);
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
      if (/10 minut/.test(all)) assert.match(engine, /operationMs: 10 \* 60 \* 1000/);
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
  it("publishes exactly the four approved TikTok pages; Instagram and X stay gated and not indexable", () => {
    const open = { authorizedMediaVerified: true, copyReviewed: true, permissionToPublish: true };
    const shut = { authorizedMediaVerified: false, copyReviewed: false, permissionToPublish: false };
    for (const [id] of PRIORITY) {
      const entry = platformCandidates.find(e => e.id === id) as PlatformCandidate;
      const tiktok = entry.platform === "tiktok";
      assert.equal(entry.published, tiktok, id);
      assert.deepEqual(entry.gate, tiktok ? open : shut, id);
    }
    const published = LOCALES.flatMap(locale => availablePlatformPages(locale).map(entry => `${locale}:${entry.id}`));
    assert.deepEqual(published, ["en:tiktok-video-downloader", "en:tiktok-mp3", "fr:tiktok-video-downloader", "fr:tiktok-mp3"]);
    for (const segments of [["tiktok-video-downloader"], ["tiktok-to-mp3"], ["fr", "telecharger-video-tiktok"], ["fr", "tiktok-en-mp3"]]) assert.equal(resolvePage(segments)?.indexable, true, segments.join("/"));
    // an unverified platform has no page at all (404), not even a noindex one that names it
    for (const segments of [["instagram-reels-downloader"], ["twitter-video-downloader"], ["youtube-video-downloader"]]) assert.equal(resolvePage(segments), undefined, segments.join("/"));
    for (const segments of [["es", "descargar-video-instagram"], ["fr", "telecharger-reels-instagram"], ["fr", "telecharger-video-x"], ["tiktok-mp3"]]) assert.equal(resolvePage(segments), undefined, segments.join("/"));
    assert.equal(sitePages().filter(p => p.indexable).length, 20);
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
    assert.deepEqual(LOCALES.map(locale => platformLinks(locale).map(l => l.href)), [["/tiktok-video-downloader", "/tiktok-to-mp3"], ["/fr/telecharger-video-tiktok", "/fr/tiktok-en-mp3"], [], [], [], [], [], []]);
    approved(["tiktok-video-downloader", "tiktok-mp3"], () => {
      assert.deepEqual(platformLinks("en").map(l => l.href), ["/tiktok-video-downloader", "/tiktok-to-mp3"]);
      assert.deepEqual(platformLinks("en", "tiktok-mp3").map(l => l.href), ["/tiktok-video-downloader"]);
      assert.deepEqual(platformLinks("fr").map(l => l.href), ["/fr/telecharger-video-tiktok", "/fr/tiktok-en-mp3"]);
      assert.deepEqual(platformLinks("es"), []);
      for (const link of platformLinks("en")) assert.equal(resolvePage(link.href.split("/").filter(Boolean))?.indexable, true);
    });
    for (const locale of LOCALES) assert.ok(PLATFORM_TOOLS_TITLE[locale].trim().length > 5);
  });

  it("links a home with no page of its own to the English pages, labelled in its language and marked as English", () => {
    // en has its own pages; fr now has both TikTok pages in French: neither links to English pages
    assert.deepEqual(englishPlatformLinks("en"), []);
    assert.deepEqual(englishPlatformLinks("fr"), []);
    for (const locale of LOCALES.filter(l => l !== "en" && l !== "fr")) {
      const links = englishPlatformLinks(locale);
      assert.deepEqual(links.map(l => l.href), ["/tiktok-video-downloader", "/tiktok-to-mp3"], locale);
      for (const link of links) {
        assert.equal(resolvePage(link.href.split("/").filter(Boolean))?.indexable, true, link.href);
        assert.ok(link.label.trim().length > 10 && link.note.trim().length > 5, locale);
        assert.doesNotMatch(link.label, /youtube|watermark|filigrane/i);
      }
    }
    // only approved English pages are ever linked: an unpublished English page is not
    assert.equal(englishPlatformLinks("es").some(l => /instagram|twitter|youtube/.test(l.href)), false);
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

  it("keeps only published, indexable pages as app shortcuts", () => {
    const shortcuts = manifest().shortcuts ?? [];
    assert.deepEqual(shortcuts.map(s => s.url), ["/tiktok-video-downloader", "/tiktok-to-mp3"]);
    for (const s of shortcuts) assert.equal(resolvePage(s.url.split("/").filter(Boolean))?.indexable, true, s.url);
    assert.deepEqual(shortcuts.map(s => s.short_name), ["TikTok MP4", "TikTok MP3"]);
  });

  it("answers a YouTube link at once, without an example, a verification or a request", () => {
    for (const locale of LOCALES) {
      const notice = YOUTUBE_NOTICE[locale];
      assert.ok(notice.title.trim().length > 10 && notice.text.trim().length > 60, locale);
      assert.match(`${notice.title} ${notice.text}`, /YouTube|يوتيوب/, locale);
      assert.match(notice.text, /TikTok|تيك توك/, locale);
    }
    const form = source("src/components/FetchForm.tsx");
    // no example button at all (none could start a download of someone else's video), no YouTube fallback example
    assert.doesNotMatch(form, /EXAMPLES|d\.examples|submit\(example/);
    assert.doesNotMatch(form, /PLATFORM_META\.youtube\.examples/);
    // the early return comes before the verification and before any request
    const submit = form.slice(form.indexOf("const submit = useCallback"), form.indexOf("useEffect(() => {\n    if (authorized && pending.current)"));
    const early = submit.indexOf('if (check.platform === "youtube")');
    assert.ok(early > 0 && early < submit.indexOf("if (!authorized)") && early < submit.indexOf("postJson"), "YouTube returns before verification and requests");
    assert.match(form, /canSubmit = detection\.ok && !youtube && !loading/);
    assert.match(form, /verificationNeeded && !youtube && <DownloadAccess/);
  });

  it("dates each page by its last substantial change in the sitemap and its structured data", () => {
    const lastmod = Object.fromEntries(sitemap().map(e => [decodeURIComponent(new URL(e.url).pathname), new Date(e.lastModified!).toISOString().slice(0, 10)]));
    for (const path of ["/tiktok-video-downloader", "/tiktok-to-mp3", "/fr/telecharger-video-tiktok", "/fr/tiktok-en-mp3"]) assert.equal(lastmod[path], "2026-10-27", path);
    // the English and French homes' search copy changed on 27/10, then became generic again on 28/10; the other homes
    // (wording unchanged) and the legal pages did not change substantially: their shared date stays
    for (const path of ["/", "/fr/"]) assert.equal(lastmod[path], "2026-10-28", path);
    for (const path of ["/es/", "/ar/"]) assert.equal(lastmod[path], "2026-10-12", path);
    for (const path of ["/legal", "/fr/mentions-legales"]) assert.equal(lastmod[path], "2026-10-12", path);
    assert.equal(Object.keys(lastmod).length, 20);
  });

  it("gives /fr/tiktok-en-mp3 copy of its own, distinct from the French video page and free of unverified claims", () => {
    const mp3 = platformCandidates.find(e => e.id === "tiktok-mp3")!.copy!.fr!, video = platformCandidates.find(e => e.id === "tiktok-video-downloader")!.copy!.fr!;
    assert.notEqual(mp3.title, video.title); assert.notEqual(mp3.description, video.description); assert.notEqual(mp3.intro, video.intro);
    const shared = mp3.faqs.filter(f => video.faqs.some(v => v.question === f.question || v.answer === f.answer)).length;
    assert.ok(shared <= 1, `FAQ shared with the video page: ${shared}`);
    assert.doesNotMatch(text(mp3), /sans filigrane|sans watermark|sans logo|320 kbps (?:disponible|garanti)|illimit/i);
    assert.match(text(mp3), /192 kbps/);
    assert.ok(`${mp3.title} | VidFetch`.length <= 60 && mp3.description.length <= 160);
    const page = resolvePage(["fr", "tiktok-en-mp3"])!;
    assert.deepEqual(languageAlternates(page), { en: "https://vidfetch.app/tiktok-to-mp3", fr: "https://vidfetch.app/fr/tiktok-en-mp3", "x-default": "https://vidfetch.app/tiktok-to-mp3" });
  });

  it("ships a social image without platform claims", () => {
    assert.equal(OG_IMAGE.url, "/og-image-v3.jpg");
    assert.ok(existsSync(`public${OG_IMAGE.url}`));
    assert.doesNotMatch(source("public/og-image.svg"), /YouTube/);
  });
});
