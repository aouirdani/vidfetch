import type { Platform } from "./platforms";

export type MediaKind = "video" | "audio";
export type MediaFormat = {
  id: string;
  label: string;
  kind: MediaKind;
  ext: string;
  height: number | null;
  width: number | null;
  fps: number | null;
  vcodec: string | null;
  acodec: string | null;
  hasAudio: boolean;
  progressive: boolean;
  protocol: string | null;
  /** Display estimate only. Never use this value as an HTTP Content-Length. */
  filesize: number | null;
  filesizeLabel: string | null;
  bitrateKbps: number | null;
  note: string | null;
  recommended: boolean;
};

export type MediaInfo = {
  platform: Platform;
  platformVideoId: string | null;
  url: string;
  title: string;
  description: string | null;
  uploader: string | null;
  duration: number | null;
  durationLabel: string;
  thumbnail: string | null;
  webpageUrl: string;
  extractor: string | null;
  viewCount: number | null;
  likeCount: number | null;
  formats: MediaFormat[];
  videoFormats: MediaFormat[];
  audioFormats: MediaFormat[];
};

export function formatDuration(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--:--";
  const total = Math.max(0, Math.round(value));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${String(m).padStart(2, "0")}:${s}`;
}

export function formatBytes(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes, index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
  return `${value >= 100 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

export function formatCount(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function slugifyTitle(title: string): string {
  return title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "video";
}

export function buildFilename(title: string, ext: string): string {
  return `VidFetch_${slugifyTitle(title)}.${ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "mp4"}`;
}

export function prettyCodec(codec: string | null | undefined): string | null {
  if (!codec || codec === "unknown") return null;
  const value = codec.split(".")[0].toLowerCase();
  const names: Record<string, string> = { avc1: "H.264", h264: "H.264", h265: "HEVC", hvc1: "HEVC", hevc: "HEVC", vp9: "VP9", av01: "AV1", mp4a: "AAC", aac: "AAC", opus: "Opus", vorbis: "Vorbis", mp3: "MP3" };
  return names[value] ?? codec.toUpperCase();
}

const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;

/** Missing codec metadata is NOT the same as an explicit 'none' codec (Instagram). */
export function normaliseFormat(raw: Record<string, unknown>): MediaFormat | null {
  const id = text(raw.format_id);
  const ext = (text(raw.ext) ?? "mp4").toLowerCase();
  const note = text(raw.format_note);
  const protocol = text(raw.protocol);
  if (!id || raw.has_drm === true || ["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(ext) || /storyboard|mhtml|unplayable/i.test(`${id} ${ext} ${note ?? ""}`)) return null;
  if (/preview|iframe/i.test(protocol ?? "")) return null;
  const vcodec = text(raw.vcodec);
  const acodec = text(raw.acodec);
  const audioOnly = vcodec === "none" || (!vcodec && ["m4a", "mp3", "aac", "opus", "ogg", "wav", "flac"].includes(ext));
  const hasVideo = !audioOnly;
  const hasAudio = acodec !== "none";
  if (!hasVideo && !hasAudio) return null;
  const height = number(raw.height), width = number(raw.width), fps = number(raw.fps);
  const resolution = height && width ? Math.min(height, width) : height;
  const bitrate = number(raw.abr) ?? number(raw.tbr);
  const filesize = number(raw.filesize) ?? number(raw.filesize_approx);
  return {
    id,
    label: audioOnly ? `${ext.toUpperCase()}${bitrate ? ` · ${Math.round(bitrate)} kbps` : " audio"}`
      : `${resolution ? `${resolution}p` : "Original"}${fps && fps > 30 ? ` · ${Math.round(fps)} fps` : ""}`,
    kind: audioOnly ? "audio" : "video", ext, height, width, fps,
    vcodec: hasVideo ? vcodec ?? "unknown" : null,
    acodec: hasAudio ? acodec ?? "unknown" : null,
    hasAudio, progressive: hasVideo && hasAudio, protocol,
    filesize, filesizeLabel: formatBytes(filesize), bitrateKbps: bitrate, note, recommended: false,
  };
}

function score(format: MediaFormat): number {
  const resolution = format.height && format.width ? Math.min(format.height, format.width) : format.height ?? 0;
  return resolution * 100000 + (format.progressive ? 10000 : 0) + (format.ext === "mp4" ? 5000 : 0)
    + (format.vcodec?.startsWith("avc") || format.vcodec === "h264" ? 1000 : 0) + Math.min(900, format.bitrateKbps ?? 0);
}

export function buildFormatMenu(formats: MediaFormat[], ffmpeg = false): { videoFormats: MediaFormat[]; audioFormats: MediaFormat[] } {
  const video = new Map<string, MediaFormat>();
  const audio = formats.filter((format) => format.kind === "audio").sort((a, b) => (b.bitrateKbps ?? 0) - (a.bitrateKbps ?? 0));
  for (const format of formats.filter((f) => f.kind === "video").sort((a, b) => score(b) - score(a))) {
    // A silent source remains downloadable; separated audio is only merged when ffmpeg exists.
    if (!ffmpeg && !format.hasAudio && audio.length > 0) continue;
    const key = `${format.width ?? 0}x${format.height ?? 0}`;
    if (!video.has(key)) video.set(key, format);
  }
  const videoFormats = [...video.values()].slice(0, 10).map((f, i) => ({ ...f, recommended: i === 0 }));
  let audioFormats = audio.slice(0, 4).map((f, i) => ({ ...f, recommended: !ffmpeg && i === 0 }));
  if (ffmpeg && formats.some((f) => f.hasAudio)) {
    const mp3: MediaFormat = {
      id: "mp3", label: "MP3 · 192 kbps", kind: "audio", ext: "mp3", height: null, width: null, fps: null,
      vcodec: null, acodec: "mp3", hasAudio: true, progressive: false, protocol: null,
      filesize: null, filesizeLabel: null, bitrateKbps: 192, note: "Converted with ffmpeg", recommended: true,
    };
    audioFormats = [mp3, ...audioFormats];
  }
  return { videoFormats, audioFormats };
}
