import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CircleAlert, CircleCheck } from "lucide-react";
import { FetchForm } from "@/components/FetchForm";
import { SamplePreview } from "@/components/SamplePreview";
import { PlatformIcon } from "@/components/PlatformIcon";
import { PLATFORM_META } from "@/lib/platforms";
import { CONTENT_UPDATED, LANDING_PAGES, SITE, applicationSchema, breadcrumbSchema, faqSchema, howToSchema, jsonLdGraph, landingPageFor, pageMetadata, webPageSchema } from "@/lib/seo";

export const revalidate = false;
// Only the curated slugs exist; anything else is a genuine 404 rather than thin content.
export const dynamicParams = false;

export function generateStaticParams() {
  return LANDING_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = landingPageFor((await params).slug);
  if (!page) return {};
  return pageMetadata({ title: page.metaTitle, description: page.metaDescription, path: `/${page.slug}`, keywords: page.keywords });
}

export default async function LandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const page = landingPageFor((await params).slug);
  if (!page) notFound();
  const meta = PLATFORM_META[page.platform];
  const url = `${SITE.url}/${page.slug}`;
  const others = LANDING_PAGES.filter((item) => item.slug !== page.slug);
  const steps = [
    `Copy the link to a public ${meta.name} video and paste it into the field above.`,
    "Select Extract to load the video details and every format the source offers.",
    "Pick a quality — or the Audio tab for MP3 — then select Download to save the file.",
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdGraph([
        webPageSchema({ name: page.metaTitle, path: `/${page.slug}`, description: page.metaDescription }),
        applicationSchema({ name: `${SITE.name} — ${page.title}`, description: page.metaDescription, url, features: page.supported }),
        breadcrumbSchema([{ name: "Home", path: "/" }, { name: page.title, path: `/${page.slug}` }]),
        howToSchema(url),
        faqSchema(page.faqs, url),
      ]) }} />

      <div className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6 sm:pt-10">
        <nav aria-label="Breadcrumb" className="text-xs text-slate-400">
          <ol className="flex items-center gap-2">
            <li><Link href="/" className="transition hover:text-cyan-300">Home</Link></li>
            <li aria-hidden className="text-slate-600">/</li>
            <li className="truncate text-slate-200" aria-current="page">{page.title}</li>
          </ol>
        </nav>

        <article>
          <section id="extractor" className="mt-6 scroll-mt-24" aria-labelledby="landing-title">
            <div className="mx-auto w-full max-w-3xl text-center">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-slate-300">
                <span className={`flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br ${meta.accent} text-white`}>
                  <PlatformIcon platform={page.platform} className="h-2.5 w-2.5" />
                </span>
                {meta.name} · {meta.host}
              </p>
              <h1 id="landing-title" className="mt-5 text-balance text-[2.25rem] font-semibold leading-[1.07] tracking-tight text-white sm:text-5xl">
                {page.heading}
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-pretty text-base leading-relaxed text-slate-300">{page.intro}</p>
            </div>
            <FetchForm compact platform={page.platform} />
            <SamplePreview platform={page.platform} />
          </section>

          <section className="defer-paint mt-20 scroll-mt-24 sm:mt-24" aria-labelledby="steps-title">
            <h2 id="steps-title" className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              How to download a {meta.name} video
            </h2>
            <ol className="mt-8 grid gap-4 sm:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step} className="rounded-2xl border border-white/8 bg-white/[0.03] p-6">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-sky-400 text-sm font-semibold text-ink-950" aria-hidden>{index + 1}</span>
                  <p className="mt-4 text-sm leading-relaxed text-slate-300">{step}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="defer-paint mt-20 scroll-mt-24 sm:mt-24" aria-labelledby="support-title">
            <h2 id="support-title" className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">What works with {meta.name}</h2>
            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6">
                <h3 className="text-sm font-semibold text-white">Supported links and formats</h3>
                <ul className="mt-4 space-y-3">
                  {page.supported.map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-relaxed text-slate-300">
                      <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden />{item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-6">
                <h3 className="text-sm font-semibold text-amber-100">Known limitations</h3>
                <ul className="mt-4 space-y-3">
                  {page.limits.map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-relaxed text-amber-100/90">
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />{item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="defer-paint mt-20 scroll-mt-24 sm:mt-24" aria-labelledby="landing-faq-title">
            <h2 id="landing-faq-title" className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{meta.name} downloader questions</h2>
            <div className="mt-8 grid gap-2.5 lg:grid-cols-2">
              {page.faqs.map((faq) => (
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
        </article>

        <section className="defer-paint mt-20 sm:mt-24" aria-labelledby="other-title">
          <h2 id="other-title" className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Other VidFetch downloaders</h2>
          <ul className="mt-8 grid gap-3 sm:grid-cols-3">
            {others.map((item) => (
              <li key={item.slug}>
                <Link href={`/${item.slug}`} prefetch={false}
                  className="group flex h-full items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-5 transition-colors hover:border-cyan-400/40">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${PLATFORM_META[item.platform].accent} text-white`}>
                      <PlatformIcon platform={item.platform} className="h-4 w-4" />
                    </span>
                    <span className="truncate text-sm font-semibold text-white group-hover:text-cyan-200">{item.title}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-cyan-300" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-8 flex flex-wrap items-center gap-x-2 text-sm text-slate-400">
            <span>Back to the</span>
            <Link href="/" className="text-cyan-300 underline-offset-4 hover:underline">VidFetch video downloader</Link>
            <span>·</span>
            <Link href="/legal#terms" className="text-cyan-300 underline-offset-4 hover:underline">Terms of service</Link>
            <span className="text-slate-400">· Updated {new Date(CONTENT_UPDATED).toLocaleDateString("en-US", { year: "numeric", month: "long" })}</span>
          </p>
        </section>
      </div>
    </>
  );
}
