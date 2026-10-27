import type { MetadataRoute } from "next";
import { sitePages, languageAlternates } from "@/lib/site-pages";
import { guides } from "@/lib/guides";
import { CONTENT_UPDATED, SITE } from "@/lib/seo";
import { platformPageUpdated } from "@/lib/platform-pages";
import { HOME_UPDATED } from "@/lib/home-copy";
export const dynamic = "force-static";
export default function sitemap(): MetadataRoute.Sitemap {
  return sitePages().filter(p => p.indexable).map(page => {
    const identity = page.identity;
    // Each page's own last substantial change: a guide's date, an approved platform page's copy date, the home copy's
    // date, otherwise the shared content date of the legal pages.
    const updated = identity.kind === "guide" ? guides(page.locale).find(g => g.id === identity.id)!.updated
      : identity.kind === "platform" ? platformPageUpdated(identity.id, page.locale) ?? CONTENT_UPDATED : identity.kind === "home" ? HOME_UPDATED : CONTENT_UPDATED;
    return { url: new URL(page.path, SITE.url).href, lastModified: new Date(updated), changeFrequency: "monthly" as const, priority: identity.kind === "home" ? 1 : 0.6, alternates: { languages: languageAlternates(page) } };
  });
}
