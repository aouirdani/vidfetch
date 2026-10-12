import Link from "next/link";
import { notFound } from "next/navigation";
import { guides, guideFor, guideSchema, headingId } from "@/lib/guides";
import { breadcrumbSchema, jsonLdGraph, pageMetadata } from "@/lib/seo";
import { GuideBody } from "@/components/GuideBody";

export const dynamicParams = false;
export function generateStaticParams() { return guides().map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const a = guideFor((await params).slug); if (!a) return { robots: { index: false, follow: false } };
  return pageMetadata({ title: `${a.title} | VidFetch`, description: a.description, path: `/blog/${a.slug}`, type: "article" });
}
export default async function Guide({ params }: { params: Promise<{ slug: string }> }) {
  const a = guideFor((await params).slug); if (!a) notFound();
  const sections = [...a.body.matchAll(/^## (.+)$/gm)].map(m => m[1]);
  return <article className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdGraph([guideSchema(a), breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Guides", path: "/blog" }, { name: a.title, path: `/blog/${a.slug}` }])]) }} />
    <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm text-slate-400"><Link href="/">Home</Link><span aria-hidden>/</span><Link href="/blog">Guides</Link><span aria-hidden>/</span><span aria-current="page">{a.category}</span></nav>
    <header className="mt-10 max-w-3xl"><p className="eyebrow">{a.category} / {a.minutes} min read</p><h1 className="mt-4 text-balance font-serif text-4xl leading-tight tracking-tight sm:text-5xl">{a.title}</h1><p className="mt-6 text-lg leading-relaxed text-slate-300">{a.description}</p><p className="mt-5 text-sm text-slate-400">By VidFetch · Updated <time dateTime={a.updated}>{a.updated}</time>{a.published && <> · Published <time dateTime={a.published}>{a.published}</time></>}</p></header>
    <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="min-w-0 max-w-3xl"><GuideBody body={a.body} /><section className="mt-10 border-t border-white/10 pt-7" aria-labelledby="sources-title"><h2 id="sources-title" className="text-lg font-semibold">Sources and further reading</h2><ul className="mt-4 space-y-3 text-sm text-slate-400">{a.sources.map(s => <li key={s.url}><a href={s.url} rel="noopener noreferrer" className="underline decoration-slate-600 underline-offset-4 hover:text-cyan-200">{s.title}</a></li>)}</ul></section></div>
      <aside className="order-first rounded-xl border border-white/10 p-5 lg:sticky lg:top-24 lg:order-last"><h2 className="text-sm font-semibold">In this guide</h2><ul className="mt-4 space-y-3 text-sm text-slate-400">{sections.map(s => <li key={s}><a href={`#${headingId(s)}`} className="hover:text-cyan-200">{s}</a></li>)}</ul><Link href="/#extractor" className="mt-6 block border-t border-white/10 pt-4 text-sm font-medium text-cyan-300">Open the downloader →</Link></aside>
    </div>
    <section className="mt-14 border-t border-white/10 pt-8"><h2 className="text-xl font-semibold">Keep exploring</h2><ul className="mt-5 grid gap-5 sm:grid-cols-3">{a.related.map(slug => { const r = guideFor(slug); return r && <li key={slug}><Link href={`/blog/${slug}`} prefetch={false} className="text-slate-300 underline decoration-slate-700 underline-offset-4 hover:text-cyan-200">{r.title}</Link></li>; })}</ul></section>
  </article>;
}
