import type { MetadataRoute } from "next";
import { LANDING_PAGES, SITE } from "@/lib/seo";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} — Video Downloader`,
    short_name: SITE.name,
    description: "Save public videos as MP4 or their soundtrack as MP3 from a link. Paste a link, choose a format the source provides, and save the file to your device.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#04090d",
    theme_color: "#04090d",
    lang: "en",
    categories: ["utilities", "productivity", "multimedia"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/og-image.jpg", sizes: "1200x630", type: "image/jpeg" },
    ],
    // Installed on Android, VidFetch appears in the system share sheet. A GET
    // target lands on "/?url=…", which the extractor form reads and runs on
    // load, so sharing from the TikTok or Instagram app starts the download.
    share_target: {
      action: "/",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
    // YouTube access is currently blocked on our hosting: no shortcut promises it.
    shortcuts: LANDING_PAGES.filter((page) => page.platform !== "youtube").map((page) => ({
      name: page.title,
      short_name: PLATFORM_SHORT[page.platform],
      url: `/${page.slug}`,
    })),
  };
}

const PLATFORM_SHORT: Record<string, string> = {
  youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", twitter: "X",
};
