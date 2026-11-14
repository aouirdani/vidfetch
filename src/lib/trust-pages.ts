import copy from "../../content/trust-pages.json";
import { homePath, type Locale } from "../i18n/config";
import { PUBLISHER, hasUnfinishedFields } from "./publisher";
import { CONTACTS } from "./contact";

export const TRUST_IDS = ["about", "contact", "privacy", "terms", "copyright", "editorial"] as const;
export type TrustId = typeof TRUST_IDS[number];
export type TrustSection = { heading: string; paragraphs: string[] };
export type TrustPage = { id: TrustId; slug: string; title: string; description: string; sections: TrustSection[] };
export const TRUST_UPDATED = "2026-11-14";
const rendered = new Map<Locale, TrustPage[]>();
const published = new Map<Locale, TrustPage[]>();
export const LEGAL_TITLES: Record<Locale, string> = {
  en: "Legal information", fr: "Informations légales", es: "Información legal", "pt-BR": "Informações legais",
  id: "Informasi hukum", de: "Rechtliche Informationen", it: "Informazioni legali", ar: "المعلومات القانونية",
};
/** The established legal URL remains useful while incomplete standalone notices stay unpublished. */
export function verifiedPrivacySummary(locale: Locale) {
  return trustPages(locale).find(p => p.id === "privacy")!.sections.flatMap(s => s.paragraphs).filter(p => !hasUnfinishedFields(p));
}
export function trustPages(locale: Locale, values = PUBLISHER): TrustPage[] {
  if (values === PUBLISHER && rendered.has(locale)) return rendered.get(locale)!;
  const fields: Record<string, string> = { name: values.name, country: new Intl.DisplayNames([locale], { type: "region" }).of(PUBLISHER.countryCode)!, launched: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${values.launched}-01`)), ...CONTACTS };
  const replace = (text: string) => text.replace(/\{(\w+)\}/g, (_, key: string) => fields[key] ?? `[À COMPLÉTER : ${key}]`);
  const pages = TRUST_IDS.map(id => {
    const entry = copy[locale][id];
    return { id, ...entry, sections: entry.sections.map(section => ({ heading: replace(section.heading), paragraphs: section.paragraphs.map(replace) })) };
  });
  if (values === PUBLISHER) rendered.set(locale, pages);
  return pages;
}
export function availableTrustPages(locale: Locale) {
  if (!published.has(locale)) published.set(locale, trustPages(locale).filter(page => !hasUnfinishedFields(page)));
  return published.get(locale)!;
}
export function trustPath(locale: Locale, id: TrustId) {
  const page = availableTrustPages(locale).find(p => p.id === id);
  return page ? `${homePath(locale).replace(/\/$/, "")}/${page.slug}` : undefined;
}
export function proposedTrustPath(locale: Locale, id: TrustId) {
  return `${homePath(locale).replace(/\/$/, "")}/${trustPages(locale).find(p => p.id === id)!.slug}`;
}
export function trustNavigation(locale: Locale) {
  return availableTrustPages(locale).map(p => ({ ...p, href: trustPath(locale, p.id)! }));
}
