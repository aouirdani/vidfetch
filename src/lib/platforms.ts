/** Shared, strict URL validation. Only individual media from supported hosts is accepted. */
export const PLATFORMS = ["youtube", "tiktok", "instagram", "twitter"] as const;
export type Platform = (typeof PLATFORMS)[number];
export type PlatformMeta = {
  id: Platform;
  name: string;
  host: string;
  accent: string;
  color: string;
  examples: string[];
};

export const PLATFORM_META: Record<Platform, PlatformMeta> = {
  youtube: {
    id: "youtube", name: "YouTube", host: "youtube.com",
    accent: "from-red-500 to-rose-600", color: "#ff0033",
    examples: ["https://www.youtube.com/watch?v=aqz-KE-bpKQ"],
  },
  tiktok: {
    id: "tiktok", name: "TikTok", host: "tiktok.com",
    accent: "from-cyan-400 to-fuchsia-500", color: "#25f4ee",
    examples: ["https://www.tiktok.com/@pokemonlife22/video/7059698374567611694"],
  },
  instagram: {
    id: "instagram", name: "Instagram", host: "instagram.com",
    accent: "from-amber-400 via-pink-500 to-purple-600", color: "#e1306c",
    examples: ["https://www.instagram.com/reel/Chunk8-jurw/"],
  },
  twitter: {
    id: "twitter", name: "Twitter / X", host: "x.com",
    accent: "from-slate-300 to-slate-500", color: "#e7e9ea", examples: [],
  },
};

export type Detection = {
  ok: boolean;
  platform: Platform | null;
  url: string;
  reason?: "empty" | "scheme" | "unsupported";
};

/** Also accepts the caption + link text copied by TikTok's Share action. */
export function normaliseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const embedded = trimmed.match(/https?:\/\/[^\s<>"“”]+/i)?.[0];
  const value = (embedded ?? trimmed).replace(/[.,;!]+$/, "");
  return /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value.replace(/^\/+/, "")}`;
}

export function detectPlatform(raw: string): Detection {
  const value = normaliseUrl(raw);
  const invalid = (reason: Detection["reason"]): Detection => ({ ok: false, platform: null, url: value, reason });
  if (!value) return invalid("empty");
  if (value.length > 4096) return invalid("scheme");
  let parsed: URL;
  try { parsed = new URL(value); } catch { return invalid("scheme"); }
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port) {
    return invalid("scheme");
  }
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;
  let platform: Platform | null = null;
  let canonical: string | null = null;

  if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"].includes(host)) {
    const id = host.endsWith("youtu.be") ? path.split("/")[1]
      : path === "/watch" ? parsed.searchParams.get("v")
      : path.match(/^\/(?:shorts|live|embed|v)\/([\w-]+)\/?$/)?.[1];
    if (id && /^[\w-]{11}$/.test(id)) { platform = "youtube"; canonical = `https://www.youtube.com/watch?v=${id}`; }
  } else if (["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"].includes(host)) {
    const video = path.match(/^\/@([\w.-]+)\/video\/(\d{15,25})\/?$/);
    const mobile = path.match(/^\/(?:v|share\/video)\/(\d{15,25})(?:\.html)?\/?$/);
    if (video) { platform = "tiktok"; canonical = `https://www.tiktok.com/@${video[1]}/video/${video[2]}`; }
    else if (mobile) { platform = "tiktok"; canonical = `https://www.tiktok.com/@_/video/${mobile[1]}`; }
    else if ((["vm.tiktok.com", "vt.tiktok.com"].includes(host) && /^\/[\w-]+\/?$/.test(path)) || /^\/t\/[\w-]+\/?$/.test(path)) {
      platform = "tiktok"; canonical = `https://${host}${path}`;
    }
  } else if (["instagram.com", "www.instagram.com", "m.instagram.com", "instagr.am", "www.instagr.am"].includes(host)) {
    const post = path.match(/^\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]{5,80})(?:\/(?:embed\/)?)?$/);
    const story = path.match(/^\/stories\/([\w.]+)\/(\d+)\/?$/);
    const share = path.match(/^\/share\/(reel|p)\/([\w-]+)\/?$/);
    if (post) { platform = "instagram"; canonical = `https://www.instagram.com/${post[1] === "reels" ? "reel" : post[1]}/${post[2]}/`; }
    else if (story) { platform = "instagram"; canonical = `https://www.instagram.com/stories/${story[1]}/${story[2]}/`; }
    else if (share) { platform = "instagram"; canonical = `https://www.instagram.com/share/${share[1]}/${share[2]}/`; }
  } else if (["twitter.com", "www.twitter.com", "mobile.twitter.com", "x.com", "www.x.com"].includes(host)) {
    const post = path.match(/^\/(?:([\w]{1,20})\/status(?:es)?|i\/web\/status)\/(\d+)(?:\/video\/\d+)?\/?$/);
    if (post) { platform = "twitter"; canonical = `https://x.com/${post[1] ?? "i/web"}/status/${post[2]}`; }
  }
  return platform && canonical ? { ok: true, platform, url: canonical } : invalid("unsupported");
}

export function platformName(platform: Platform | null): string {
  return platform ? PLATFORM_META[platform].name : "Unknown platform";
}

export function extractPlatformId(platform: Platform, url: string): string | null {
  try {
    const parsed = new URL(url);
    if (platform === "youtube") return parsed.searchParams.get("v") ?? null;
    if (platform === "tiktok") return parsed.pathname.match(/\/video\/(\d+)/)?.[1] ?? null;
    if (platform === "instagram") return parsed.pathname.match(/\/(?:p|reels?|tv)\/([\w-]+)/)?.[1] ?? null;
    return parsed.pathname.match(/\/status(?:es)?\/(\d+)/)?.[1] ?? null;
  } catch { return null; }
}
