import {toolLinks,TOOLS_LABEL} from "@/local-tools/catalogue";
import { dictionary } from "@/i18n/dictionaries";
import { MENU_LABELS, TRUST_MENU_LABELS, HEADER_LINKS } from "@/i18n/navigation-labels";
import { homePath, sectionPath, type Locale } from "@/i18n/config";
import type { PageIdentity } from "@/lib/site-pages";
import { availableGuides } from "@/lib/guides";
import { navigationPlatformLinks } from "@/lib/platform-pages";
import { HeaderMenuController } from "./HeaderMenuController";
import { LanguageSelector } from "./LanguageSelector";
import { trustNavigation } from "@/lib/trust-pages";
export function Header({ locale, identity }: { locale: Locale; identity: PageIdentity }) {
  const d = dictionary(locale), home = homePath(locale), guides = availableGuides(locale).length > 0, platformPages = navigationPlatformLinks(locale).filter(tool => !tool.hrefLang);
  const short = HEADER_LINKS[locale];
  const trust = trustNavigation(locale).filter(p => p.id === "about" || p.id === "contact");
  // The header links only pages in its own language; the footer also lists the English pages, marked as such.
  return <header className="site-header sticky top-0 z-50 border-b border-white/5 bg-ink-950/90">
    <HeaderMenuController />
    <div className="header-inner mx-auto max-w-6xl">
      <a href={home} aria-label={d.homeLink} className="header-brand flex items-center gap-2"><span className="brand-mark" aria-hidden>▶</span><span className="flex flex-col"><span className="brand-wordmark">VidFetch</span><bdi className="text-[10px] text-slate-400">vidfetch.app</bdi></span></a>
      <nav aria-label={d.navMain} className="header-desktop">
        {platformPages.map(tool => <a key={tool.id} href={tool.href}>{tool.id.includes("mp3") ? short.audio : short.video}</a>)}
        <details className="header-tools"><summary>{short.tools}</summary>
          <nav data-header-tools-panel aria-label={short.tools} className="header-tools-panel">
            <ul>{toolLinks(locale).map(t => <li key={t.id}><a href={t.href}>{t.label}</a></li>)}</ul>
            <ul className="header-extra-links"><li><a href={`${home}#extractor`}>{d.navDownloader}</a></li><li><a href={`${home}#how-it-works`}>{d.navSteps}</a></li><li><a href={`${home}#faq`}>{d.navFaq}</a></li></ul>
            <section data-header-legal-section aria-labelledby="desktop-trust-heading"><h2 id="desktop-trust-heading">{TRUST_MENU_LABELS[locale]}</h2>{trust.map(p => <a key={p.id} href={p.href}>{p.title}</a>)}</section>
          </nav>
        </details>
        {guides && <a href={sectionPath(locale, "blog")}>{d.navGuides}</a>}
      </nav>
      <div className="header-actions">
        <details data-mobile-navigation className="text-sm lg:hidden"><summary className="cursor-pointer rounded-lg px-2 py-2 text-slate-200 hover:bg-white/10">{MENU_LABELS[locale]}</summary><nav data-mobile-navigation-panel aria-label={d.navMain} className="mobile-navigation-panel fixed inset-x-3 z-50 overflow-y-auto rounded-xl border border-white/20 bg-ink-950 p-4 shadow-2xl"><ul className="space-y-1"><li><a className="block rounded-lg px-3 py-2 hover:bg-white/10" href={`${home}#extractor`}>{d.navDownloader}</a></li>{platformPages.map(tool=><li key={tool.id}><a className="block rounded-lg px-3 py-2 hover:bg-white/10" href={tool.href}>{tool.label}</a></li>)}<li className="my-2 border-t border-white/10 pt-2"><span className="px-3 text-xs text-slate-400">{TOOLS_LABEL[locale]}</span></li>{toolLinks(locale).map(tool=><li key={tool.id}><a className="block rounded-lg px-3 py-2 hover:bg-white/10" href={tool.href}>{tool.label}</a></li>)}<li className="my-2 border-t border-white/10 pt-2"><a className="block rounded-lg px-3 py-2 hover:bg-white/10" href={`${home}#how-it-works`}>{d.navSteps}</a></li><li><a className="block rounded-lg px-3 py-2 hover:bg-white/10" href={`${home}#faq`}>{d.navFaq}</a></li>{guides && <li><a className="block rounded-lg px-3 py-2 hover:bg-white/10" href={sectionPath(locale,"blog")}>{d.navGuides}</a></li>}</ul>{trust.length > 0 && <section className="mt-4 border-t border-white/10 pt-4" aria-labelledby="mobile-trust-heading"><h2 id="mobile-trust-heading" className="px-3 text-sm font-semibold">{TRUST_MENU_LABELS[locale]}</h2><ul className="mt-2 space-y-1">{trust.map(p => <li key={p.id}><a className="block rounded-lg px-3 py-2 hover:bg-white/10" href={p.href}>{p.title}</a></li>)}</ul></section>}</nav></details>
        {guides && <a href={sectionPath(locale, "blog")} className="px-2 py-2 text-sm text-slate-300 lg:hidden">{d.navGuides}</a>}<LanguageSelector locale={locale} identity={identity} /></div>
    </div>
  </header>;
}
