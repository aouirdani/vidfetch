import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Ban, Bolt, CircleDollarSign, Clipboard, Cpu, Gauge, Infinity as InfinityIcon, Laptop, Layers, Link as LinkIcon, Lock, Monitor, MousePointerClick, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { FetchForm } from "@/components/FetchForm";
import { SamplePreview } from "@/components/SamplePreview";
import { PlatformIcon } from "@/components/PlatformIcon";
import { PLATFORM_META } from "@/lib/platforms";
import { HOME_FAQS, LANDING_PAGES, SITE, applicationSchema, faqSchema, howToSchema, itemListSchema, jsonLdGraph, pageMetadata, webPageSchema } from "@/lib/seo";

// Static shell: prerendered and CDN-cacheable, with live data fetched client-side.
export const revalidate = 86400;

const TITLE = "VidFetch — Free Video Downloader for YouTube, TikTok, Instagram & X";
const DESCRIPTION = "Download public videos and audio from YouTube, TikTok, Instagram and X. Paste a link, choose a quality or MP3, and save the file straight to your device. Free, no sign-up.";

export const metadata: Metadata = pageMetadata({
  title: TITLE, description: DESCRIPTION, path: "/",
  keywords: ["video downloader", "free video downloader", "youtube to mp4", "tiktok downloader", "instagram reels downloader", "x video downloader", "mp3 converter"],
});

const BADGES = [
  { icon: CircleDollarSign, label: "Free" },
  { icon: Ban, label: "No ads" },
  { icon: InfinityIcon, label: "No daily limit" },
  { icon: ShieldCheck, label: "Nothing stored" },
];

const DEVICES = [
  { icon: Smartphone, label: "iPhone & Android" },
  { icon: Laptop, label: "Windows & macOS" },
  { icon: Monitor, label: "Linux & ChromeOS" },
];

const STEPS = [
  { tag: "Copy", icon: LinkIcon, title: "Copy the video link", body: "Use Share → Copy link in the app, or copy the address straight from your browser's address bar." },
  { tag: "Paste", icon: Clipboard, title: "Paste it above", body: "Drop the link into the field and select Extract. VidFetch reads the video and lists every format the source publishes." },
  { tag: "Save", icon: MousePointerClick, title: "Pick a quality and save", body: "Choose a resolution or MP3, then select Download. The file streams straight into your browser's downloads." },
];

const FEATURES = [
  { icon: Bolt, title: "Straight to your device", body: "Video streams through the server to your browser with bounded memory use. VidFetch adds no file-size cap of its own — speed depends on the source and your connection." },
  { icon: Layers, title: "The qualities that exist", body: "You see the exact formats the platform publishes for that video, with codec and estimated size, instead of a fixed menu that fails halfway through." },
  { icon: Cpu, title: "Real MP3, real MP4", body: "ffmpeg merges separate video and audio tracks into a clean MP4 and encodes genuine MP3 audio — never a renamed video container." },
  { icon: ShieldCheck, title: "Nothing kept afterwards", body: "Media files are streamed, not archived. Only aggregate counters are published; download titles and links are never shown publicly." },
  { icon: Gauge, title: "Honest about failures", body: "Private, deleted or login-gated posts are reported in plain language, and every download is verified before your browser starts saving it." },
  { icon: Lock, title: "Built for big files", body: "A long-running Node.js server handles extraction and streaming, so large downloads aren't cut off by a serverless execution window." },
];

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdGraph([
        webPageSchema({ name: TITLE, path: "/", description: DESCRIPTION }),
        applicationSchema(),
        howToSchema(SITE.url),
        faqSchema(HOME_FAQS, `${SITE.url}/`),
        itemListSchema("VidFetch platform downloaders", LANDING_PAGES.map((page) => ({ name: page.title, path: `/${page.slug}`, description: page.metaDescription }))),
      ]) }} />

      <section id="extractor" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 pb-4 pt-12 sm:px-6 sm:pt-16" aria-labelledby="hero-title">
        <div className="mx-auto w-full max-w-3xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-slate-300">
            <Sparkles className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
            YouTube · TikTok · Instagram · X
          </p>
          <h1 id="hero-title" className="mt-5 text-balance text-[2.5rem] font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl">
            Download your videos <span className="text-gradient">with just a link</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-relaxed text-slate-300 sm:text-lg">
            Save video and audio from four platforms in HD, straight to your device. No account, no app to install.
          </p>
        </div>

        <FetchForm />

        <ul className="mx-auto mt-7 flex max-w-3xl flex-wrap items-center justify-center gap-x-5 gap-y-2.5">
          {BADGES.map((badge) => (
            <li key={badge.label} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <badge.icon className="h-3.5 w-3.5 text-cyan-300" aria-hidden />{badge.label}
            </li>
          ))}
        </ul>

        <SamplePreview />
      </section>

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <section id="how-it-works" className="defer-paint mt-20 scroll-mt-24 sm:mt-24" aria-labelledby="how-title">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">How it works</p>
            <h2 id="how-title" className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Three steps, about a minute</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              The same flow on every platform, whether you are on a phone or a laptop.
            </p>
          </div>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] p-6">
                <span className="pointer-events-none absolute -right-3 -top-4 text-[5rem] font-bold leading-none text-white/[0.04]" aria-hidden>
                  {index + 1}
                </span>
                <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 ring-1 ring-inset ring-cyan-400/25">
                  <step.icon className="h-5 w-5 text-cyan-200" aria-hidden />
                </span>
                <p className="relative mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
                  Step {index + 1} · {step.tag}
                </p>
                <h3 className="relative mt-1.5 text-sm font-semibold text-white">{step.title}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-slate-400">{step.body}</p>
              </li>
            ))}
          </ol>
          <ul className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-white/8 bg-white/[0.02] px-5 py-4">
            <li className="text-xs font-medium text-slate-300">Works in any modern browser:</li>
            {DEVICES.map((device) => (
              <li key={device.label} className="inline-flex items-center gap-2 text-xs text-slate-400">
                <device.icon className="h-4 w-4 text-cyan-300" aria-hidden />{device.label}
              </li>
            ))}
          </ul>
        </section>

        <section id="platforms" className="defer-paint mt-20 scroll-mt-24 sm:mt-24" aria-labelledby="platforms-title">
          <div className="max-w-2xl">
            <h2 id="platforms-title" className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">A downloader for every platform</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Each guide covers the links that work, what you can save, and the limits that platform applies.
            </p>
          </div>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {LANDING_PAGES.map((page) => {
              const meta = PLATFORM_META[page.platform];
              return (
                <li key={page.slug}>
                  <Link href={`/${page.slug}`} prefetch={false}
                    className="group flex h-full flex-col rounded-2xl border border-white/8 bg-white/[0.03] p-5 transition-colors hover:border-cyan-400/40 hover:bg-white/[0.05]">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${meta.accent} text-white`}>
                      <PlatformIcon platform={page.platform} className="h-4 w-4" />
                    </span>
                    <h3 className="mt-4 text-sm font-semibold text-white">{page.title}</h3>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-400">{page.heading}</p>
                    {/* mt-auto keeps the call to action aligned when titles wrap to two lines. */}
                    <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-xs font-medium text-cyan-300">
                      Open guide <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section id="features" className="defer-paint mt-20 scroll-mt-24 sm:mt-24" aria-labelledby="features-title">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Why VidFetch</p>
            <h2 id="features-title" className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">One tool, no surprises</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Save the videos you own or have permission to download, without juggling sketchy sites.
            </p>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="rounded-2xl border border-white/8 bg-white/[0.03] p-6 transition-colors hover:border-white/15">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 ring-1 ring-inset ring-cyan-400/20">
                  <feature.icon className="h-5 w-5 text-cyan-200" aria-hidden />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{feature.body}</p>
              </article>
            ))}
          </div>
          <p className="mt-6 rounded-2xl border border-white/8 bg-white/[0.02] px-5 py-4 text-xs leading-relaxed text-slate-400">
            <span className="font-semibold text-slate-300">On copyright:</span> VidFetch hosts no media of its own. Files are fetched
            from the source platform at the moment you ask for them and streamed to your browser. Download only what you own or have
            permission to save — see the <Link href="/legal#terms" className="text-cyan-300 underline-offset-4 hover:underline">terms of service</Link>.
          </p>
        </section>

        <section id="faq" className="defer-paint mt-20 scroll-mt-24 sm:mt-24" aria-labelledby="faq-title">
          <div className="max-w-2xl">
            <h2 id="faq-title" className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Questions, answered</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">What VidFetch does, what it keeps, and where the limits are.</p>
          </div>
          <div className="mt-8 grid gap-2.5 lg:grid-cols-2">
            {HOME_FAQS.map((faq) => (
              <details key={faq.question} className="group rounded-2xl border border-white/8 bg-white/[0.03] px-5 transition-colors open:border-cyan-400/30 hover:border-white/15">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-4 text-sm font-semibold text-white">
                  {faq.question}
                  <span className="mt-0.5 shrink-0 text-lg leading-none text-cyan-300 transition-transform duration-200 group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="pb-4 text-sm leading-relaxed text-slate-400">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

      </div>
    </>
  );
}
