import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { guides } from "@/lib/guides";
import { breadcrumbSchema, itemListSchema, jsonLdGraph, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Video & Audio Guides — Formats, Quality and Backups | VidFetch", description: "Understand video formats, audio conversion, resolutions and file size. Practical guides to choosing, saving and looking after your own videos.", path: "/blog" });
export default function Blog() {
  const articles = guides();
  return <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdGraph([breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Guides", path: "/blog" }]), itemListSchema("Video and audio guides", articles.map(a => ({ name: a.title, path: `/blog/${a.slug}`, description: a.description })))]) }} />
    <nav aria-label="Breadcrumb" className="text-sm text-slate-400"><Link href="/">Home</Link> <span aria-hidden>/</span> Guides</nav>
    <div className="mt-9 max-w-2xl"><p className="eyebrow">The VidFetch library</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">A little clarity.<br /><span className="text-cyan-300">Better video choices.</span></h1><p className="mt-5 text-lg leading-relaxed text-slate-300">Formats, quality, smaller files. Practical explanations for the videos you create and the copies you are allowed to keep.</p></div>
    <ol className="mt-12 grid gap-x-12 sm:grid-cols-2">{articles.map((a, i) => <li key={a.slug} className="border-t border-white/10 py-7"><Link href={`/blog/${a.slug}`} prefetch={false} className="group block"><div className="flex items-center justify-between text-xs text-slate-400"><span>{String(i + 1).padStart(2, "0")} / {a.category}</span><span>{a.minutes} min read</span></div><h2 className="mt-3 flex items-start justify-between gap-5 text-xl font-semibold text-white transition group-hover:text-cyan-200">{a.title}<ArrowUpRight className="mt-1 h-5 w-5 shrink-0 text-cyan-300" aria-hidden /></h2><p className="mt-3 leading-relaxed text-slate-400">{a.description}</p></Link></li>)}</ol>
  </div>;
}
