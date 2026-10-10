import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import ffprobe from "ffprobe-static";
import ffmpeg from "ffmpeg-static";

const base = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const cases = [
  { platform: "instagram", url: process.env.SMOKE_INSTAGRAM_URL || "https://www.instagram.com/reel/Chunk8-jurw/" },
  { platform: "tiktok", url: process.env.SMOKE_TIKTOK_URL || "https://www.tiktok.com/@pokemonlife22/video/7059698374567611694" },
];
const directory = await mkdtemp(join(tmpdir(), "vidfetch-smoke-"));
const request = async (path, body) => {
  const response = await fetch(`${base}${path}`, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(120000) });
  const payload = await response.json();
  assert.ok(response.ok && payload.ok, `${path}: ${response.status} ${payload.error ?? "Unexpected response"}`);
  return payload;
};

async function validateFile(path, expectedType) {
  const details = JSON.parse(execFileSync(ffprobe.path, ["-v", "error", "-show_entries", "stream=codec_name,codec_type,width,height:format=duration,size,format_name", "-of", "json", path], { encoding: "utf8", timeout: 30000 }));
  assert.ok(details.streams.some((stream) => stream.codec_type === expectedType), `No ${expectedType} stream in file`);
  assert.ok(Number(details.format.duration) > 0, "Video/audio duration must be positive");
  if (expectedType === "audio") assert.ok(details.streams.every((stream) => stream.codec_name === "mp3"), "MP3 output must contain MP3 audio, not renamed source data");
  execFileSync(ffmpeg, ["-v", "error", "-i", path, "-f", "null", "-"], { timeout: 60000, stdio: ["ignore", "ignore", "pipe"] });
  return details;
}

async function download(label, input) {
  const prepared = await request("/api/download", input);
  const response = await fetch(`${base}${prepared.downloadUrl}`, { signal: AbortSignal.timeout(120000) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition") ?? "", /attachment; filename="VidFetch_/);
  assert.equal(response.headers.get("content-length"), null, "Estimated sizes must not truncate streams");
  assert.ok(response.body);
  const file = join(directory, `${label}.${input.type === "audio" ? "mp3" : "mp4"}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
  assert.ok((await stat(file)).size > 1000, "The download should contain media, not an error document");
  const details = await validateFile(file, input.type);
  const status = await request(`/api/download?status=${prepared.token}`);
  assert.equal(status.status, "completed");
  assert.equal(status.bytes, (await stat(file)).size);
  console.log(`PASS ${label}: ${status.bytes} bytes, ${details.format.duration}s, ${details.streams.map((s) => `${s.codec_type}/${s.codec_name}`).join(" + ")}`);
  return prepared;
}

try {
  const home = await (await fetch(base)).text();
  assert.match(home, /<html[^>]*lang="en"/);
  assert.match(home, /Download your videos/);
  assert.doesNotMatch(home, /Téléchargez|Extraire|Tous droits réservés/);
  console.log("PASS English homepage and HTML language");
  for (const item of cases) {
    const metadata = await request("/api/fetch-info", { url: item.url });
    assert.equal(metadata.info.platform, item.platform);
    const format = metadata.info.videoFormats[0];
    assert.ok(format, `No video format for ${item.platform}`);
    console.log(`PASS ${item.platform} metadata: ${metadata.info.title}, ${metadata.info.durationLabel}, ${metadata.info.videoFormats.length} video formats`);
    await download(`${item.platform}-video`, { url: item.url, format_id: format.id, type: "video" });
    if (item.platform === "tiktok") {
      assert.ok(metadata.info.audioFormats.some((f) => f.id === "mp3"), "TikTok should offer MP3 conversion");
      await download("tiktok-mp3", { url: item.url, format_id: "mp3", type: "audio" });
      const params = new URLSearchParams({ url: item.url, format_id: format.id, type: "video" });
      const legacy = await fetch(`${base}/api/download?${params}`, { signal: AbortSignal.timeout(120000) });
      assert.equal(legacy.status, 200);
      await pipeline(Readable.fromWeb(legacy.body), createWriteStream(join(directory, "legacy.mp4")));
      await validateFile(join(directory, "legacy.mp4"), "video");
      console.log("PASS original GET download API");
    }
  }
  const invalid = await fetch(`${base}/api/fetch-info`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://example.com/video" }) });
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error, /Paste a public/);
  const expired = await fetch(`${base}/api/download?ticket=missing`);
  assert.equal(expired.status, 410);
  console.log("PASS English validation errors and expired download ticket");
  console.log("All live smoke tests passed. These results verify the selected public posts, not every platform URL.");
} finally { await rm(directory, { recursive: true, force: true }); }
