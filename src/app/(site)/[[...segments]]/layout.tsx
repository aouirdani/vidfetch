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
import { ADSENSE_CLIENT, ADSENSE_DEFERRED_LOADER, ADSENSE_DEFERRED_LOADING_ENABLED, ADVERTISING_PRIVACY, showsAds } from "@/lib/adsense";
import { withOfficialContacts } from "@/lib/contact";
import { ConsentManager } from "@/components/ConsentManager";
const headingFont = localFont({
  src: "../../../../public/fonts/bricolage-grotesque-latin-800.woff2",
  weight: "800",
  style: "normal",
  display: "optional",
  preload: false,
  variable: "--font-heading",
  declarations: [
    { prop: "font-family", value: "Bricolage Grotesque" },
    { prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" },
  ],
});
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
    {locale !== "ar" && <link rel="preload" href="/fonts/bricolage-grotesque-latin-800.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />}
    {showsAds(page) && <meta name="google-adsense-account" content={ADSENSE_CLIENT} />}
    {showsAds(page) && ADSENSE_DEFERRED_LOADING_ENABLED && <script dangerouslySetInnerHTML={{ __html: ADSENSE_DEFERRED_LOADER }} />}
  </head><body className={`${headingFont.variable} min-h-dvh bg-ink-950 font-sans text-slate-100 antialiased`}>
    <ConsentManager />
    <I18nProvider locale={locale} messages={{ ...withOfficialContacts(d), privacy1: ADVERTISING_PRIVACY[locale] }}>
      <a href="#main" className="skip-link sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:px-4 focus:py-2 focus:text-sm">{d.skip}</a>
      <div className="pointer-events-none fixed inset-0 -z-10 aurora" aria-hidden /><div className="pointer-events-none fixed inset-0 -z-10 grid-lines" aria-hidden />
      <div className="flex min-h-dvh flex-col"><Header locale={locale} identity={identity} /><main id="main" className="flex-1">{children}</main><Footer locale={locale} /></div>
    </I18nProvider>
  </body></html>;
}
