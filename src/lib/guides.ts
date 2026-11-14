import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { SITE, OG_IMAGE } from "./seo";
import { articlePath, type Locale } from "../i18n/config";
import { hasUnfinishedFields, PUBLISHER } from "./publisher";
import legacyPublished from "../../content/legacy-published-guides.json";
import { trustPath } from "./trust-pages";

export type GuideImage = { src: string; alt: string; width: number; height: number; caption?: string };
export type Guide = { legacyPublished?: boolean; reviewedBy?: string | null; reviewedAt?: string | null; author?: string; series?: string; planId?: string; planRank?: number; tool?: string; images?: GuideImage[]; wordCount?: number; id: string; locale: Locale; slug: string; title: string; seoTitle?: string; publicationRequested?: boolean; description: string; category: string; created: string; updated: string; published: string | null; status: "published" | "ready" | "review" | "draft"; review?: { linguistic: "pending" | "approved"; technical: "pending" | "approved"; reviewer: string | null; reviewedAt: string | null }; sourceSha256?: string; sourceBodySha256?: string; related: string[]; sources: { title: string; url: string; accessed?: string }[]; body: string; minutes: number };
const catalogues = new Map<Locale, Guide[]>();
const publicationFields = new WeakMap<Guide, { body: string; metadata: string; unfinished: boolean }>();
function unfinishedGuide(guide: Guide) {
  const { body, ...metadata } = guide, signature = JSON.stringify(metadata), cached = publicationFields.get(guide);
  if (cached?.body === body && cached.metadata === signature) return cached.unfinished;
  const unfinished = hasUnfinishedFields(body) || hasUnfinishedFields(metadata);
  publicationFields.set(guide, { body, metadata: signature, unfinished });
  return unfinished;
}
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
    if (!["published", "ready", "review", "draft"].includes(meta.status) || !meta.title || !meta.description || !/^\d{4}-\d{2}-\d{2}$/.test(meta.updated)) throw new Error(`Invalid guide metadata: ${file}`);
    const slug = meta.slug ?? file.slice(0, -3);
    if (!/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug)) throw new Error(`Invalid guide slug: ${file}`);
    return { ...meta, id: file.slice(0, -3), locale, slug, body, minutes: Math.max(1, Math.ceil(body.split(/\s+/).length / 220)) };
  });
  catalogues.set(locale, result); return result;
}
export function guideFor(slug: string, locale: Locale = "en") { return guides(locale).find(guide => guide.slug === slug); }
/** Strict calendar dates; Date.parse alone silently normalises dates such as February 30. */
export function isRealPastDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= new Date().toISOString().slice(0, 10);
}
export function isReviewedGuide(guide: Guide) {
  if (!guide || guide.reviewedBy !== PUBLISHER.name || !isRealPastDate(guide.reviewedAt) || unfinishedGuide(guide)) return false;
  if (!isRealPastDate(guide.created) || !isRealPastDate(guide.updated) || guide.reviewedAt < guide.created || guide.reviewedAt > guide.updated) return false;
  if (!trustPath(guide.locale, "about")) return false;
  if (guide.locale === "en") return true;
  const original = guides().find(g => g.id === guide.id);
  return !!original && createHash("sha256").update(original.body).digest("hex") === guide.sourceBodySha256;
}
/** Closed list of the 34 guides already public before this policy. New files cannot opt into it. */
export function isLegacyPublishedGuide(guide: Guide) {
  if (!guide || guide.legacyPublished !== true || guide.series) return false;
  const prior = (legacyPublished as Record<string, { path: string; published: string }>)[`${guide.locale}/${guide.id}`];
  return !!prior && guide.published === prior.published && articlePath(guide.locale, guide.slug) === prior.path;
}
export function isPublishedGuide(guide: Guide) {
  if (isLegacyPublishedGuide(guide)) return true;
  return !!guide && guide.status === "published" && isReviewedGuide(guide)
    && isRealPastDate(guide.created) && isRealPastDate(guide.published) && isRealPastDate(guide.updated)
    && guide.created <= guide.published && guide.published <= guide.updated;
}
export function availableGuides(locale: Locale) { return guides(locale).filter(isPublishedGuide); }
export const headingId = (title: string) => title.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
export function guideSchema(guide: Guide) {
  const url = new URL(articlePath(guide.locale, guide.slug), SITE.url).href;
  return { "@type": "BlogPosting", "@id": `${url}#article`, headline: guide.title,
    description: guide.description, url, mainEntityOfPage: url,
    dateCreated: guide.created, dateModified: guide.updated, ...(guide.published ? { datePublished: guide.published } : {}),
    author: isReviewedGuide(guide) ? { "@type": "Person", name: guide.reviewedBy, ...(trustPath(guide.locale, "about") ? { url: new URL(trustPath(guide.locale, "about")!, SITE.url).href } : {}) } : { "@type": "Organization", name: SITE.name, url: SITE.url }, publisher: { "@id": `${SITE.url}/#organization` },
    image: guide.images?.length ? guide.images.map(image => `${SITE.url}${image.src}`) : `${SITE.url}${OG_IMAGE.url}`, inLanguage: guide.locale, articleSection: guide.category,
  };
}
