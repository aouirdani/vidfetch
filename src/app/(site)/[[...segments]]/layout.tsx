import type { Metadata, Viewport } from "next";
import "../../globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { I18nProvider } from "@/i18n/context";
import { dictionary } from "@/i18n/dictionaries";
import { LANGUAGES, localeForSegments } from "@/i18n/config";
import { resolvePage } from "@/lib/site-pages";
import { localizedIdentity } from "@/lib/localized-seo";
import { SITE, jsonLdGraph } from "@/lib/seo";
import { ADSENSE_SCRIPT, ADVERTISING_PRIVACY, showsAds } from "@/lib/adsense";
import { withOfficialContacts } from "@/lib/contact";
export const metadata: Metadata = {
  metadataBase: new URL(SITE.url), applicationName: SITE.name, creator: SITE.name, publisher: SITE.name,
  icons: { icon: [{ url: "/favicon.ico", sizes: "48x48" }, { url: "/icon.svg", type: "image/svg+xml" }] }, manifest: "/manifest.webmanifest",
  formatDetection: { telephone: false, address: false, email: false },
};
export const viewport: Viewport = { themeColor: "#04090d", width: "device-width", initialScale: 1, colorScheme: "dark" };
export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ segments?: string[] }> }) {
  const segments = (await params).segments ?? [], locale = localeForSegments(segments), d = dictionary(locale);
  const page = resolvePage(segments), identity = page?.identity ?? { kind: "home" as const };
  return <html lang={locale} dir={LANGUAGES[locale].dir} className="dark"><head>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdGraph(localizedIdentity(locale)) }} />
    {showsAds(page) && <script async src={ADSENSE_SCRIPT} crossOrigin="anonymous" />}
  </head><body className="min-h-dvh bg-ink-950 font-sans text-slate-100 antialiased">
    <I18nProvider locale={locale} messages={{ ...withOfficialContacts(d), privacy1: ADVERTISING_PRIVACY[locale] }}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-cyan-600 focus:px-4 focus:py-2 focus:text-sm focus:text-white">{d.skip}</a>
      <div className="pointer-events-none fixed inset-0 -z-10 aurora" aria-hidden /><div className="pointer-events-none fixed inset-0 -z-10 grid-lines" aria-hidden />
      <div className="flex min-h-dvh flex-col"><Header locale={locale} identity={identity} /><main id="main" className="flex-1">{children}</main><Footer locale={locale} /></div>
    </I18nProvider>
  </body></html>;
}
