import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";
import { approvedPlatformCopy, availablePlatformPages, platformPagePath } from "@/lib/platform-pages";

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
    // Only the platform pages that are published and indexable (the same gate as the sitemap): never a page that is
    // still a draft or noindex, and never YouTube, which is blocked on our hosting.
    shortcuts: availablePlatformPages("en").map((entry) => ({
      name: approvedPlatformCopy(entry, "en")!.heading,
      short_name: SHORTCUT_NAMES[entry.id] ?? entry.platform,
      url: platformPagePath(entry, "en"),
    })),
  };
}

const SHORTCUT_NAMES: Record<string, string> = {
  "tiktok-video-downloader": "TikTok MP4", "tiktok-mp3": "TikTok MP3",
};
