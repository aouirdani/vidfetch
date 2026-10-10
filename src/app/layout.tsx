import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MEDIA_CDN_HOSTS, OG_IMAGE, SITE, jsonLdGraph, organisationSchema, websiteSchema } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "VidFetch — Free Video Downloader for YouTube, TikTok, Instagram & X",
    template: "%s | VidFetch",
  },
  description:
    "Download public videos and audio from YouTube, TikTok, Instagram and X. Paste a link, choose a quality or MP3, and save the file straight to your device. Free, no sign-up.",
  applicationName: SITE.name,
  authors: [{ name: SITE.name, url: SITE.url }],
  creator: SITE.name,
  publisher: SITE.name,
  category: "technology",
  alternates: { canonical: "/" },
  keywords: ["video downloader", "youtube downloader", "tiktok downloader", "instagram reels downloader", "x video downloader", "twitter video downloader", "mp4 download", "mp3 converter", "vidfetch"],
  openGraph: {
    type: "website", url: SITE.url, siteName: SITE.name, locale: SITE.locale,
    title: "VidFetch — Free Video Downloader for YouTube, TikTok, Instagram & X",
    description: "Paste a link, choose a quality or MP3, and save public videos straight to your device. Free, no sign-up, no installation.",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "VidFetch — Free Video Downloader",
    description: "Download public videos from YouTube, TikTok, Instagram and X. Your videos, a link away.",
    images: [OG_IMAGE.url],
  },
  robots: {
    index: true, follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  themeColor: "#04090d",
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Thumbnail hosts are only contacted after an extraction; resolving DNS early removes a round trip. */}
        {MEDIA_CDN_HOSTS.map((host) => <link key={host} rel="dns-prefetch" href={host} />)}
        <script
          type="application/ld+json"
          // Site-wide identity graph; page-level nodes reference these @id values.
          dangerouslySetInnerHTML={{ __html: jsonLdGraph([organisationSchema(), websiteSchema()]) }}
        />
      </head>
      <body className="min-h-dvh bg-ink-950 font-sans text-slate-100 antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-cyan-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white">
          Skip to main content
        </a>
        <div className="pointer-events-none fixed inset-0 -z-10 aurora" aria-hidden />
        <div className="pointer-events-none fixed inset-0 -z-10 grid-lines" aria-hidden />
        <div className="flex min-h-dvh flex-col">
          <Header />
          <main id="main" className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
