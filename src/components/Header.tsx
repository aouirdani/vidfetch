import Link from "next/link";
import { EngineBadge } from "./EngineBadge";
import { LANDING_PAGES } from "@/lib/seo";

const NAV = [
  { href: "/#extractor", label: "Downloader" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#faq", label: "FAQ" },
  { href: `/${LANDING_PAGES[0].slug}`, label: "Platforms" },
];

/** Server component: the navigation ships zero client JavaScript. */
export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-3" aria-label="VidFetch home">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-sky-500 shadow-[0_8px_30px_-10px_rgba(139,92,246,0.9)]">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="currentColor" aria-hidden><path d="M8 5.5v13l11-6.5-11-6.5Z" /></svg>
            <span className="absolute inset-0 rounded-xl ring-1 ring-white/25" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-lg font-semibold tracking-tight text-white">Vid<span className="text-gradient">Fetch</span></span>
            <span className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400 transition group-hover:text-cyan-300">vidfetch.io</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} prefetch={false} className="rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <EngineBadge />
          <Link href="/#extractor" className="rounded-xl bg-gradient-to-r from-cyan-400 to-sky-400 px-4 py-2 text-sm font-semibold text-ink-950 shadow-[0_10px_30px_-12px_rgba(139,92,246,1)] transition hover:brightness-110 active:scale-[0.98]">
            Extract
          </Link>
        </div>
      </div>
    </header>
  );
}
