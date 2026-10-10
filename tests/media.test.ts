import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectPlatform, PLATFORM_META } from "../src/lib/platforms";
import { buildFormatMenu, formatBytes, formatDuration, normaliseFormat } from "../src/lib/media";
import { toMediaInfo } from "../src/lib/extract";
import { buildDownloadPlan, classifyEngineFailure } from "../src/lib/engine";

describe("supported video URLs", () => {
  const accepted = [
    ["https://www.instagram.com/reel/Chunk8-jurw/?igsh=tracking", "instagram"],
    ["https://www.instagram.com/instagram/reels/Chunk8-jurw/", "instagram"],
    ["instagram.com/p/aye83DjauH/", "instagram"],
    ["https://www.instagram.com/share/reel/BAExample/", "instagram"],
    ["https://www.tiktok.com/@pokemonlife22/video/7059698374567611694?is_from_webapp=1", "tiktok"],
    ["https://vm.tiktok.com/ZTR45GpSF/", "tiktok"],
    ["https://vt.tiktok.com/ZSe4FqkKd/", "tiktok"],
    ["https://www.tiktok.com/t/ZTRC5xgJp/", "tiktok"],
    ["Watch this clip! https://vm.tiktok.com/ZTR45GpSF/", "tiktok"],
    ["https://m.tiktok.com/v/7059698374567611694.html", "tiktok"],
    ["https://m.tiktok.com/share/video/7059698374567611694", "tiktok"],
    ["https://youtu.be/aqz-KE-bpKQ", "youtube"],
    ["https://x.com/example/status/1234567890123456789", "twitter"],
  ];
  for (const [url, platform] of accepted) it(`recognizes ${url}`, () => {
    const result = detectPlatform(url);
    assert.equal(result.ok, true); assert.equal(result.platform, platform);
  });
  const rejected = ["", "not a video", "https://example.com/reel/Chunk8-jurw/", "file:///etc/passwd", "https://127.0.0.1/", "https://www.tiktok.com/@example", "https://www.tiktok.com/discover", "https://www.tiktok.com/@example/photo/7059698374567611694", "https://instagram.com/example/", "https://www.instagram.com.evil.test/p/Chunk8-jurw/", "https://www.tiktok.com@evil.test/@example/video/7059698374567611694", "https://www.instagram.com:444/reel/Chunk8-jurw/"];
  for (const url of rejected) it(`rejects ${url || "an empty URL"}`, () => assert.equal(detectPlatform(url).ok, false));
  it("removes Instagram and TikTok tracking parameters", () => {
    assert.equal(new URL(detectPlatform(accepted[0][0]).url).search, "");
    assert.equal(new URL(detectPlatform(accepted[4][0]).url).search, "");
  });
  it("uses real, non-placeholder Instagram and TikTok example IDs", () => {
    for (const id of ["instagram", "tiktok"] as const) {
      assert.equal(detectPlatform(PLATFORM_META[id].examples[0]).platform, id);
      assert.doesNotMatch(PLATFORM_META[id].examples[0], /@user\/|Cabcdefghij|1234567890123456789/);
    }
  });
});

describe("Instagram and TikTok formats", () => {
  it("does not discard Instagram MP4 formats with omitted codecs", () => {
    const f = normaliseFormat({ format_id: "0", ext: "mp4" });
    assert.equal(f?.kind, "video"); assert.equal(f?.hasAudio, true);
  });
  it("keeps silent Instagram videos and does not invent an MP3 track", () => {
    const f = normaliseFormat({ format_id: "0", ext: "mp4", acodec: "none" })!;
    assert.equal(f.kind, "video"); assert.equal(f.hasAudio, false);
    const menu = buildFormatMenu([f], true);
    assert.equal(menu.videoFormats.length, 1); assert.equal(menu.audioFormats.length, 0);
  });
  it("labels portrait resolutions using the shorter side", () => {
    const f = normaliseFormat({ format_id: "tiktok-h264", ext: "mp4", width: 1080, height: 1920, vcodec: "h264", acodec: "aac" });
    assert.equal(f?.label, "1080p"); assert.equal(f?.progressive, true);
  });
  it("offers actual MP3 conversion for a combined TikTok video", () => {
    const f = normaliseFormat({ format_id: "download", ext: "mp4", vcodec: "h264", acodec: "aac" })!;
    assert.equal(buildFormatMenu([f], true).audioFormats[0].id, "mp3");
    assert.equal(buildFormatMenu([f], false).audioFormats.length, 0);
  });
  it("rejects image formats instead of pretending they are videos", () => {
    assert.equal(normaliseFormat({ format_id: "0", ext: "jpg" }), null);
    assert.equal(normaliseFormat({ format_id: "1", ext: "webp" }), null);
  });
  it("does not fabricate formats for photo-only posts", () => {
    assert.throws(() => toMediaInfo({ raw: { id: "photo", title: "Photo" }, platform: "instagram", url: "https://www.instagram.com/p/PhotoID/" }), /no downloadable video/i);
  });
  it("uses English units and familiar duration labels", () => {
    assert.equal(formatBytes(1024), "1.0 KB"); assert.equal(formatBytes(1024 ** 2), "1.0 MB");
    assert.equal(formatDuration(65), "01:05"); assert.equal(formatDuration(3661), "1:01:01");
  });
});

describe("safe, correctly labeled streams", () => {
  it("streams combined TikTok video without unnecessarily adding another audio track", () => {
    const plan = buildDownloadPlan({ formatId: "download", mediaType: "video", preferredExt: "mp4", ffmpeg: true, hasAudio: true });
    assert.equal(plan.merged, false); assert.equal(plan.args[plan.args.indexOf("-f") + 1], "download");
    assert.equal(plan.contentType, "video/mp4");
  });
  it("requests fragmented MP4 rather than mislabeled MPEG-TS for a DASH video", () => {
    const plan = buildDownloadPlan({ formatId: "dash-123v", mediaType: "video", preferredExt: "mp4", ffmpeg: true, hasAudio: false, protocol: "http_dash_segments" });
    assert.ok(plan.args.some((arg) => arg.includes("empty_moov")));
  });
  it("requires a real MP3 conversion rather than renaming a source stream", () => {
    const plan = buildDownloadPlan({ formatId: "mp3", mediaType: "audio", preferredExt: "mp3", ffmpeg: true, hasAudio: true });
    assert.equal(plan.convertToMp3, true); assert.equal(plan.contentType, "audio/mpeg");
    assert.ok(!plan.args.includes("--audio-format"));
  });
  it("uses audio/webm for native WebM audio", () => {
    assert.equal(buildDownloadPlan({ formatId: "251", mediaType: "audio", preferredExt: "webm", ffmpeg: true, hasAudio: true }).contentType, "audio/webm");
  });
  it("reports authentication, unavailable content and rate limits in English", () => {
    assert.equal(classifyEngineFailure(1, "Login required", "instagram").code, "AUTH_REQUIRED");
    assert.equal(classifyEngineFailure(1, "HTTP Error 429 Too Many Requests", "tiktok").status, 429);
    assert.equal(classifyEngineFailure(1, "This is a private account", "instagram").status, 404);
    assert.equal(classifyEngineFailure(1, "Unexpected response from webpage request", "tiktok").code, "UPSTREAM_BLOCKED");
    assert.match(classifyEngineFailure(1, "HTTP Error 404", "instagram").message, /unavailable/);
  });
});
