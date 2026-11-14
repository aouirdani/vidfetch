import {toolLinks,TOOLS_LABEL} from "@/local-tools/catalogue";
import { dictionary } from "@/i18n/dictionaries";
import { MENU_LABELS } from "@/i18n/navigation-labels";
import { homePath, sectionPath, type Locale } from "@/i18n/config";
import type { PageIdentity } from "@/lib/site-pages";
import { availableGuides } from "@/lib/guides";
import { navigationPlatformLinks } from "@/lib/platform-pages";
import { LanguageSelector } from "./LanguageSelector";
import { trustNavigation } from "@/lib/trust-pages";
export function Header({ locale, identity }: { locale: Locale; identity: PageIdentity }) {
  const d = dictionary(locale), home = homePath(locale), guides = availableGuides(locale).length > 0, platformPages = navigationPlatformLinks(locale).filter(tool => !tool.hrefLang);
  const trust = trustNavigation(locale).filter(p => p.id === "about" || p.id === "contact");
  // The header links only pages in its own language; the footer also lists the English pages, marked as such.
  return <header className="site-header sticky top-0 z-50 border-b border-white/5 bg-ink-950/90">
    <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6">
      <a href={home} aria-label={d.homeLink} className="flex items-center gap-2"><span className="brand-mark" aria-hidden>▶</span><span className="flex flex-col"><span className="brand-wordmark">VidFetch</span><bdi className="text-[10px] text-slate-400">vidfetch.app</bdi></span></a>
      <nav aria-label={d.navMain} className="hidden items-center gap-5 text-sm text-slate-300 lg:flex"><a href={`${home}#extractor`}>{d.navDownloader}</a>{platformPages.map(tool => <a key={tool.id} href={tool.href}>{tool.label}</a>)}<a href={`${home}#how-it-works`}>{d.navSteps}</a><a href={`${home}#faq`}>{d.navFaq}</a>{guides && <a href={sectionPath(locale, "blog")}>{d.navGuides}</a>}</nav>
      <div className="flex items-center gap-2"><details className="relative hidden text-sm lg:block"><summary className="cursor-pointer px-2 py-2">{TOOLS_LABEL[locale]}</summary><ul className="absolute end-0 top-full z-50 w-64 space-y-4 rounded-xl border border-white/20 bg-ink-950 p-5">{toolLinks(locale).map(t=><li key={t.id}><a href={t.href}>{t.label}</a></li>)}</ul></details>
        <details className="relative text-sm lg:hidden"><summary className="cursor-pointer rounded-lg px-2 py-2 text-slate-200 hover:bg-white/10">{MENU_LABELS[locale]}</summary><nav aria-label={d.navMain} className="absolute end-0 top-full z-50 max-h-[min(75vh,32rem)] w-64 overflow-y-auto rounded-xl border border-white/20 bg-ink-950 p-4 shadow-2xl"><ul className="space-y-1"><li><a className="block rounded-lg px-3 py-2 hover:bg-white/10" href={`${home}#extractor`}>{d.navDownloader}</a></li>{platformPages.map(tool=><li key={tool.id}><a className="block rounded-lg px-3 py-2 hover:bg-white/10" href={tool.href}>{tool.label}</a></li>)}<li className="my-2 border-t border-white/10 pt-2"><span className="px-3 text-xs text-slate-400">{TOOLS_LABEL[locale]}</span></li>{toolLinks(locale).map(tool=><li key={tool.id}><a className="block rounded-lg px-3 py-2 hover:bg-white/10" href={tool.href}>{tool.label}</a></li>)}<li className="my-2 border-t border-white/10 pt-2"><a className="block rounded-lg px-3 py-2 hover:bg-white/10" href={`${home}#how-it-works`}>{d.navSteps}</a></li><li><a className="block rounded-lg px-3 py-2 hover:bg-white/10" href={`${home}#faq`}>{d.navFaq}</a></li>{guides && <li><a className="block rounded-lg px-3 py-2 hover:bg-white/10" href={sectionPath(locale,"blog")}>{d.navGuides}</a></li>}{trust.map(p => <li key={p.id}><a className="block rounded-lg px-3 py-2 hover:bg-white/10" href={p.href}>{p.title}</a></li>)}</ul></nav></details>
        {trust.length > 0 && <details className="relative hidden text-sm lg:block"><summary className="cursor-pointer px-2 py-2">{d.navLegal}</summary><nav aria-label={d.legalSections} className="absolute end-0 top-full z-50 grid w-64 gap-4 rounded-xl border border-white/20 bg-ink-950 p-5">{trust.map(p => <a key={p.id} href={p.href}>{p.title}</a>)}</nav></details>}
        {guides && <a href={sectionPath(locale, "blog")} className="px-2 py-2 text-sm text-slate-300 lg:hidden">{d.navGuides}</a>}<LanguageSelector locale={locale} identity={identity} /></div>
    </div>
  </header>;
}
