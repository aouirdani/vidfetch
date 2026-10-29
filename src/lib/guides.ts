import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { SITE, OG_IMAGE } from "./seo";
import { articlePath, type Locale } from "../i18n/config";

export type Guide = { id: string; locale: Locale; slug: string; title: string; seoTitle?: string; publicationRequested?: boolean; description: string; category: string; created: string; updated: string; published: string | null; status: "ready" | "review" | "draft"; review?: { linguistic: "pending" | "approved"; technical: "pending" | "approved"; reviewer: string | null; reviewedAt: string | null }; sourceSha256?: string; sourceBodySha256?: string; related: string[]; sources: { title: string; url: string }[]; body: string; minutes: number };
const catalogues = new Map<Locale, Guide[]>();
export function guides(locale: Locale = "en"): Guide[] {
  const cached = catalogues.get(locale); if (cached) return cached;
  const directory = join(process.cwd(), "content/guides", ...(locale === "en" ? [] : [locale]));
  if (locale !== "en" && !existsSync(directory)) return [];
  const result = readdirSync(directory).filter(file => /^[a-z0-9-]+\.md$/.test(file)).map(file => {
    const source = readFileSync(join(directory, file), "utf8");
    const match = /^---\n([\s\S]+?)\n---\n([\s\S]+)$/.exec(source);
    if (!match) throw new Error(`Invalid guide: ${file}`);
    const meta = JSON.parse(match[1]) as Omit<Guide, "body" | "minutes">;
    const body = match[2].trim();
    if (!["ready", "review", "draft"].includes(meta.status) || !meta.title || !meta.description || !/^\d{4}-\d{2}-\d{2}$/.test(meta.updated)) throw new Error(`Invalid guide metadata: ${file}`);
    const slug = meta.slug ?? file.slice(0, -3);
    if (!/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug)) throw new Error(`Invalid guide slug: ${file}`);
    return { ...meta, id: file.slice(0, -3), locale, slug, body, minutes: Math.max(1, Math.ceil(body.split(/\s+/).length / 220)) };
  });
  catalogues.set(locale, result); return result;
}
export function guideFor(slug: string, locale: Locale = "en") { return guides(locale).find(guide => guide.slug === slug); }
export function isReviewedGuide(guide: Guide) {
  if (guide.status !== "ready") return false;
  if (guide.locale === "en") return true;
  const original = guides().find(g => g.id === guide.id);
  const currentSource = original ? createHash("sha256").update(original.body).digest("hex") : undefined;
  return !!currentSource && currentSource === guide.sourceBodySha256 && (guide.publicationRequested === true || (guide.review?.linguistic === "approved" && guide.review.technical === "approved" && !!guide.review.reviewer?.trim() && !!guide.review.reviewedAt && /^\d{4}-\d{2}-\d{2}$/.test(guide.review.reviewedAt) && guide.review.reviewedAt <= new Date().toISOString().slice(0, 10)));
}
export function isPublishedGuide(guide: Guide) { return isReviewedGuide(guide) && !!guide.published && /^\d{4}-\d{2}-\d{2}$/.test(guide.published) && guide.published <= new Date().toISOString().slice(0, 10); }
export function availableGuides(locale: Locale) { return guides(locale).filter(isReviewedGuide); }
export const headingId = (title: string) => title.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
export function guideSchema(guide: Guide) {
  const url = new URL(articlePath(guide.locale, guide.slug), SITE.url).href;
  return { "@type": "BlogPosting", "@id": `${url}#article`, headline: guide.title,
    description: guide.description, url, mainEntityOfPage: url,
    dateCreated: guide.created, dateModified: guide.updated, ...(guide.published ? { datePublished: guide.published } : {}),
    author: { "@type": "Organization", name: SITE.name, url: SITE.url }, publisher: { "@id": `${SITE.url}/#organization` },
    image: `${SITE.url}${OG_IMAGE.url}`, inLanguage: guide.locale, articleSection: guide.category,
  };
}
