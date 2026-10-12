import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HOME_FAQS, LANDING_PAGES, SITE, applicationSchema, breadcrumbSchema, faqSchema, howToSchema, jsonLdGraph, landingPageFor, organisationSchema, pageMetadata, websiteSchema } from "../src/lib/seo";
import { detectPlatform } from "../src/lib/platforms";
import { existsSync, readFileSync } from "node:fs";

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
    assert.match(JSON.stringify(meta.openGraph?.images), /og-image-v2\.jpg/);
    assert.match(JSON.stringify(meta.twitter), /og-image-v2\.jpg/);
  });
  it("ships the JPEG referenced by social metadata", () => {
    const image = readFileSync("public/og-image-v2.jpg");
    assert.deepEqual([...image.subarray(0, 2)], [0xff, 0xd8]);
    assert.ok(image.length > 1000);
  });
});

describe("landing pages", () => {
  it("preserves the four curated historical platform slugs", () => {
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
    assert.deepEqual(app.offers, { "@type": "Offer", price: "0", priceCurrency: "USD" });
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
  // The usage dashboard was removed. These guards fail if any part of it comes
  // back, since it published what other people were downloading.
  const sources = ["src/lib/api.ts", "src/views/SiteViews.tsx", "src/components/VideoCard.tsx"]
    .map((file) => readFileSync(file, "utf8")).join("\n");

  it("ships no stats endpoint, module or panel", () => {
    for (const path of ["src/lib/stats.ts", "src/app/api/stats/route.ts", "src/components/StatsPanel.tsx", "src/components/ActivityPanel.tsx"]) {
      assert.equal(existsSync(path), false, `${path} should not exist`);
    }
  });

  it("leaves no client code calling the removed endpoint", () => {
    assert.doesNotMatch(sources, /api\/stats/);
    assert.doesNotMatch(sources, /StatsPayload/);
    assert.doesNotMatch(sources, /ActivityPanel/);
  });

  it("keeps a usage dashboard out of the rendered page", () => {
    const home = readFileSync("src/views/SiteViews.tsx", "utf8");
    assert.doesNotMatch(home, /Service activity|Links analyzed|Recent transfers/i);
  });
});
