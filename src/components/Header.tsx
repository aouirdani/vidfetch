import Link from "next/link";
import { dictionary } from "@/i18n/dictionaries";
import { homePath, sectionPath, type Locale } from "@/i18n/config";
import type { PageIdentity } from "@/lib/site-pages";
import { LanguageSelector } from "./LanguageSelector";
export function Header({ locale, identity }: { locale: Locale; identity: PageIdentity }) {
  const d = dictionary(locale), home = homePath(locale);
  return <header className="sticky top-0 z-50 border-b border-white/5 bg-ink-950/90 backdrop-blur-xl">
    <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6">
      <Link href={home} aria-label={d.homeLink} className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400 text-ink-950" aria-hidden>▶</span><span className="flex flex-col"><span className="text-lg font-semibold">Vid<span className="text-cyan-300">Fetch</span></span><bdi className="text-[10px] tracking-widest text-slate-400">vidfetch.app</bdi></span></Link>
      <nav aria-label={d.navMain} className="hidden items-center gap-5 text-sm text-slate-300 lg:flex"><Link href={`${home}#extractor`}>{d.navDownloader}</Link><Link href={`${home}#how-it-works`}>{d.navSteps}</Link><Link href={`${home}#faq`}>{d.navFaq}</Link><Link href={sectionPath(locale, "blog")}>{d.navGuides}</Link></nav>
      <div className="flex items-center gap-2"><Link href={sectionPath(locale, "blog")} className="px-2 py-2 text-sm text-slate-300 lg:hidden">{d.navGuides}</Link><LanguageSelector locale={locale} identity={identity} /></div>
    </div>
  </header>;
}
