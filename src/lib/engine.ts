import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, copyFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ffmpegStatic from "ffmpeg-static";
import { detectPlatform, platformName, type Platform } from "./platforms";

export type EngineErrorCode = "INVALID_URL" | "UNSUPPORTED_PLATFORM" | "UNAVAILABLE" | "PRIVATE" | "AUTH_REQUIRED" | "RATE_LIMITED" | "UPSTREAM_BLOCKED" | "TIMEOUT" | "ENGINE_MISSING" | "ENGINE_ERROR" | "BUSY" | "NO_VIDEO" | "EXPIRED";
export class EngineError extends Error {
  constructor(readonly code: EngineErrorCode, message: string, readonly status: number, readonly detail?: string) {
    super(message);
    this.name = "EngineError";
  }
}

export type DumpResult = { raw: Record<string, unknown>; ytDlpVersion: string | null };
type Engines = { ytDlpPath: string | null; ffmpegPath: string | null; version: string | null };
type CacheEntry = { value: DumpResult; expires: number };
const shared = globalThis as typeof globalThis & {
  __vidfetchEnginesV2?: Engines;
  __vidfetchInfoCache?: Map<string, CacheEntry>;
  __vidfetchExtractions?: Map<string, Promise<DumpResult>>;
};
const cache = shared.__vidfetchInfoCache ??= new Map();
const pending = shared.__vidfetchExtractions ??= new Map();

function binary(candidates: Array<string | null | undefined>, flag: string): { path: string; output: string } | null {
  for (const candidate of candidates) {
    if (!candidate || (candidate.includes("/") && !existsSync(candidate))) continue;
    const result = spawnSync(candidate, [flag], { encoding: "utf8", timeout: 8000, windowsHide: true });
    if (!result.error && result.status === 0) return { path: candidate, output: result.stdout.trim() };
  }
  return null;
}

function engines(): Engines {
  if (!shared.__vidfetchEnginesV2) {
    const ytdlp = binary([
      process.env.YTDLP_PATH,
      join(process.cwd(), ".media-bin", "yt-dlp"),
      "/opt/vidfetch/bin/yt-dlp", "/usr/local/bin/yt-dlp", "/usr/bin/yt-dlp", "yt-dlp",
      join(process.cwd(), "node_modules", "yt-dlp-exec", "bin", "yt-dlp"),
    ], "--version");
    const ffmpeg = binary([process.env.FFMPEG_PATH, "/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", ffmpegStatic, "ffmpeg"], "-version");
    shared.__vidfetchEnginesV2 = { ytDlpPath: ytdlp?.path ?? null, ffmpegPath: ffmpeg?.path ?? null, version: ytdlp?.output.split("\n")[0] ?? null };
  }
  return shared.__vidfetchEnginesV2;
}

export function engineStatus(): { ytDlp: string | null; ffmpeg: boolean } {
  const current = engines();
  return { ytDlp: current.version, ffmpeg: Boolean(current.ffmpegPath) };
}
export function ytDlpBinary(): string {
  const path = engines().ytDlpPath;
  if (!path) throw new EngineError("ENGINE_MISSING", "The download engine is unavailable. Please try again after the server is restarted.", 503);
  return path;
}
export function ffmpegBinary(): string {
  const path = engines().ffmpegPath;
  if (!path) throw new EngineError("ENGINE_MISSING", "Audio conversion is unavailable on this server. Choose an original format instead.", 503);
  return path;
}

/** Each process gets its own writable cookie jar; mounted secret files stay unchanged. */
export async function engineContext(platform: Platform): Promise<{ flags: string[]; cleanup: () => Promise<void> }> {
  const flags = [
    "--ignore-config", "--no-playlist", "--playlist-items", "1", "--no-progress", "--no-warnings", "--no-colors", "--no-cache-dir",
    "--socket-timeout", "20", "--retries", "3", "--extractor-retries", "2", "--fragment-retries", "3", "--js-runtimes", "node",
  ];
  if (engines().ffmpegPath) flags.push("--ffmpeg-location", engines().ffmpegPath!);
  const cookies = process.env[`YTDLP_${platform.toUpperCase()}_COOKIES`] || process.env.YTDLP_COOKIES_FILE;
  let directory: string | null = null;
  try {
    if (cookies) {
      directory = await mkdtemp(join(tmpdir(), "vidfetch-session-"));
      const target = join(directory, "cookies.txt");
      await copyFile(cookies, target);
      await chmod(target, 0o600);
      flags.push("--cookies", target);
    }
    if (process.env.YTDLP_PROXY) flags.push("--proxy", process.env.YTDLP_PROXY);
    return { flags, cleanup: async () => { if (directory) await rm(directory, { recursive: true, force: true }); } };
  } catch {
    if (directory) await rm(directory, { recursive: true, force: true });
    throw new EngineError("ENGINE_ERROR", "The server's media session configuration is unavailable. Please contact the site operator.", 503);
  }
}

/** Never follow a share-link redirect outside the same supported platform. */
async function resolveInstagramShare(url: string): Promise<string> {
  if (!new URL(url).pathname.startsWith("/share/")) return url;
  let current = url;
  for (let i = 0; i < 5; i++) {
    const response = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(15000), headers: { "User-Agent": "Mozilla/5.0" } });
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (!location) break;
    const next = detectPlatform(new URL(location, current).toString());
    if (!next.ok || next.platform !== "instagram") break;
    current = next.url;
    if (!new URL(current).pathname.startsWith("/share/")) return current;
  }
  throw new EngineError("UNAVAILABLE", "This Instagram share link could not be resolved. Open the Reel and copy its original /reel/ or /p/ link.", 404);
}

function runMetadata(url: string, flags: string[], timeoutMs: number, platform: Platform): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const child = spawn(ytDlpBinary(), [...flags, "--dump-json", "--skip-download", "--", url], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", settled = false;
    const finish = (error?: EngineError, raw?: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) { child.kill("SIGKILL"); reject(error); } else resolve(raw!);
    };
    const timer = setTimeout(() => finish(new EngineError("TIMEOUT", `${platformName(platform)} is taking too long to respond. Please try again.`, 504)), timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 12 * 1024 * 1024) finish(new EngineError("ENGINE_ERROR", "The source returned too much metadata for a single video.", 502));
    });
    child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString("utf8")).slice(-12000); });
    child.on("error", (error) => finish(new EngineError("ENGINE_ERROR", "The download engine could not start.", 503, error.message)));
    child.on("close", (code) => {
      if (code !== 0) return finish(classifyEngineFailure(code, stderr, platform));
      try {
        const records = stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
        const raw = records.find((item) => (Array.isArray(item.formats) && item.formats.length > 0) || typeof item.url === "string");
        if (!raw) return finish(new EngineError("NO_VIDEO", "This post has no downloadable video. Photo-only posts are not supported.", 404));
        finish(undefined, raw);
      } catch { finish(new EngineError("ENGINE_ERROR", "The source returned unreadable media information. Please try again.", 502)); }
    });
  });
}

/** Bounded five-minute metadata cache avoids three separate upstream extractions per download. */
export async function dumpJson(input: string, timeoutMs = 75000): Promise<DumpResult> {
  const detection = detectPlatform(input);
  if (!detection.ok || !detection.platform) throw new EngineError("INVALID_URL", "Paste a valid YouTube, TikTok, Instagram or X video link.", 400);
  const url = detection.url, platform = detection.platform;
  const cached = cache.get(url);
  if (cached && cached.expires > Date.now()) return cached.value;
  cache.delete(url);
  const inflight = pending.get(url);
  if (inflight) return inflight;
  if (pending.size >= 4) throw new EngineError("BUSY", "The server is busy preparing other videos. Please try again shortly.", 429);
  const task = (async () => {
    const context = await engineContext(platform);
    try {
      const resolved = platform === "instagram" ? await resolveInstagramShare(url) : url;
      const raw = await runMetadata(resolved, context.flags, timeoutMs, platform);
      const value = { raw, ytDlpVersion: engines().version };
      while (cache.size >= 12) cache.delete(cache.keys().next().value!);
      cache.set(url, { value, expires: Date.now() + 5 * 60 * 1000 });
      return value;
    } finally { await context.cleanup(); }
  })();
  pending.set(url, task);
  try { return await task; } finally { pending.delete(url); }
}

export function invalidateMetadata(url: string): void { cache.delete(url); }

export function classifyEngineFailure(code: number | null, stderr: string, platform?: Platform): EngineError {
  const source = platform ? platformName(platform) : "The source platform";
  const lower = stderr.toLowerCase();
  const detail = `exit=${code ?? "unknown"} ${stderr.slice(-1200)}`;
  if (/private (video|account)|only available.*follow|friends.only/.test(lower)) {
    return new EngineError("PRIVATE", "This video is private. VidFetch cannot access content you do not have permission to download.", 404, detail);
  }
  if (/429|rate.limit|too many requests/.test(lower)) {
    return new EngineError("RATE_LIMITED", `${source} is temporarily limiting requests from this server. Please wait a few minutes before trying again.`, 429, detail);
  }
  if (/login|log.in|log in|sign in|cookies.*needed|restricted video|registered users/.test(lower)) {
    return new EngineError("AUTH_REQUIRED", `${source} requires an authorized session for this video. Try a public post; the site operator can configure server-side cookies for content they are permitted to access.`, 401, detail);
  }
  if (/no video|no formats|only images|photo.mode/.test(lower)) {
    return new EngineError("NO_VIDEO", "This post does not contain a downloadable video. Photo-only posts are not supported.", 404, detail);
  }
  if (/404|not found|unavailable|not available|removed|deleted|does not exist|unsupported url/.test(lower)) {
    return new EngineError("UNAVAILABLE", "This video is unavailable, deleted, region-restricted, or its share link has expired. Check the original post and try again.", 404, detail);
  }
  if (/403|forbidden|challenge|captcha|unexpected response|empty media response|unable to extract.*data|impersonat/.test(lower)) {
    return new EngineError("UPSTREAM_BLOCKED", `${source} is blocking automated access from this server. Please try again later or use another public video.`, 503, detail);
  }
  if (/timed out|timeout/.test(lower)) return new EngineError("TIMEOUT", `${source} took too long to respond. Please try again.`, 504, detail);
  return new EngineError("ENGINE_ERROR", "The source could not complete this download. Re-extract the video and try again.", 502, detail);
}

export type DownloadPlan = { args: string[]; ext: string; contentType: string; convertToMp3: boolean; merged: boolean };

/** Use actual format IDs only; never fall back silently to a different quality. */
export function buildDownloadPlan(options: {
  formatId: string; mediaType: "video" | "audio"; preferredExt: string; ffmpeg: boolean;
  hasAudio: boolean; audioFormatId?: string; protocol?: string | null;
}): DownloadPlan {
  const convertToMp3 = options.formatId === "mp3" && options.mediaType === "audio";
  if (convertToMp3 && !options.ffmpeg) throw new EngineError("ENGINE_MISSING", "MP3 conversion requires ffmpeg. Choose an original audio format.", 503);
  const merged = options.mediaType === "video" && !options.hasAudio && Boolean(options.audioFormatId);
  if (merged && !options.ffmpeg) throw new EngineError("ENGINE_MISSING", "This quality needs ffmpeg to combine video and audio. Choose another quality.", 503);
  const selector = convertToMp3 ? "bestaudio/best[acodec!=none]" : merged ? `${options.formatId}+${options.audioFormatId}` : options.formatId;
  const args = ["--no-part", "--no-simulate", "--abort-on-error", "-f", selector, "-o", "-", "--load-info-json", "-"];
  let ext = convertToMp3 ? "mp3" : options.preferredExt;
  if (merged || (options.mediaType === "video" && options.ffmpeg && /m3u8|dash_segments/.test(options.protocol ?? ""))) {
    // yt-dlp otherwise emits MPEG-TS to stdout while the filename says .mp4.
    args.push("--downloader", "ffmpeg", "--downloader-args", "ffmpeg_o:-f mp4 -movflags +frag_keyframe+empty_moov+default_base_moof");
    ext = "mp4";
  }
  const types: Record<string, string> = options.mediaType === "audio"
    ? { mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", webm: "audio/webm", opus: "audio/ogg", ogg: "audio/ogg", wav: "audio/wav", flac: "audio/flac", aac: "audio/aac" }
    : { mp4: "video/mp4", webm: "video/webm", mkv: "video/x-matroska", mov: "video/quicktime" };
  return { args, ext, contentType: types[ext] ?? "application/octet-stream", convertToMp3, merged };
}

export function isEngineError(error: unknown): error is EngineError { return error instanceof EngineError; }
