import { LANGUAGES, LOCALES, articlePath, homePath, localeForSegments, sectionPath, type Locale } from "../i18n/config";
import { availableGuides, guides, isPublishedGuide } from "./guides";
import { LANDING_PAGES } from "./seo";
import { availablePlatformPages, platformPagePath } from "./platform-pages";
export type PageIdentity = { kind: "home" } | { kind: "blog" } | { kind: "legal" } | { kind: "guide"; id: string } | { kind: "platform"; id: string };
export type SitePage = { locale: Locale; identity: PageIdentity; path: string; indexable: boolean };
function canIndex(identity: PageIdentity, locale: Locale) {
  if (identity.kind === "platform") return availablePlatformPages(locale).some(entry => entry.id === identity.id);
  if (identity.kind === "blog") return guides(locale).some(isPublishedGuide);
  if (identity.kind === "guide") return isPublishedGuide(guides(locale).find(g => g.id === identity.id)!);
  return true;
}
export function equivalentPath(identity: PageIdentity, locale: Locale): string | undefined {
  if (identity.kind === "home") return homePath(locale);
  if (identity.kind === "blog" || identity.kind === "legal") return sectionPath(locale, identity.kind);
  if (identity.kind === "guide") {
    const guide = availableGuides(locale).find(g => g.id === identity.id);
    return guide ? articlePath(locale, guide.slug) : undefined;
  }
  // Preserve historical English URLs; unverified specialized translations stay drafts.
  const approved = availablePlatformPages(locale).find(entry => entry.id === identity.id);
  if (approved) return platformPagePath(approved, locale);
  return locale === "en" && LANDING_PAGES.some(p => p.slug === identity.id) ? `/${identity.id}` : undefined;
}
export function resolvePage(segments: readonly string[] = []): SitePage | undefined {
  let decoded: string[];
  try { decoded = segments.map(segment => decodeURIComponent(segment)); } catch { return undefined; }
  if (decoded.some(segment => /[%/\\\u0000]/.test(segment))) return undefined;
  const locale = localeForSegments(decoded);
  const rest = locale === "en" ? decoded : decoded.slice(1);
  let identity: PageIdentity, indexable = true;
  if (!rest.length) identity = { kind: "home" };
  else if (rest.length === 1 && rest[0] === LANGUAGES[locale].blog) identity = { kind: "blog" };
  else if (rest.length === 1 && rest[0] === LANGUAGES[locale].legal) identity = { kind: "legal" };
  else if (rest.length === 2 && rest[0] === LANGUAGES[locale].blog) {
    const guide = availableGuides(locale).find(g => g.slug === rest[1]);
    if (!guide) return undefined;
    identity = { kind: "guide", id: guide.id }; indexable = isPublishedGuide(guide);
  } else if (rest.length === 1 && availablePlatformPages(locale).some(entry => entry.slugs[locale] === rest[0])) {
    identity = { kind: "platform", id: availablePlatformPages(locale).find(entry => entry.slugs[locale] === rest[0])!.id };
  } else if (locale === "en" && rest.length === 1 && LANDING_PAGES.some(p => p.slug === rest[0])) {
    identity = { kind: "platform", id: rest[0] }; indexable = false;
  } else return undefined;
  return { locale, identity, path: equivalentPath(identity, locale)!, indexable: indexable && canIndex(identity, locale) };
}
export function sitePages(): SitePage[] {
  return LOCALES.flatMap(locale => {
    const identities: PageIdentity[] = [{ kind: "home" }, { kind: "blog" }, { kind: "legal" },
      ...availableGuides(locale).map(g => ({ kind: "guide" as const, id: g.id })),
      ...availablePlatformPages(locale).map(entry => ({ kind: "platform" as const, id: entry.id })),
      ...(locale === "en" ? LANDING_PAGES.filter(p => !availablePlatformPages(locale).some(entry => entry.id === p.slug)).map(p => ({ kind: "platform" as const, id: p.slug })) : [])];
    return identities.map(identity => ({ locale, identity, path: equivalentPath(identity, locale)!, indexable: canIndex(identity, locale) }));
  });
}
export function languageAlternates(page: SitePage): Record<string, string> {
  if (!page.indexable) return {};
  const result: Record<string, string> = {};
  for (const locale of LOCALES) {
    const path = equivalentPath(page.identity, locale);
    if (path && sitePages().some(p => p.path === path && p.indexable)) result[locale] = new URL(path, "https://vidfetch.app").href;
  }
  if (result.en) result["x-default"] = result.en;
  return result;
}
