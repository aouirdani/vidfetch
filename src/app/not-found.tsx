import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { LANDING_PAGES } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Page not found",
  description: "This VidFetch page does not exist. Return to the video downloader to save a video from YouTube, TikTok, Instagram or X.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-24 text-center sm:px-6">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/25 to-blue-500/25 ring-1 ring-white/10">
        <Compass className="h-6 w-6 text-violet-200" aria-hidden />
      </div>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white sm:text-4xl">This page does not exist</h1>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-slate-400">
        The link may be mistyped or out of date. Head back to the downloader and paste a video link to get started.
      </p>
      <Link href="/" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-500 px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110">
        Go to the video downloader <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
      <ul className="mt-10 grid gap-2 sm:grid-cols-2">
        {LANDING_PAGES.map((page) => (
          <li key={page.slug}>
            <Link href={`/${page.slug}`} className="block rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300 transition hover:border-violet-400/30 hover:text-white">
              {page.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
