import type { MetadataRoute } from "next";
import { sitePages, languageAlternates } from "@/lib/site-pages";
import { guides } from "@/lib/guides";
import { CONTENT_UPDATED, SITE } from "@/lib/seo";
export const dynamic = "force-static";
export default function sitemap(): MetadataRoute.Sitemap {
  return sitePages().filter(p => p.indexable).map(page => {
    const identity = page.identity;
    const updated = identity.kind === "guide" ? guides(page.locale).find(g => g.id === identity.id)!.updated : CONTENT_UPDATED;
    return { url: new URL(page.path, SITE.url).href, lastModified: new Date(updated), changeFrequency: "monthly" as const, priority: identity.kind === "home" ? 1 : 0.6, alternates: { languages: languageAlternates(page) } };
  });
}
