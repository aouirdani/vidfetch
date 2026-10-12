import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SITE, OG_IMAGE } from "./seo";

export type Guide = { slug: string; title: string; description: string; category: string; created: string; updated: string; published: string | null; status: "ready"; related: string[]; sources: { title: string; url: string }[]; body: string; minutes: number };
const directory = join(process.cwd(), "content/guides");
let catalogue: Guide[] | undefined;
export function guides(): Guide[] {
  return catalogue ??= readdirSync(directory).filter(file => /^[a-z0-9-]+\.md$/.test(file)).map(file => {
    const source = readFileSync(join(directory, file), "utf8");
    const match = /^---\n([\s\S]+?)\n---\n([\s\S]+)$/.exec(source);
    if (!match) throw new Error(`Invalid guide: ${file}`);
    const meta = JSON.parse(match[1]) as Omit<Guide, "slug" | "body" | "minutes">;
    const body = match[2].trim();
    if (meta.status !== "ready" || !meta.title || !meta.description || !/^\d{4}-\d{2}-\d{2}$/.test(meta.updated)) throw new Error(`Unreviewed guide: ${file}`);
    return { ...meta, slug: file.slice(0, -3), body, minutes: Math.max(1, Math.ceil(body.split(/\s+/).length / 220)) };
  });
}
export function guideFor(slug: string) { return guides().find(guide => guide.slug === slug); }
export const headingId = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export function guideSchema(guide: Guide) {
  return { "@type": "BlogPosting", "@id": `${SITE.url}/blog/${guide.slug}#article`, headline: guide.title,
    description: guide.description, url: `${SITE.url}/blog/${guide.slug}`, mainEntityOfPage: `${SITE.url}/blog/${guide.slug}`,
    dateCreated: guide.created, dateModified: guide.updated, ...(guide.published ? { datePublished: guide.published } : {}),
    author: { "@type": "Organization", name: SITE.name, url: SITE.url }, publisher: { "@id": `${SITE.url}/#organization` },
    image: `${SITE.url}${OG_IMAGE.url}`, inLanguage: "en", articleSection: guide.category,
  };
}
