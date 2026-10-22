import type { Metadata } from "next";
import { dictionary } from "../i18n/dictionaries";
import { LANGUAGES, homePath, type Locale } from "../i18n/config";
import { guides } from "./guides";
import { CONTENT_UPDATED, OG_IMAGE, SITE, landingPageFor } from "./seo";
import { PLATFORM_META } from "./platforms";
import { availablePlatformPages, approvedPlatformCopy } from "./platform-pages";
import { languageAlternates, type SitePage } from "./site-pages";
export function localizedMetadata(page: SitePage): Metadata {
  const d = dictionary(page.locale), identity = page.identity, kind = identity.kind;
  const guide = identity.kind === "guide" ? guides(page.locale).find(g => g.id === identity.id) : undefined;
  const approved = identity.kind === "platform" ? availablePlatformPages(page.locale).find(entry => entry.id === identity.id) : undefined;
  const platformCopy = approved && approvedPlatformCopy(approved, page.locale);
  const platformName = identity.kind === "platform" ? PLATFORM_META[approved?.platform ?? landingPageFor(identity.id)!.platform].name : "";
  const title = guide ? `${guide.title} | VidFetch` : platformCopy ? `${platformCopy.title} | VidFetch` : kind === "home" ? d.metaTitle : kind === "blog" ? d.blogMetaTitle : kind === "legal" ? `${d.legalTitle} | VidFetch` : `${platformName} — ${d.unverifiedTitle} | VidFetch`;
  const description = guide?.description ?? platformCopy?.description ?? (kind === "home" ? d.metaDescription : kind === "blog" ? d.blogMetaDescription : kind === "legal" ? d.legalDescription : d.unverifiedDescription);
  const url = new URL(page.path, SITE.url).href;
  return { title: { absolute: title }, description,
    alternates: { canonical: url, ...(page.indexable ? { languages: languageAlternates(page) } : {}) },
    robots: { index: page.indexable, follow: true },
    openGraph: { type: guide ? "article" : "website", url, title, description, siteName: SITE.name, locale: LANGUAGES[page.locale].og,
      alternateLocale: Object.keys(languageAlternates(page)).filter(l => l !== page.locale && l !== "x-default").map(l => LANGUAGES[l as Locale].og), images: [{ ...OG_IMAGE, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [{ url: OG_IMAGE.url, alt: title }] },
  };
}
export function localizedIdentity(locale: Locale) {
  const d = dictionary(locale), url = new URL(homePath(locale), SITE.url).href;
  return [{ "@type": "Organization", "@id": `${SITE.url}/#organization`, name: SITE.name, url: SITE.url, description: d.footerAbout,
    logo: { "@type": "ImageObject", url: `${SITE.url}${OG_IMAGE.url}` } },
  { "@type": "WebSite", "@id": `${url}#website`, name: SITE.name, url, inLanguage: locale, publisher: { "@id": `${SITE.url}/#organization` } }];
}
/** Approved platform page: the visible breadcrumb and the tool the page offers, described only with its visible copy. */
export function platformPageSchemas(page: SitePage, copy: { title: string; description: string; heading: string; supported: string[] }) {
  const d = dictionary(page.locale), url = new URL(page.path, SITE.url).href, home = new URL(homePath(page.locale), SITE.url).href;
  return [
    { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: [
      { "@type": "ListItem", position: 1, name: d.home, item: home },
      { "@type": "ListItem", position: 2, name: copy.title, item: url }] },
    { "@type": "WebApplication", "@id": `${url}#app`, name: copy.heading, url, description: copy.description, inLanguage: page.locale,
      applicationCategory: "MultimediaApplication", operatingSystem: "Web", isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, featureList: copy.supported, publisher: { "@id": `${SITE.url}/#organization` } },
  ];
}
export function localizedPageSchema(page: SitePage, name: string, description: string, modified: string = CONTENT_UPDATED) {
  const url = new URL(page.path, SITE.url).href;
  return { "@type": "WebPage", "@id": `${url}#page`, name, description, url, inLanguage: page.locale, dateModified: modified,
    isPartOf: { "@id": `${new URL(homePath(page.locale), SITE.url).href}#website` } };
}
