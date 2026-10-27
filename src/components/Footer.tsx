import Link from "next/link";
import { dictionary } from "@/i18n/dictionaries";
import { homePath, sectionPath, type Locale } from "@/i18n/config";
import { availableGuides } from "@/lib/guides";
import { navigationPlatformLinks } from "@/lib/platform-pages";
import { CONTACTS } from "@/lib/contact";
export function Footer({ locale }: { locale: Locale }) {
  const d = dictionary(locale);
  return <footer className="mt-20 border-t border-white/10 px-4 py-10 sm:px-6"><div className="mx-auto grid max-w-6xl gap-7 md:grid-cols-2">
    <div><Link href={homePath(locale)} className="font-semibold">VidFetch</Link><p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-400">{d.footerAbout}</p><p className="mt-3 text-xs text-slate-400">{d.footerRights}</p></div>
    <nav aria-label={d.footerLinks} className="flex flex-wrap items-start gap-5 text-sm text-slate-300">{navigationPlatformLinks(locale).map(tool => <Link key={tool.id} href={tool.href} hrefLang={tool.hrefLang}>{tool.label}{tool.note && <span className="text-slate-400"> ({tool.note})</span>}</Link>)}{availableGuides(locale).length > 0 && <Link href={sectionPath(locale, "blog")}>{d.navGuides}</Link>}<Link href={sectionPath(locale, "legal")}>{d.navLegal}</Link><a href={`mailto:${CONTACTS.abuse}`}>{d.reportAbuse}</a></nav>
  </div></footer>;
}
