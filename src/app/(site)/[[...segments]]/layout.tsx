import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
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
const headingFont = localFont({ src: "../../../../public/fonts/bricolage-grotesque-latin-800.woff2", weight: "800", style: "normal", display: "swap", variable: "--font-heading" });
const bodyFont = localFont({ src: "../../../../public/fonts/onest-latin-variable.woff2", weight: "400 600", style: "normal", display: "swap", variable: "--font-body" });
export const metadata: Metadata = {
  metadataBase: new URL(SITE.url), applicationName: SITE.name, creator: SITE.name, publisher: SITE.name,
  icons: { icon: [{ url: "/favicon.ico", sizes: "48x48" }, { url: "/icon.svg", type: "image/svg+xml" }] }, manifest: "/manifest.webmanifest",
  formatDetection: { telephone: false, address: false, email: false },
};
export const viewport: Viewport = { themeColor: "#eef1f8", width: "device-width", initialScale: 1, colorScheme: "light" };
export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ segments?: string[] }> }) {
  const segments = (await params).segments ?? [], locale = localeForSegments(segments), d = dictionary(locale);
  const page = resolvePage(segments), identity = page?.identity ?? { kind: "home" as const };
  return <html lang={locale} dir={LANGUAGES[locale].dir}><head>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdGraph(localizedIdentity(locale)) }} />
    {locale === "ar" && <link rel="preload" href="/fonts/noto-kufi-arabic.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />}
    {locale === "ar" && <link rel="preload" href="/fonts/noto-kufi-arabic.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />}
    {showsAds(page) && <script async src={ADSENSE_SCRIPT} crossOrigin="anonymous" />}
  </head><body className={`${headingFont.variable} ${bodyFont.variable} min-h-dvh bg-ink-950 font-sans text-slate-100 antialiased`}>
    <I18nProvider locale={locale} messages={{ ...withOfficialContacts(d), privacy1: ADVERTISING_PRIVACY[locale] }}>
      <a href="#main" className="skip-link sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:px-4 focus:py-2 focus:text-sm">{d.skip}</a>
      <div className="pointer-events-none fixed inset-0 -z-10 aurora" aria-hidden /><div className="pointer-events-none fixed inset-0 -z-10 grid-lines" aria-hidden />
      <div className="flex min-h-dvh flex-col"><Header locale={locale} identity={identity} /><main id="main" className="flex-1">{children}</main><Footer locale={locale} /></div>
    </I18nProvider>
  </body></html>;
}
