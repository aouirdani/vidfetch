import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HOME_FAQS, LANDING_PAGES, SITE, applicationSchema, breadcrumbSchema, faqSchema, howToSchema, jsonLdGraph, landingPageFor, organisationSchema, pageMetadata, websiteSchema } from "../src/lib/seo";
import { detectPlatform } from "../src/lib/platforms";
import { readFileSync } from "node:fs";

describe("page metadata", () => {
  it("builds absolute titles and canonical paths without duplicate branding", () => {
    const meta = pageMetadata({ title: "Example Downloader | VidFetch", description: "Example", path: "/example-downloader" });
    assert.deepEqual(meta.title, { absolute: "Example Downloader | VidFetch" });
    assert.equal(meta.alternates?.canonical, "/example-downloader");
    assert.equal(meta.openGraph?.url, `${SITE.url}/example-downloader`);
    assert.equal(String(meta.title && typeof meta.title === "object" && "absolute" in meta.title ? meta.title.absolute : "").split("VidFetch").length - 1, 1);
  });
  it("keeps the home canonical at the site root", () => {
    assert.equal(pageMetadata({ title: "Home", description: "Home", path: "/" }).alternates?.canonical, "/");
  });
  it("attaches the social share image to every page", () => {
    const meta = pageMetadata({ title: "T", description: "D", path: "/legal" });
    assert.match(JSON.stringify(meta.openGraph?.images), /og-image\.jpg/);
    assert.match(JSON.stringify(meta.twitter), /og-image\.jpg/);
  });
});

describe("landing pages", () => {
  it("exposes one indexable page per supported platform", () => {
    assert.equal(LANDING_PAGES.length, 4);
    assert.equal(new Set(LANDING_PAGES.map((page) => page.platform)).size, 4);
  });
  it("uses unique, length-appropriate titles and descriptions", () => {
    const titles = LANDING_PAGES.map((page) => page.metaTitle);
    const descriptions = LANDING_PAGES.map((page) => page.metaDescription);
    assert.equal(new Set(titles).size, titles.length);
    assert.equal(new Set(descriptions).size, descriptions.length);
    for (const title of titles) assert.ok(title.length <= 60, `Title too long for search results: ${title}`);
    for (const description of descriptions) assert.ok(description.length >= 110 && description.length <= 165, `Description length out of range: ${description.length}`);
  });
  it("uses lowercase, hyphenated, keyword-bearing slugs", () => {
    for (const page of LANDING_PAGES) {
      assert.match(page.slug, /^[a-z][a-z0-9-]+[a-z0-9]$/);
      assert.ok(page.slug.includes("downloader"));
    }
  });
  it("documents real capabilities and honest limitations", () => {
    for (const page of LANDING_PAGES) {
      assert.ok(page.supported.length >= 3 && page.limits.length >= 3);
      assert.ok(page.faqs.length >= 3);
    }
  });
  it("resolves slugs and rejects unknown ones", () => {
    assert.equal(landingPageFor("tiktok-video-downloader")?.platform, "tiktok");
    assert.equal(landingPageFor("unknown-page"), undefined);
  });
  it("keeps marketing claims consistent with supported URL detection", () => {
    for (const page of LANDING_PAGES) {
      const example = page.supported.join(" ").match(/https?:\/\/\S+/);
      if (example) assert.equal(detectPlatform(example[0]).platform, page.platform);
    }
  });
});

describe("structured data", () => {
  const parse = (json: string) => JSON.parse(json) as { "@context": string; "@graph": Array<Record<string, unknown>> };
  it("emits a valid, single-context graph", () => {
    const graph = parse(jsonLdGraph([organisationSchema(), websiteSchema(), applicationSchema()]));
    assert.equal(graph["@context"], "https://schema.org");
    assert.deepEqual(graph["@graph"].map((node) => node["@type"]), ["Organization", "WebSite", "WebApplication"]);
    assert.equal(new Set(graph["@graph"].map((node) => node["@id"])).size, 3);
  });
  it("describes the application as a free web app", () => {
    const app = applicationSchema() as Record<string, unknown>;
    assert.equal(app.isAccessibleForFree, true);
    assert.deepEqual(app.offers, { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" });
    // Invented ratings violate Google's structured data policies.
    assert.equal("aggregateRating" in app, false);
    assert.equal("review" in app, false);
  });
  it("mirrors visible FAQ copy in FAQPage markup", () => {
    const faq = faqSchema(HOME_FAQS, `${SITE.url}/`) as { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> };
    assert.equal(faq.mainEntity.length, HOME_FAQS.length);
    assert.equal(faq.mainEntity[0].name, HOME_FAQS[0].question);
    assert.equal(faq.mainEntity[0].acceptedAnswer.text, HOME_FAQS[0].answer);
  });
  it("numbers HowTo steps and breadcrumbs in order", () => {
    const steps = (howToSchema(SITE.url) as { step: Array<{ position: number }> }).step;
    assert.deepEqual(steps.map((step) => step.position), [1, 2, 3]);
    const crumbs = breadcrumbSchema([{ name: "Home", path: "/" }, { name: "TikTok", path: "/tiktok-video-downloader" }]) as { itemListElement: Array<{ position: number; item: string }> };
    assert.deepEqual(crumbs.itemListElement.map((item) => item.item), [SITE.url, `${SITE.url}/tiktok-video-downloader`]);
  });
});

describe("public data exposure", () => {
  // Source-level guards: these fail if a per-transfer feed is reintroduced,
  // which would publish the titles and links of what people download.
  const statsSource = readFileSync("src/lib/stats.ts", "utf8");
  const apiSource = readFileSync("src/lib/api.ts", "utf8");

  it("never selects individual download rows for the public dashboard", () => {
    assert.doesNotMatch(statsSource, /recent/i);
    assert.doesNotMatch(statsSource, /downloads\.title|downloads\.qualityLabel/);
    assert.doesNotMatch(statsSource, /\.limit\(/);
  });

  it("types the public stats payload as aggregates only", () => {
    // Match through the "};" that closes the declaration, not a nested object.
    const body = apiSource.match(/export type StatsPayload = \{[\s\S]*?\n\};/)?.[0] ?? "";
    assert.ok(body.length > 0, "StatsPayload type should be declared in src/lib/api.ts");
    assert.doesNotMatch(body, /recent|title/i);
    for (const key of ["totals", "platforms", "engine"]) assert.ok(body.includes(key), `StatsPayload should expose ${key}`);
  });
});
