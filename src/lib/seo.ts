import type { Metadata } from "next";
import { PLATFORM_META, type Platform } from "./platforms";

export const SITE = {
  name: "VidFetch",
  domain: "vidfetch.app",
  url: "https://vidfetch.app",
  tagline: "Your videos, a link away",
  locale: "en_US",
  email: "support@vidfetch.app",
} as const;

/** Stable content revision date for dateModified; bump when page copy changes. */
export const CONTENT_UPDATED = "2026-10-12";

export const OG_IMAGE = { url: "/og-image-v3.jpg", width: 1200, height: 630, alt: "VidFetch — save public videos as MP4 or MP3 from a link", type: "image/jpeg" } as const;

/** Thumbnail hosts resolved after extraction; early DNS lookups shave latency off the media preview. */
export const MEDIA_CDN_HOSTS = ["https://i.ytimg.com", "https://scontent.cdninstagram.com", "https://p16-sign-va.tiktokcdn.com", "https://pbs.twimg.com"] as const;

type PageSeo = { title: string; description: string; path: string; keywords?: string[]; type?: "website" | "article" };

/** Canonical URLs and social tags stay consistent across every route. */
export function pageMetadata({ title, description, path, keywords, type = "website" }: PageSeo): Metadata {
  const canonical = path === "/" ? "/" : path.replace(/\/$/, "");
  return {
    // Absolute titles: each page owns its exact wording, so the layout template
    // can never append a second "| VidFetch" suffix.
    title: { absolute: title },
    description, keywords,
    alternates: { canonical },
    openGraph: { type, url: `${SITE.url}${canonical === "/" ? "" : canonical}`, siteName: SITE.name, locale: SITE.locale, title, description, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
  };
}

export type LandingPage = {
  slug: string;
  platform: Platform;
  title: string;
  metaTitle: string;
  metaDescription: string;
  heading: string;
  intro: string;
  keywords: string[];
  supported: string[];
  limits: string[];
  faqs: Array<{ question: string; answer: string }>;
};

/** Platform landing pages: unique, accurate copy — never duplicated boilerplate. */
export const LANDING_PAGES: LandingPage[] = [
  {
    slug: "youtube-video-downloader", platform: "youtube",
    title: "YouTube Video Downloader",
    metaTitle: "YouTube Video Downloader — Save MP4 & MP3 | VidFetch",
    metaDescription: "Download public YouTube videos as MP4 or extract MP3 audio. Paste a link, pick a quality up to the source maximum, and save straight to your device.",
    heading: "Download YouTube videos and audio",
    intro: "Paste any public YouTube watch, Shorts or youtu.be link. VidFetch lists the resolutions the video actually offers, merges separate video and audio tracks into a clean MP4, and can convert the soundtrack to a real MP3 file.",
    keywords: ["youtube video downloader", "youtube to mp4", "youtube to mp3", "youtube shorts downloader", "save youtube videos"],
    supported: ["Standard watch links such as youtube.com/watch?v=…", "Short links such as youtu.be/…", "YouTube Shorts links", "MP4 video downloads and MP3 audio conversion"],
    limits: ["Private, unlisted-restricted, members-only, purchased and age-gated videos are not accessible.", "Live streams and very long videos depend on the source and your connection.", "YouTube may rate-limit automated access from shared server IP addresses."],
    faqs: [
      { question: "Can I download YouTube videos in 1080p or higher?", answer: "Yes, when the source provides it. VidFetch lists the resolutions YouTube actually returns for that video and merges the matching audio track with ffmpeg so the saved MP4 plays with sound." },
      { question: "How do I convert a YouTube video to MP3?", answer: "Extract the link, open the Audio tab and choose the MP3 option. VidFetch streams the soundtrack through ffmpeg and encodes a genuine 192 kbps MP3 rather than renaming the source file." },
      { question: "Why does a YouTube link sometimes fail?", answer: "YouTube restricts private, members-only, purchased and age-verified videos, and it can temporarily rate-limit datacenter IP addresses. VidFetch reports the specific reason instead of failing silently." },
    ],
  },
  {
    slug: "tiktok-video-downloader", platform: "tiktok",
    title: "TikTok Video Downloader",
    metaTitle: "TikTok Video Downloader — No Watermark Options | VidFetch",
    metaDescription: "Download public TikTok videos as MP4 or save the sound as MP3. Works with tiktok.com links, vm.tiktok.com share links and pasted share text.",
    heading: "Download TikTok videos and sounds",
    intro: "Copy a TikTok link from the app or the web and paste it here — including vm.tiktok.com and vt.tiktok.com share links, or the whole share caption. VidFetch shows the available renditions and saves the video with its audio intact.",
    keywords: ["tiktok video downloader", "tiktok no watermark", "save tiktok video", "tiktok mp3", "tiktok share link downloader"],
    supported: ["Full links such as tiktok.com/@creator/video/…", "Share links from the mobile app (vm.tiktok.com, vt.tiktok.com, /t/…)", "Pasted share text that contains a link", "MP4 downloads plus MP3 sound extraction"],
    limits: ["Whether a watermark-free rendition exists is decided by TikTok, not by VidFetch — pick the format labelled without a watermark when it is offered.", "Photo-mode posts, profiles, hashtags and private accounts are not supported.", "Expired share links and region-locked videos cannot be opened."],
    faqs: [
      { question: "Can VidFetch download TikTok videos without a watermark?", answer: "Only when TikTok itself exposes a clean rendition for that video. VidFetch lists every format it receives and labels them, so you can choose the one you need, but it cannot remove a watermark that is burned into the video." },
      { question: "Do mobile share links work?", answer: "Yes. vm.tiktok.com, vt.tiktok.com and tiktok.com/t/ links are supported, and you can paste the entire share message — VidFetch extracts the URL from the surrounding text." },
      { question: "Can I save just the TikTok sound?", answer: "Yes. Choose the Audio tab and select MP3. The soundtrack is transcoded with ffmpeg into a real MP3 file you can play anywhere." },
    ],
  },
  {
    slug: "instagram-reels-downloader", platform: "instagram",
    title: "Instagram Reels Downloader",
    metaTitle: "Instagram Reels & Video Downloader — MP4 | VidFetch",
    metaDescription: "Download public Instagram Reels and video posts as MP4. Paste a /reel/ or /p/ link and save the original quality directly to your device.",
    heading: "Download Instagram Reels and videos",
    intro: "Paste the link to a public Reel, video post or IGTV-style upload. VidFetch reads the renditions Instagram publishes for that post, keeps the original resolution, and streams the MP4 straight to your browser.",
    keywords: ["instagram reels downloader", "instagram video downloader", "download reels mp4", "save instagram video", "ig reel download"],
    supported: ["Reel links such as instagram.com/reel/…", "Video post links such as instagram.com/p/…", "Longer-form video (IGTV-style) links", "Share links of the form /share/reel/… are resolved to the original post"],
    limits: ["Private accounts, close-friends posts and login-gated content cannot be downloaded.", "Photo-only posts contain no video; carousels currently return their first video item.", "Instagram applies strict anti-automation checks and may temporarily block requests from server IP addresses."],
    faqs: [
      { question: "Can I download a Reel in its original quality?", answer: "Yes. VidFetch lists the renditions Instagram returns for the post and preserves the source resolution and codec — there is no re-encoding step for video downloads." },
      { question: "Does it work with private Instagram accounts?", answer: "No. VidFetch cannot access private accounts, close-friends posts or anything that requires being logged in, and it will tell you when a post is restricted instead of producing a broken file." },
      { question: "Why do some Reels have no audio option?", answer: "Some Instagram uploads genuinely contain no separate audio track. VidFetch keeps those videos downloadable instead of inventing an audio stream that does not exist." },
    ],
  },
  {
    slug: "twitter-video-downloader", platform: "twitter",
    title: "Twitter / X Video Downloader",
    metaTitle: "Twitter / X Video Downloader — Save MP4 | VidFetch",
    metaDescription: "Download videos from public X (formerly Twitter) posts as MP4. Paste the status link and choose the quality you want to keep.",
    heading: "Download videos from X (Twitter)",
    intro: "Paste the link to a public post that contains a video — x.com and twitter.com status URLs both work. VidFetch reads the available bitrate renditions and saves the MP4 without a watermark added by us.",
    keywords: ["twitter video downloader", "x video downloader", "download twitter video mp4", "save x video", "twitter gif download"],
    supported: ["Status links such as x.com/user/status/…", "Legacy twitter.com and mobile.twitter.com status links", "Direct links to a specific video in a post", "MP4 downloads plus audio extraction when the post has sound"],
    limits: ["Protected accounts, deleted posts and age-restricted media require a login and are not accessible.", "Posts that contain only images or external embeds have no downloadable video.", "X may rate-limit anonymous requests from shared server addresses."],
    faqs: [
      { question: "Which X links are supported?", answer: "Any public status URL from x.com, twitter.com or mobile.twitter.com that contains a native video, including links that point directly at a specific video in the post." },
      { question: "Can I pick the video quality?", answer: "Yes. X publishes several bitrate renditions and VidFetch lists them with their resolution and estimated size so you can balance quality against file size." },
      { question: "Are protected or deleted posts supported?", answer: "No. Protected accounts and removed posts are not accessible without an authorised session, and VidFetch reports that clearly rather than returning an empty file." },
    ],
  },
];

export function landingPageFor(slug: string): LandingPage | undefined {
  return LANDING_PAGES.find((page) => page.slug === slug);
}

export function platformLanding(platform: Platform): LandingPage {
  return LANDING_PAGES.find((page) => page.platform === platform) ?? LANDING_PAGES[0];
}

type JsonLd = Record<string, unknown>;

export function organisationSchema(): JsonLd {
  return {
    "@type": "Organization", "@id": `${SITE.url}/#organization`, name: SITE.name, url: SITE.url,
    description: "VidFetch is a free web application that saves public videos as MP4 or their soundtrack as MP3 from a link, with no account.",
    logo: { "@type": "ImageObject", url: `${SITE.url}${OG_IMAGE.url}`, width: OG_IMAGE.width, height: OG_IMAGE.height },
    contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", email: SITE.email, availableLanguage: ["English"] }],
  };
}

export function websiteSchema(): JsonLd {
  return { "@type": "WebSite", "@id": `${SITE.url}/#website`, name: SITE.name, url: SITE.url, inLanguage: "en", publisher: { "@id": `${SITE.url}/#organization` } };
}

export function applicationSchema(options?: { name?: string; description?: string; url?: string; features?: string[] }): JsonLd {
  return {
    "@type": "WebApplication", "@id": `${options?.url ?? SITE.url}/#app`,
    name: options?.name ?? `${SITE.name} — Video Downloader`,
    url: options?.url ?? SITE.url,
    description: options?.description ?? "Save public videos as MP4 or their soundtrack as MP3. Paste a link, choose a format the source provides, and save the file to your device.",
    applicationCategory: "MultimediaApplication", operatingSystem: "Any modern web browser", browserRequirements: "Requires JavaScript",
    inLanguage: "en", isAccessibleForFree: true, publisher: { "@id": `${SITE.url}/#organization` },
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: options?.features ?? ["Save public videos from a link", "Choose from the formats the source provides", "Convert the soundtrack to MP3 audio (192 kbps)", "No account or installation required"],
  };
}

export function itemListSchema(name: string, items: Array<{ name: string; path: string; description?: string }>): JsonLd {
  return {
    "@type": "ItemList", name, itemListOrder: "https://schema.org/ItemListUnordered", numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem", position: index + 1, name: item.name,
      description: item.description, url: `${SITE.url}${item.path}`,
    })),
  };
}

export function webPageSchema(options: { name: string; path: string; description: string }): JsonLd {
  const url = `${SITE.url}${options.path === "/" ? "" : options.path}`;
  return {
    "@type": "WebPage", "@id": `${url}#page`, name: options.name, url, description: options.description,
    inLanguage: "en", isPartOf: { "@id": `${SITE.url}/#website` },
    dateModified: CONTENT_UPDATED, primaryImageOfPage: { "@type": "ImageObject", url: `${SITE.url}${OG_IMAGE.url}` },
  };
}

export function faqSchema(faqs: Array<{ question: string; answer: string }>, url: string): JsonLd {
  return {
    "@type": "FAQPage", "@id": `${url}#faq`,
    mainEntity: faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })),
  };
}

export function howToSchema(url: string): JsonLd {
  return {
    "@type": "HowTo", "@id": `${url}#howto`, name: "How to download a video with VidFetch", inLanguage: "en",
    tool: [{ "@type": "HowToTool", name: "A web browser" }],
    step: [
      { "@type": "HowToStep", position: 1, name: "Paste a link", text: "Copy the link to a public video and paste it into the VidFetch field.", url: `${url}#extractor` },
      { "@type": "HowToStep", position: 2, name: "Choose a format", text: "Select Extract to preview the video, then pick a video quality or the MP3 audio option.", url: `${url}#extractor` },
      { "@type": "HowToStep", position: 3, name: "Save the file", text: "Select Download with VidFetch. The file streams straight to your browser's download folder.", url: `${url}#extractor` },
    ],
  };
}

export function breadcrumbSchema(items: Array<{ name: string; path: string }>): JsonLd {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: `${SITE.url}${item.path === "/" ? "" : item.path}` })),
  };
}

/** A single @graph block keeps structured data valid and avoids duplicate node IDs. */
export function jsonLdGraph(nodes: JsonLd[]): string {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": nodes }).replace(/</g, "\\u003c");
}

export const HOME_FAQS = [
  { question: "Is VidFetch free to use?", answer: "Yes. VidFetch is free and needs no account; the site is funded by advertising. You paste a link, choose a format and download the file." },
  { question: "Which platforms are supported?", answer: "Links to individual public videos from TikTok, Instagram and X (formerly Twitter) are recognized. YouTube links are recognized, but YouTube access from our hosting is currently blocked by the provider\u2019s anti-bot checks. Profiles, hashtags and photo-only posts are not supported." },
  { question: "Can I download private or restricted videos?", answer: "No. VidFetch only reaches content that is publicly available to an anonymous visitor. Private accounts, deleted posts, login-gated media and region-blocked videos are reported as unavailable." },
  { question: "Does VidFetch store my downloads?", answer: "No media files are kept. Video data streams through the server to your browser. Temporary transfer status and limited operational records help keep the service running. Download links and titles are not published." },
  { question: "How do I save a video as MP3?", answer: "Extract the link, open the Audio tab and pick MP3. The soundtrack is encoded with ffmpeg into a real MP3 file rather than a renamed video container." },
  { question: "Is there a file size or length limit?", answer: "The download backend limits output to 256 MiB, declared media duration to 30 minutes and the whole operation to 10 minutes. One operation runs at a time. Availability also depends on the video source." },
  { question: "Is it legal to download videos?", answer: "It depends on the content and where you live. Only download videos you own, that are licensed for reuse, or that you have the rights holder's permission to save. Public visibility alone is not permission." },
];
