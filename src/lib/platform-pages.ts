import catalogue from "../../content/platforms/catalogue.json";
import { LANGUAGES, LOCALES, type Locale } from "../i18n/config";
import type { Platform } from "./platforms";
export type PlatformCopy = {
  status: "ready"; title: string; description: string; heading: string; intro: string;
  instructions: string[]; supported: string[]; limits: string[];
  faqs: { question: string; answer: string }[]; relatedGuides: string[];
  /** Optional page-specific section headings; the shared dictionary headings are used otherwise. */
  sections?: { steps?: string; formats?: string; faq?: string };
  updated: string; publishedAt: string;
};
export type PlatformCandidate = {
  id: string; platform: Platform; published: boolean; slugs: Record<Locale, string>;
  gate: { authorizedMediaVerified: boolean; copyReviewed: boolean; permissionToPublish: boolean };
  copy?: Partial<Record<Locale, PlatformCopy>>;
};
export const platformCandidates = catalogue as PlatformCandidate[];
/** No route becomes indexable merely by changing a single publication flag. */
export function approvedPlatformCopy(entry: PlatformCandidate, locale: Locale): PlatformCopy | undefined {
  const copy = entry.copy?.[locale], today = new Date().toISOString().slice(0, 10);
  const slug = entry.slugs[locale];
  if (!entry.published || entry.gate.authorizedMediaVerified !== true || entry.gate.copyReviewed !== true || entry.gate.permissionToPublish !== true || !copy || copy.status !== "ready") return undefined;
  if (!/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug) || LOCALES.some(l => LANGUAGES[l].prefix === slug) || ["api", "auth", LANGUAGES[locale].blog, LANGUAGES[locale].legal].includes(slug)) return undefined;
  const sentences = (value: unknown, minimum: number) => Array.isArray(value) && value.length >= minimum && value.every(text => typeof text === "string" && text.trim());
  if (!copy.title?.trim() || !copy.description?.trim() || !copy.heading?.trim() || !copy.intro?.trim() || !sentences(copy.instructions, 3) || !sentences(copy.supported, 1) || !sentences(copy.limits, 1) || !Array.isArray(copy.faqs) || copy.faqs.length < 3 || copy.faqs.some(faq => !faq.question?.trim() || !faq.answer?.trim()) || !Array.isArray(copy.relatedGuides)) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(copy.publishedAt) || !/^\d{4}-\d{2}-\d{2}$/.test(copy.updated) || copy.publishedAt > today || copy.updated > today) return undefined;
  return copy;
}
export function availablePlatformPages(locale: Locale) { return platformCandidates.filter(entry => approvedPlatformCopy(entry, locale)); }
export function platformPagePath(entry: PlatformCandidate, locale: Locale) { return `${locale === "en" ? "" : `/${LANGUAGES[locale].prefix}`}/${entry.slugs[locale]}`; }
/** Section title for contextual links to the approved platform pages of a language (kept out of the shared dictionaries). */
export const PLATFORM_TOOLS_TITLE: Record<Locale, string> = {
  en: "Download by platform", fr: "Télécharger par plateforme", es: "Descargar por plataforma", "pt-BR": "Baixar por plataforma",
  id: "Unduh per platform", de: "Nach Plattform herunterladen", it: "Scarica per piattaforma", ar: "التنزيل حسب المنصة",
};
/** Contextual internal links: the approved platform pages of a language, optionally without the current one. */
export function platformLinks(locale: Locale, except?: string) {
  return availablePlatformPages(locale).filter(entry => entry.id !== except).map(entry => {
    const copy = approvedPlatformCopy(entry, locale)!;
    return { id: entry.id, href: platformPagePath(entry, locale), label: copy.heading, description: copy.description };
  });
}
