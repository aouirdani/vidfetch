import { LANGUAGES, LOCALES, homePath, type Locale } from "@/i18n/config";
import { dictionary } from "@/i18n/dictionaries";
import { equivalentPath, type PageIdentity } from "@/lib/site-pages";
/** Native links work before hydration and across root-layout languages. */
export function LanguageSelector({ locale, identity }: { locale: Locale; identity: PageIdentity }) {
  return <details className="relative" data-language-selector>
    <summary className="cursor-pointer rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-200" aria-label={dictionary(locale).navLanguage}><bdi>{LANGUAGES[locale].name}</bdi></summary>
    <nav aria-label={dictionary(locale).navLanguage} className="absolute end-0 top-full z-[60] mt-2 w-56 rounded-xl border border-white/15 bg-ink-950 p-2 shadow-xl">
      {LOCALES.map(language => <a key={language} href={equivalentPath(identity, language) ?? homePath(language)} hrefLang={language} lang={language} dir={LANGUAGES[language].dir}
        aria-current={language === locale ? "page" : undefined} className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-white/10 focus:bg-white/10"><bdi>{LANGUAGES[language].name}</bdi></a>)}
    </nav>
  </details>;
}
