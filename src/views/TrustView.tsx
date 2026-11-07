import Link from "next/link";
import { dictionary } from "@/i18n/dictionaries";
import { homePath, sectionPath } from "@/i18n/config";
import { ContactText } from "@/components/AbuseLink";
import { availableTrustPages, trustNavigation, TRUST_UPDATED } from "@/lib/trust-pages";
import { breadcrumbSchema, jsonLdGraph } from "@/lib/seo";
import { localizedPageSchema } from "@/lib/localized-seo";
import type { SitePage } from "@/lib/site-pages";

export function TrustView({ page }: { page: SitePage }) {
  if (page.identity.kind !== "trust") return null;
  const id = page.identity.id, content = availableTrustPages(page.locale).find(p => p.id === id)!;
  const d = dictionary(page.locale);
  const schema = { ...localizedPageSchema(page, content.title, content.description, TRUST_UPDATED), "@type": id === "about" ? "AboutPage" : id === "contact" ? "ContactPage" : "WebPage" };
  return <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdGraph([schema, breadcrumbSchema([{ name: d.home, path: homePath(page.locale) }, { name: content.title, path: page.path }])]) }} />
    <nav aria-label={d.breadcrumb} className="mb-9 flex flex-wrap gap-2 text-sm text-slate-400"><Link href={homePath(page.locale)}>{d.home}</Link><span aria-hidden>/</span><span aria-current="page">{content.title}</span></nav>
    <h1 className="font-heading text-4xl font-semibold">{content.title}</h1>
    <p className="mt-5 max-w-3xl text-lg text-slate-300">{content.description}</p>
    <p className="mt-4 text-sm text-slate-400">{d.updated} <time dateTime={TRUST_UPDATED}>{new Intl.DateTimeFormat(page.locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(TRUST_UPDATED))}</time></p>
    {content.sections.map(section => <section key={section.heading} className="mt-10"><h2 className="text-2xl font-semibold">{section.heading}</h2>{section.paragraphs.map(text => <p className="mt-4 leading-relaxed text-slate-300" key={text}><ContactText text={text} /></p>)}</section>)}
    <nav aria-label={d.footerLinks} className="mt-12 flex flex-wrap gap-5 border-t border-white/10 pt-7 text-cyan-300">{trustNavigation(page.locale).filter(p => p.id !== id).map(p => <Link key={p.id} href={p.href}>{p.title}</Link>)}<Link href={sectionPath(page.locale, "legal")}>{d.navLegal}</Link></nav>
  </article>;
}
