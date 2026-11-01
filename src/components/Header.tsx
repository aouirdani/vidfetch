import {toolLinks,TOOLS_LABEL} from "@/local-tools/catalogue";
import Link from "next/link";
import { dictionary } from "@/i18n/dictionaries";
import { homePath, sectionPath, type Locale } from "@/i18n/config";
import type { PageIdentity } from "@/lib/site-pages";
import { availableGuides } from "@/lib/guides";
import { navigationPlatformLinks } from "@/lib/platform-pages";
import { LanguageSelector } from "./LanguageSelector";
export function Header({ locale, identity }: { locale: Locale; identity: PageIdentity }) {
  const d = dictionary(locale), home = homePath(locale), guides = availableGuides(locale).length > 0, platformPages = navigationPlatformLinks(locale).filter(tool => !tool.hrefLang);
  // The header links only pages in its own language; the footer also lists the English pages, marked as such.
  return <header className="sticky top-0 z-50 border-b border-white/5 bg-ink-950/90 backdrop-blur-xl">
    <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6">
      <Link href={home} aria-label={d.homeLink} className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400 text-ink-950" aria-hidden>▶</span><span className="flex flex-col"><span className="text-lg font-semibold">Vid<span className="text-cyan-300">Fetch</span></span><bdi className="text-[10px] tracking-widest text-slate-400">vidfetch.app</bdi></span></Link>
      <nav aria-label={d.navMain} className="hidden items-center gap-5 text-sm text-slate-300 lg:flex"><Link href={`${home}#extractor`}>{d.navDownloader}</Link>{platformPages.map(tool => <Link key={tool.id} href={tool.href}>{tool.label}</Link>)}<Link href={`${home}#how-it-works`}>{d.navSteps}</Link><Link href={`${home}#faq`}>{d.navFaq}</Link>{guides && <Link href={sectionPath(locale, "blog")}>{d.navGuides}</Link>}</nav>
      <div className="flex items-center gap-2"><details className="relative hidden text-sm lg:block"><summary className="cursor-pointer px-2 py-2">{TOOLS_LABEL[locale]}</summary><ul className="absolute end-0 top-full z-50 w-64 space-y-4 rounded-xl border border-white/20 bg-ink-950 p-5">{toolLinks(locale).map(t=><li key={t.id}><Link prefetch={false} href={t.href}>{t.label}</Link></li>)}</ul></details>
        <details className="relative text-sm lg:hidden"><summary className="cursor-pointer rounded-lg px-2 py-2 text-slate-200 hover:bg-white/10">{d.menuLabel}</summary><nav aria-label={d.navMain} className="absolute end-0 top-full z-50 max-h-[min(75vh,32rem)] w-64 overflow-y-auto rounded-xl border border-white/20 bg-ink-950 p-4 shadow-2xl"><ul className="space-y-1"><li><Link className="block rounded-lg px-3 py-2 hover:bg-white/10" href={`${home}#extractor`}>{d.navDownloader}</Link></li>{platformPages.map(tool=><li key={tool.id}><Link className="block rounded-lg px-3 py-2 hover:bg-white/10" href={tool.href}>{tool.label}</Link></li>)}<li className="my-2 border-t border-white/10 pt-2"><span className="px-3 text-xs text-slate-400">{TOOLS_LABEL[locale]}</span></li>{toolLinks(locale).map(tool=><li key={tool.id}><Link prefetch={false} className="block rounded-lg px-3 py-2 hover:bg-white/10" href={tool.href}>{tool.label}</Link></li>)}<li className="my-2 border-t border-white/10 pt-2"><Link className="block rounded-lg px-3 py-2 hover:bg-white/10" href={`${home}#how-it-works`}>{d.navSteps}</Link></li><li><Link className="block rounded-lg px-3 py-2 hover:bg-white/10" href={`${home}#faq`}>{d.navFaq}</Link></li>{guides && <li><Link className="block rounded-lg px-3 py-2 hover:bg-white/10" href={sectionPath(locale,"blog")}>{d.navGuides}</Link></li>}</ul></nav></details>
        {guides && <Link href={sectionPath(locale, "blog")} className="px-2 py-2 text-sm text-slate-300 lg:hidden">{d.navGuides}</Link>}<LanguageSelector locale={locale} identity={identity} /></div>
    </div>
  </header>;
}
