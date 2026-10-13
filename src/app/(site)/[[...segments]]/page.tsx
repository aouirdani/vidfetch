import { notFound } from "next/navigation";
import { dictionary } from "@/i18n/dictionaries";
import { localeForSegments } from "@/i18n/config";
import { resolvePage, sitePages } from "@/lib/site-pages";
import { localizedMetadata } from "@/lib/localized-seo";
import { HomeView, BlogView, ArticleView, LegalView, PlatformView } from "@/views/SiteViews";
export function generateStaticParams() { return sitePages().map(page => ({ segments: page.path.split("/").filter(Boolean) })); }
export async function generateMetadata({ params }: { params: Promise<{ segments?: string[] }> }) {
  const segments = (await params).segments ?? [], page = resolvePage(segments);
  if (page) return localizedMetadata(page);
  const d = dictionary(localeForSegments(segments));
  return { title: { absolute: `${d.notFoundTitle} | VidFetch` }, description: d.notFoundDescription, robots: { index: false, follow: true } };
}
export default async function Page({ params }: { params: Promise<{ segments?: string[] }> }) {
  const page = resolvePage((await params).segments ?? []); if (!page) notFound();
  switch (page.identity.kind) {
    case "home": return <HomeView page={page} />;
    case "blog": return <BlogView page={page} />;
    case "guide": return <ArticleView page={page} />;
    case "legal": return <LegalView page={page} />;
    case "platform": return <PlatformView page={page} />;
  }
}
