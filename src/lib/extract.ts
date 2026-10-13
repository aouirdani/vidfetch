import { buildFormatMenu, formatDuration, normaliseFormat, type MediaFormat, type MediaInfo } from "./media";
import { extractPlatformId, type Platform } from "./platforms";
import { EngineError } from "./engine";

type RawInfo = Record<string, unknown>;
const str = (v: unknown): string | null => typeof v === "string" && v.trim() ? v.trim() : null;
const num = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;

function pickThumbnail(raw: RawInfo, platform: Platform, id: string | null): string | null {
  const direct = str(raw.thumbnail);
  if (direct && /^https:\/\//i.test(direct)) return direct;
  if (Array.isArray(raw.thumbnails)) {
    const thumbnails = raw.thumbnails.filter((item) => item && typeof item === "object") as RawInfo[];
    const best = thumbnails.filter((t) => /^https:\/\//i.test(str(t.url) ?? ""))
      .sort((a, b) => (num(b.width) ?? 0) - (num(a.width) ?? 0))[0];
    if (best) return str(best.url);
  }
  return platform === "youtube" && id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

export function toMediaInfo({ raw, platform, url, ffmpeg = false }: {
  raw: RawInfo; platform: Platform; url: string; ffmpeg?: boolean;
}): MediaInfo {
  const entries = Array.isArray(raw.formats) ? raw.formats : raw.url ? [{ ...raw, format_id: raw.format_id ?? "0" }] : [];
  const formats: MediaFormat[] = entries
    .filter((entry): entry is RawInfo => Boolean(entry) && typeof entry === "object")
    .map(normaliseFormat).filter((f): f is MediaFormat => f !== null);
  if (!formats.length) throw new EngineError("NO_VIDEO", "This post has no downloadable video or audio. Photo-only posts are not supported.", 404);
  const id = str(raw.id) ?? extractPlatformId(platform, url);
  const duration = num(raw.duration);
  const { videoFormats, audioFormats } = buildFormatMenu(formats, ffmpeg);
  return {
    platform, platformVideoId: id, url,
    title: str(raw.title) ?? str(raw.fulltitle) ?? "Untitled video",
    description: str(raw.description)?.slice(0, 600) ?? null,
    uploader: str(raw.channel) ?? str(raw.uploader) ?? str(raw.uploader_id),
    duration, durationLabel: formatDuration(duration),
    thumbnail: pickThumbnail(raw, platform, id), webpageUrl: str(raw.webpage_url) ?? url,
    extractor: str(raw.extractor_key) ?? str(raw.extractor),
    viewCount: num(raw.view_count), likeCount: num(raw.like_count), formats, videoFormats, audioFormats,
  };
}
