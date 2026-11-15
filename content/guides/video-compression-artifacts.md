---
{
  "title": "Recognize video compression artifacts",
  "description": "Compare compression damage with defects already in the source. Includes measured Light and Strong exports and decoded-frame observations.",
  "category": "Local video",
  "created": "2026-11-07",
  "updated": "2026-11-07",
  "published": null,
  "status": "draft",
  "author": "[À COMPLÉTER : auteur]",
  "series": "adsense-2026-11",
  "planId": "G20",
  "planRank": 9,
  "tool": "compress",
  "related": [
    "reduce-video-size",
    "bitrate-vs-resolution"
  ],
  "sources": [
    {
      "title": "VidFetch: local conversion implementation",
      "url": "https://github.com/aouirdani/vidfetch/blob/7a8da1996057a18c63b27bbe1289555b87ec2b99/src/local-tools/engine.worker.mjs",
      "accessed": "2026-11-07"
    },
    {
      "title": "VidFetch: input and output limits",
      "url": "https://github.com/aouirdani/vidfetch/blob/7a8da1996057a18c63b27bbe1289555b87ec2b99/src/local-tools/limits.ts",
      "accessed": "2026-11-07"
    },
    {
      "title": "FFmpeg: ffprobe stream inspection",
      "url": "https://ffmpeg.org/ffprobe.html",
      "accessed": "2026-11-07"
    }
  ],
  "images": [
    {
      "src": "/guides/lab/compression-light.webp",
      "alt": "VidFetch after the Light compression test",
      "width": 848,
      "height": 839
    },
    {
      "src": "/guides/lab/compression-strong.webp",
      "alt": "VidFetch after the Strong compression test",
      "width": 848,
      "height": 839
    }
  ],
  "keyword": {
    "query": "video compression artifacts",
    "volume": 480,
    "difficulty": 9,
    "market": "us",
    "language": "en"
  },
  "wordCount": 787,
  "reviewedBy": null,
  "reviewedAt": null
}
---
Video compression artifacts are visible changes introduced when an encoder represents a picture with less information than the source. Blocks, ringing near edges and disappearing texture can be clues, but blur or noise already present in the original is a different problem. Compare the original and saved copy at the same time and display size before blaming the latest conversion.

## Identify the change, not just an unpleasant picture

A dark scene with sensor noise may look poor before you touch it. A camera that missed focus has no sharp text for a compressor to preserve. A platform may also have supplied a previously compressed copy. None of these conditions can be reversed by choosing a higher output bitrate.

Compression can introduce its own patterns. Large flat-looking patches in motion suggest that fine variation was discarded. Bright or dark outlines near a sharp edge can resemble ringing. Grass, hair or small lettering may lose detail during movement while appearing clearer in a still section. These descriptions are diagnostic clues, not a guarantee that every example has the same cause.

Check both a moving passage and a paused frame. A single screenshot can conceal temporal changes, while a tiny preview can conceal spatial damage. Displaying a small output enlarged to full-screen introduces another variable: scaling. Compare at the destination size as well as a consistent inspection size.

## Our controlled compression pair

On 7 November 2026 we generated a six-second 640 × 360 H.264/AAC pattern clip measuring 4,503,368 bytes. We used the public [local compressor](/compress-video) to export two alternatives from that same original, with the same maximum dimensions.

| Setting | Output bytes | Output dimensions |
| --- | --- | --- |
| Light | 1,540,900 | 640 × 360 |
| Strong | 413,019 | 640 × 360 |

Both outputs were MP4. Their container durations were approximately 6.036 seconds. The Strong file used about 27% of the Light file’s bytes, but this is a size measurement, not a visual-quality score.

![VidFetch after the Light compression test](/guides/lab/compression-light.webp)

![VidFetch after the Strong compression test](/guides/lab/compression-strong.webp)

We also extracted the decoded frame at one second from the original and both outputs for internal inspection. In the Strong version, the fine colored squares and diagonal edge were visibly softer, and small smudges appeared around sharp transitions. The Light copy stayed closer to the original at that inspected point. That observation concerns a synthetic stress pattern; it does not prove an equally visible difference on every scene. The UI screenshots document the controls and result state, rather than serving as comparative output frames. We inspected file structure and sizes with ffprobe; we did not run a blind perceptual quality study. The generated fixture also does not represent every real camera scene. No media upload was observed during these local browser conversions.

## Make a useful comparison on your own footage

Choose three short passages: the most detailed scene, the fastest motion and any text the viewer must read. Note their timestamps in the original. Export one alternative and compare those same passages in the saved file. Keep the display size and playback conditions consistent.

For a presentation, ask whether the smallest essential label is readable without guessing. For a landscape, inspect moving foliage and gradients. For a face, check the eyes and edges during movement. The relevant acceptance condition comes from the footage’s purpose, rather than a generic statement that one preset looks “professional”.

Record what failed. “The last word on the slide is unreadable at 12 seconds” is actionable. “The quality is bad” is not. Return to the original and change one setting so you can tell whether the problem improved.

## Select the least damaging way to meet the budget

A milder preset may preserve more detail while creating a larger file. Reducing dimensions may help a constrained bitrate, but it permanently reduces the available pixels. Shortening unnecessary footage can lower total size without asking the retained action to fit a smaller per-second budget.

These choices are separate. The [general size-reduction guide](/blog/reduce-video-size) explains the broader planning process. For the relationship between pixels and encoded data, use [bitrate versus resolution](/blog/bitrate-vs-resolution).

Avoid repeatedly re-encoding a succession of small copies. Losses can accumulate, and a later large file cannot restore information removed earlier. Keep a clear original and export each candidate from it. If the source is already damaged, find a better authorized source where possible rather than promising restoration.

VidFetch offers the controls visible in its local compressor. It does not expose sharpening, denoising, grain restoration or an artifact-removal model. A successful export means the selected operation completed; it does not establish that every visual detail met your needs. Download, inspect and keep the original whenever the content is important.
