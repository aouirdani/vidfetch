export const LOCALES = ["en", "fr", "es", "pt-BR", "id", "de", "it", "ar"] as const;
export type Locale = typeof LOCALES[number];
export const LANGUAGES: Record<Locale, { prefix: string; name: string; og: string; dir: "ltr" | "rtl"; blog: string; legal: string }> = {
  en: { prefix: "", name: "English", og: "en_US", dir: "ltr", blog: "blog", legal: "legal" },
  fr: { prefix: "fr", name: "Français", og: "fr_FR", dir: "ltr", blog: "guides", legal: "mentions-legales" },
  es: { prefix: "es", name: "Español", og: "es_ES", dir: "ltr", blog: "guias", legal: "aviso-legal" },
  "pt-BR": { prefix: "pt", name: "Português (Brasil)", og: "pt_BR", dir: "ltr", blog: "guias", legal: "termos-e-privacidade" },
  id: { prefix: "id", name: "Bahasa Indonesia", og: "id_ID", dir: "ltr", blog: "panduan", legal: "ketentuan-dan-privasi" },
  de: { prefix: "de", name: "Deutsch", og: "de_DE", dir: "ltr", blog: "ratgeber", legal: "rechtliches" },
  it: { prefix: "it", name: "Italiano", og: "it_IT", dir: "ltr", blog: "guide", legal: "note-legali" },
  ar: { prefix: "ar", name: "العربية", og: "ar_AR", dir: "rtl", blog: "أدلة", legal: "الشروط-والخصوصية" },
};
export function localeForSegments(segments: readonly string[] = []): Locale {
  return LOCALES.find(locale => LANGUAGES[locale].prefix && LANGUAGES[locale].prefix === segments[0]) ?? "en";
}
export function homePath(locale: Locale) { return locale === "en" ? "/" : `/${LANGUAGES[locale].prefix}`; }
export function sectionPath(locale: Locale, section: "blog" | "legal") { return `${locale === "en" ? "" : `/${LANGUAGES[locale].prefix}`}/${LANGUAGES[locale][section]}`; }
export function articlePath(locale: Locale, slug: string) { return `${sectionPath(locale, "blog")}/${slug}`; }
export function interpolate(text: string, values: Record<string, string | number>) {
  return text.replace(/\{([a-zA-Z]+)\}/g, (match, key) => String(values[key] ?? match));
}
