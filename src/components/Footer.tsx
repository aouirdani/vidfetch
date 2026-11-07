import {toolLinks,TOOLS_LABEL,LICENSE_LABEL} from "@/local-tools/catalogue";
import { dictionary } from "@/i18n/dictionaries";
import { homePath, sectionPath, type Locale } from "@/i18n/config";
import { availableGuides } from "@/lib/guides";
import { navigationPlatformLinks } from "@/lib/platform-pages";
import { AbuseLink } from "@/components/AbuseLink";
import { trustNavigation } from "@/lib/trust-pages";
export function Footer({ locale }: { locale: Locale }) {
  const d = dictionary(locale);
  return <footer className="defer-paint mt-20 border-t border-white/10 px-4 py-10 sm:px-6"><div className="mx-auto grid max-w-6xl gap-7 md:grid-cols-2">
    <div><a href={homePath(locale)} className="font-semibold">VidFetch</a><p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-400">{d.footerAbout}</p><p className="mt-3 text-xs text-slate-400">{d.footerRights}</p></div>
    <nav aria-label={d.footerLinks} className="flex flex-wrap items-start gap-5 text-sm text-slate-300"><details><summary className="cursor-pointer">{TOOLS_LABEL[locale]}</summary><ul className="mt-3 space-y-3">{toolLinks(locale).map(t=><li key={t.id}><a href={t.href}>{t.label}</a></li>)}</ul></details><a href={`${sectionPath(locale,"legal")}#licenses`}>{LICENSE_LABEL[locale]}</a>{navigationPlatformLinks(locale).map(tool => <a key={tool.id} href={tool.href} hrefLang={tool.hrefLang}>{tool.label}{tool.note && <span className="text-slate-400"> ({tool.note})</span>}</a>)}{availableGuides(locale).length > 0 && <a href={sectionPath(locale, "blog")}>{d.navGuides}</a>}<a href={sectionPath(locale, "legal")}>{d.navLegal}</a><AbuseLink label={d.reportAbuse} /></nav>
    <nav aria-label={d.legalSections} className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-slate-300 md:col-span-2">{trustNavigation(locale).map(p => <a key={p.id} href={p.href}>{p.title}</a>)}</nav>
  </div></footer>;
}
