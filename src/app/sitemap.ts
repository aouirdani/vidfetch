import { guides } from "@/lib/guides";
import type { MetadataRoute } from "next";
import { CONTENT_UPDATED, LANDING_PAGES, SITE } from "@/lib/seo";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(CONTENT_UPDATED);
  return [
    { url: SITE.url, lastModified, changeFrequency: "weekly", priority: 1 },
    ...LANDING_PAGES.map((page) => ({
      url: `${SITE.url}/${page.slug}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    { url: `${SITE.url}/blog`, lastModified, changeFrequency: "monthly" as const, priority: 0.7 },
    ...guides().map(g => ({ url: `${SITE.url}/blog/${g.slug}`, lastModified: new Date(g.updated), changeFrequency: "monthly" as const, priority: 0.6 })),
    { url: `${SITE.url}/legal`, lastModified, changeFrequency: "yearly" as const, priority: 0.3 },
  ];
}
