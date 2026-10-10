import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} — Video Downloader`,
    short_name: SITE.name,
    description: "Download public videos and audio from YouTube, TikTok, Instagram and X. Paste a link, choose a quality, and save the file to your device.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#05050b",
    theme_color: "#05050b",
    lang: "en",
    categories: ["utilities", "productivity", "multimedia"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/og-image.jpg", sizes: "1200x630", type: "image/jpeg" },
    ],
  };
}
