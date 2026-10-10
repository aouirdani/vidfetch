import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Lock, Scale, Mail } from "lucide-react";
import { CONTENT_UPDATED, breadcrumbSchema, jsonLdGraph, pageMetadata, webPageSchema } from "@/lib/seo";

export const revalidate = 86400;

export const metadata: Metadata = pageMetadata({
  title: "Terms of Service, Privacy & Legal Notice | VidFetch",
  description: "Terms of service, legal notice, privacy policy and abuse reporting information for the VidFetch video downloader at vidfetch.io.",
  path: "/legal",
  type: "article",
});

const BLOCKS = [
  { id: "notice", icon: Scale, title: "Legal notice", items: [
    "VidFetch is an automated video extraction and download service available at vidfetch.io. Contact the site operator at legal@vidfetch.io.",
    "VidFetch is not affiliated with or endorsed by YouTube, TikTok, Instagram, Meta or X. Platform names and trademarks belong to their respective owners.",
    "The service is provided as available. Access, supported formats and download speed depend on the source platform and the hosting environment.",
  ] },
  { id: "terms", icon: FileText, title: "Terms of service", items: [
    "Only use VidFetch to download content you own, content covered by an appropriate license, or content you have the rights holder's permission to save. Public visibility alone does not grant download or redistribution rights.",
    "You are responsible for complying with applicable law, copyright restrictions and the source platform's terms. Do not use this service to bypass access controls or redistribute protected material without permission.",
    "Private, deleted, age-restricted, login-required and region-restricted posts may be unavailable. VidFetch cannot guarantee access to every link and does not override platform restrictions.",
    "Automated abuse, excessive requests, attempts to overload the service and unauthorized access are prohibited. Concurrent downloads may be limited to maintain service availability.",
    "Source media belongs to its creators and rights holders. VidFetch does not claim ownership of any downloaded content.",
  ] },
  { id: "privacy", icon: Lock, title: "Privacy policy", items: [
    "No VidFetch account is required. The application does not set advertising cookies or use third-party advertising trackers.",
    "Media data passes through bounded streaming buffers and is not permanently saved as a video or audio file on the server. Extracted metadata and source URLs can be cached in memory for up to five minutes to avoid repeating platform requests.",
    "The database records submitted video URLs, platform identifiers, titles, thumbnails, formats, extraction errors, transfer timestamps, statuses and byte counts. This data is used for operating and debugging the service only; it is not published anywhere on the site and no usage dashboard is exposed. Do not submit confidential links.",
    "Random download tickets expire after one minute if unused. Transfer status is retained in memory for up to thirty minutes. Server infrastructure may maintain its own operational request logs.",
    "Optional authorized platform cookies are configured only by the site operator as server-side secrets. They are never requested from website visitors or returned to the browser. Temporary cookie copies are removed when the extraction process ends.",
    "For questions about recorded metadata or a deletion request, contact privacy@vidfetch.io and identify the relevant URL or transfer.",
  ] },
  { id: "report", icon: Mail, title: "Reporting abuse or copyright concerns", items: [
    "To report abuse or a copyright concern, contact abuse@vidfetch.io with the original content URL, a description of the issue and evidence of your rights or authority to act.",
    "VidFetch does not host a permanent copy of the media. Removal from the source platform must be requested from that platform; service access and stored activity metadata can be reviewed by the VidFetch operator.",
  ] },
];

export default function LegalPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pt-16 sm:px-6 sm:pt-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdGraph([
        breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Terms, privacy & legal information", path: "/legal" }]),
        webPageSchema({ name: "Terms, privacy & legal information", path: "/legal", description: "Terms of service, legal notice, privacy policy and abuse reporting information for VidFetch." }),
      ]) }} />
      <nav aria-label="Breadcrumb" className="text-xs text-slate-400">
        <ol className="flex items-center gap-2">
          <li><Link href="/" className="transition hover:text-cyan-300">Home</Link></li>
          <li aria-hidden>/</li>
          <li className="text-slate-300" aria-current="page">Legal</li>
        </ol>
      </nav>
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">VidFetch · vidfetch.io</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Terms, privacy & legal information</h1>
      <p className="mt-4 text-sm leading-relaxed text-slate-300">By using VidFetch, you agree to use the service responsibly and in accordance with the terms below.</p>
      <p className="mt-2 text-xs text-slate-400">Last updated {new Date(CONTENT_UPDATED).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
      <nav className="mt-8 flex flex-wrap gap-2" aria-label="Legal sections">
        {BLOCKS.map((block) => <a key={block.id} href={`#${block.id}`} className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200">{block.title}</a>)}
      </nav>
      <div className="mt-10 space-y-6">
        {BLOCKS.map((block) => <section key={block.id} id={block.id} className="defer-paint scroll-mt-24 rounded-3xl glass p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/25 to-sky-500/20 ring-1 ring-white/10"><block.icon className="h-5 w-5 text-cyan-200" /></span>
            <h2 className="text-lg font-semibold text-white">{block.title}</h2>
          </div>
          <ul className="mt-5 space-y-3">{block.items.map((item) => <li key={item} className="flex gap-3 text-sm leading-relaxed text-slate-300"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />{item}</li>)}</ul>
        </section>)}
      </div>
      <div className="mt-10 rounded-2xl border border-white/8 bg-white/[0.03] p-6 text-sm text-slate-400">
        Questions? <Link href="mailto:legal@vidfetch.io" className="text-cyan-300 hover:text-cyan-200">legal@vidfetch.io</Link>
        <span className="mx-2">·</span><Link href="/" className="text-cyan-300 hover:text-cyan-200">Back to the downloader</Link>
      </div>
    </div>
  );
}
