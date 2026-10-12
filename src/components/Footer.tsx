import Link from "next/link";
import { PlatformIcon } from "./PlatformIcon";
import { PLATFORMS } from "@/lib/platforms";
import { LANDING_PAGES, SITE } from "@/lib/seo";

const COLUMNS = [
  { title: "Product", links: [
    { label: "Video downloader", href: "/#extractor" },
    { label: "How it works", href: "/#how-it-works" },
    { label: "Video & audio guides", href: "/blog" },
    { label: "Questions", href: "/#faq" },
  ] },
  { title: "Downloaders", links: LANDING_PAGES.map((page) => ({ label: page.title, href: `/${page.slug}` })) },
  { title: "Legal", links: [
    { label: "Terms of service", href: "/legal#terms" },
    { label: "Legal notice", href: "/legal#notice" },
    { label: "Privacy policy", href: "/legal#privacy" },
    { label: "Report abuse", href: "mailto:abuse@vidfetch.io" },
  ] },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-white/5 bg-ink-900/60">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-sky-500">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="currentColor" aria-hidden><path d="M8 5.5v13l11-6.5-11-6.5Z" /></svg>
              </span>
              <div>
                <p className="text-base font-semibold text-white">Vid<span className="text-gradient">Fetch</span></p>
                <p className="text-xs text-slate-400">{SITE.domain}</p>
              </div>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
              {SITE.tagline}. Save videos you own or have permission to download. Choose an available format and keep a copy on your device.
            </p>
            <ul className="mt-5 flex items-center gap-2">
              {PLATFORMS.map((platform) => (
                <li key={platform} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400">
                  <PlatformIcon platform={platform} />
                </li>
              ))}
            </ul>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-sm font-semibold text-white">{column.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} prefetch={false} className="text-sm text-slate-400 transition hover:text-cyan-300">{link.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-white/5 pt-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 VidFetch — All rights reserved.</p>
          <p>Only download content you own or have permission to save.</p>
        </div>
      </div>
    </footer>
  );
}
