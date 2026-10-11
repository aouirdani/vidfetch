import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createBackend } from "../server";
import { engineContext, ytDlpBinary, ffmpegBinary } from "../../src/lib/engine";

test("real yt-dlp video, ffmpeg MP3 and two-input merge on original synthetic media", async () => {
  process.env.YTDLP_PATH = resolve('.media-bin/yt-dlp');
  process.env.FFMPEG_PATH = '/opt/homebrew/bin/ffmpeg';
  const directory = await mkdtemp(resolve(tmpdir(), 'vidfetch-media-'));
  const source = resolve(directory, 'original.mp4');
  const made = spawnSync(ffmpegBinary(), ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=10',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '2', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', source], { encoding: 'utf8' });
  assert.equal(made.status, 0, 'Could not generate original test media');
  const video = resolve(directory, 'video.mp4'), audio = resolve(directory, 'audio.m4a');
  for (const [target, flags] of [[video, ['-an', '-c:v', 'copy']], [audio, ['-vn', '-c:a', 'copy']]] as const) {
    assert.equal(spawnSync(ffmpegBinary(), ['-hide_banner', '-loglevel', 'error', '-i', source, ...flags, target]).status, 0);
  }
  const media = createServer((req, res) => {
    const file = req.url === '/video.mp4' ? video : req.url === '/audio.m4a' ? audio : source;
    const length = spawnSync('stat', ['-f', '%z', file], { encoding: 'utf8' }).stdout.trim();
    res.setHeader('Content-Length', length); createReadStream(file).pipe(res);
  });
  media.listen(0, '127.0.0.1'); await once(media, 'listening');
  const address = media.address(); assert(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  const raw = { id: 'aqz-KE-bpKQ', title: 'Original VidFetch fixture', duration: 2, extractor: 'generic', extractor_key: 'Generic',
    webpage_url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', formats: [
      { format_id: '18', url: `${origin}/original.mp4`, ext: 'mp4', vcodec: 'h264', acodec: 'aac', protocol: 'http' },
      { format_id: 'v', url: `${origin}/video.mp4`, ext: 'mp4', vcodec: 'h264', acodec: 'none', protocol: 'http', height: 90 },
      { format_id: 'a', url: `${origin}/audio.m4a`, ext: 'm4a', vcodec: 'none', acodec: 'aac', protocol: 'http', abr: 64 },
    ] };
  // Only this test factory supplies local metadata; production HTTP has no override.
  const backend = createBackend({ engine: { ytDlpBinary, ffmpegBinary, engineContext,
    dumpJson: async () => ({ raw, ytDlpVersion: 'real' }), assertPublicUrl: async () => {}, validateMediaDestinations: async () => {} } });
  backend.server.listen(0, '127.0.0.1'); await once(backend.server, 'listening');
  const backendAddress = backend.server.address(); assert(backendAddress && typeof backendAddress === 'object');
  const base = `http://127.0.0.1:${backendAddress.port}`;
  const results: Record<string, unknown> = { originalFixture: directory, ytDlp: ytDlpBinary(), tests: {} };
  try {
    for (const [format_id, type, ext] of [['18', 'video', 'mp4'], ['mp3', 'audio', 'mp3'], ['v', 'video', 'mp4']] as const) {
      const response = await fetch(base + '/api/download', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: raw.webpage_url, format_id, type }), signal: AbortSignal.timeout(30000) });
      const ready = await response.json(); assert.equal(response.status, 201, JSON.stringify(ready));
      const download = await fetch(base + ready.downloadUrl, { signal: AbortSignal.timeout(30000) });
      const target = resolve(directory, `${format_id}.${ext}`);
      await pipeline(Readable.fromWeb(download.body! as import('node:stream/web').ReadableStream), createWriteStream(target, { flags: 'wx' }));
      let status;
      for (let i = 0; i < 100; i++) {
        status = await (await fetch(base + `/api/download?status=${ready.token}`)).json();
        if (status.status === 'completed') break; await delay(20);
      }
      assert.equal(status.status, 'completed');
      assert.equal(status.bytes, (await stat(target)).size);
      const probe = spawnSync('/opt/homebrew/bin/ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name:format=duration,size', '-of', 'json', target], { encoding: 'utf8' });
      assert.equal(probe.status, 0); const inspected = JSON.parse(probe.stdout);
      assert(inspected.streams.some((stream: { codec_type: string }) => stream.codec_type === 'audio'));
      if (type === 'video') assert(inspected.streams.some((stream: { codec_type: string }) => stream.codec_type === 'video'));
      assert(Number(inspected.format.duration) >= 1.9);
      if (format_id === '18') assert.equal(createHash('sha256').update(await readFile(target)).digest('hex'), createHash('sha256').update(await readFile(source)).digest('hex'));
      (results.tests as Record<string, unknown>)[format_id] = { http: response.status, bytes: status.bytes, status: status.status, probe: inspected };
    }
  } finally {
    await backend.shutdown(); await new Promise<void>(resolve => media.close(() => resolve()));
    await writeFile('backend/artifacts/real-engines-results.json', JSON.stringify(results, null, 2));
  }
});
