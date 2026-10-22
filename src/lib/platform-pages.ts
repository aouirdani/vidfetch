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
/** Date of the last substantial change of an approved platform page's copy (sitemap lastmod, JSON-LD dateModified). */
export function platformPageUpdated(id: string, locale: Locale): string | undefined {
  const entry = availablePlatformPages(locale).find(candidate => candidate.id === id);
  return entry && approvedPlatformCopy(entry, locale)?.updated;
}
export function platformPagePath(entry: PlatformCandidate, locale: Locale) { return `${locale === "en" ? "" : `/${LANGUAGES[locale].prefix}`}/${entry.slugs[locale]}`; }
/** Section title for contextual links to the approved platform pages of a language (kept out of the shared dictionaries). */
export const PLATFORM_TOOLS_TITLE: Record<Locale, string> = {
  en: "Download by platform", fr: "Télécharger par plateforme", es: "Descargar por plataforma", "pt-BR": "Baixar por plataforma",
  id: "Unduh per platform", de: "Nach Plattform herunterladen", it: "Scarica per piattaforma", ar: "التنزيل حسب المنصة",
};
/** Labels, in each language, of the English platform pages a language has no version of yet (kept out of the shared
 * dictionaries). A page missing here is not linked from that language. */
const ENGLISH_PAGE_LABELS: Record<Locale, { inEnglish: string; pages: Record<string, string> }> = {
  en: { inEnglish: "", pages: {} },
  fr: { inEnglish: "page en anglais", pages: { "tiktok-video-downloader": "Télécharger une vidéo TikTok en MP4", "tiktok-mp3": "Convertir une vidéo TikTok en MP3" } },
  es: { inEnglish: "página en inglés", pages: { "tiktok-video-downloader": "Descargar un vídeo de TikTok en MP4", "tiktok-mp3": "Convertir un vídeo de TikTok a MP3" } },
  "pt-BR": { inEnglish: "página em inglês", pages: { "tiktok-video-downloader": "Baixar um vídeo do TikTok em MP4", "tiktok-mp3": "Converter um vídeo do TikTok em MP3" } },
  id: { inEnglish: "halaman berbahasa Inggris", pages: { "tiktok-video-downloader": "Unduh video TikTok sebagai MP4", "tiktok-mp3": "Ubah video TikTok menjadi MP3" } },
  de: { inEnglish: "Seite auf Englisch", pages: { "tiktok-video-downloader": "TikTok-Video als MP4 herunterladen", "tiktok-mp3": "TikTok-Video in MP3 umwandeln" } },
  it: { inEnglish: "pagina in inglese", pages: { "tiktok-video-downloader": "Scaricare un video TikTok in MP4", "tiktok-mp3": "Convertire un video TikTok in MP3" } },
  ar: { inEnglish: "صفحة باللغة الإنجليزية", pages: { "tiktok-video-downloader": "تنزيل فيديو تيك توك بصيغة MP4", "tiktok-mp3": "تحويل فيديو تيك توك إلى MP3" } },
};
/** The approved English platform pages that a language has no approved version of, labelled in that language. */
export function englishPlatformLinks(locale: Locale) {
  if (locale === "en") return [];
  const own = availablePlatformPages(locale).map(entry => entry.id), labels = ENGLISH_PAGE_LABELS[locale];
  return availablePlatformPages("en").filter(entry => !own.includes(entry.id) && labels.pages[entry.id])
    .map(entry => ({ id: entry.id, href: platformPagePath(entry, "en"), label: labels.pages[entry.id], note: labels.inEnglish }));
}
/** Contextual internal links: the approved platform pages of a language, optionally without the current one. */
export function platformLinks(locale: Locale, except?: string) {
  return availablePlatformPages(locale).filter(entry => entry.id !== except).map(entry => {
    const copy = approvedPlatformCopy(entry, locale)!;
    return { id: entry.id, href: platformPagePath(entry, locale), label: copy.heading, description: copy.description };
  });
}
