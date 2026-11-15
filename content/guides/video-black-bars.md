---
{
  "title": "Diagnose black bars in a video",
  "description": "Distinguish encoded padding from a player’s empty space. Inspect a measured local export without promising automatic crop or bar removal.",
  "category": "Local video",
  "created": "2026-11-07",
  "updated": "2026-11-07",
  "published": null,
  "status": "draft",
  "author": "[À COMPLÉTER : auteur]",
  "series": "adsense-2026-11",
  "planId": "G29",
  "planRank": 15,
  "tool": "compress",
  "related": [
    "720p-1080p-4k",
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
      "src": "/guides/lab/bars-remain.webp",
      "alt": "VidFetch after compressing the fixture with encoded black padding",
      "width": 848,
      "height": 839
    }
  ],
  "keyword": {
    "query": "video black bars",
    "volume": 1600,
    "difficulty": 0,
    "market": "us",
    "language": "en"
  },
  "wordCount": 773,
  "reviewedBy": null,
  "reviewedAt": null
}
---
Black bars can be pixels already encoded into a video or empty space added by a player when the picture and display have different shapes. Check which kind you have before converting. VidFetch can compress or trim a compatible local file, but it has no crop control and does not promise to remove either kind of bar.

## Find where the bars enter the picture

Play the file in two differently shaped windows. If the bars change as the window changes while the visible picture remains intact, the player may be fitting the video into unused display space. Those areas need not be part of the stored frames.

If the black regions remain attached to the picture in the same proportions, they may be encoded pixels. An exported frame can help distinguish this, provided the frame tool saves the decoded image rather than a screenshot of the player window. A screenshot that includes the player’s background can otherwise repeat the same ambiguity.

Read the file’s stored dimensions too. A 640 × 360 frame can contain a smaller active image surrounded by black pixels. Its nominal 16:9 frame does not tell you the size or shape of the active picture inside it.

This distinction matters because resizing the whole frame scales encoded bars along with everything else. It does not discover which pixels you intended to keep. A container conversion also does not inherently remove them.

## Our fixture kept its bars

We generated a six-second H.264/AAC video with black padding inside a 640 × 360 encoded frame. The source occupied 1,049,532 bytes. On 7 November 2026 we selected it in the public [local compressor](/compress-video) and exported a compatible MP4.

The saved copy occupied 849,560 bytes and still measured 640 × 360. The operation contained no crop instruction. The encoded padding was retained with the frame rather than being advertised as automatically removed.

![VidFetch after compressing the fixture with encoded black padding](/guides/lab/bars-remain.webp)

We inspected the streams and dimensions with ffprobe. The screenshot documents the interface and source preview; it should not be read as a before-and-after crop comparison. No media upload was observed during the browser operation. The generated fixture is a controlled demonstration, not a test of every playback application.

A smaller file did not mean a different composition. This is a useful negative result: compression completed, but it did not perform a function the interface does not offer.

## Decide whether changing anything is necessary

Bars added by a player can be the correct way to preserve the whole picture. Filling every pixel of a differently shaped screen would require cropping part of the picture, stretching it or adding some other background. Each changes how the image is presented.

Stretching can make circles oval and people unnaturally wide. Cropping can cut off captions, hands or important context. Before using a separate editor, decide what must remain visible and whether the destination can simply show the original ratio.

If bars are encoded and you want a different frame, use an editor that genuinely provides spatial crop or canvas controls. Save a separate copy and inspect text and composition. VidFetch does not offer those controls, and trimming the time interval will keep the same frame geometry.

The [resolution guide](/blog/720p-1080p-4k) explains pixel dimensions. The [bitrate and resolution guide](/blog/bitrate-vs-resolution) explains why changing the encoded data budget is another decision again. Neither a higher resolution label nor a higher bitrate identifies and removes unwanted borders.

## Check orientation separately

A portrait recording can have portrait dimensions, or it can rely on orientation information interpreted by a player. If two applications show different orientations or borders, compare their handling before deciding the underlying picture needs destructive changes.

Do not rotate, stretch and re-encode multiple times while guessing. Keep the original, note the stored dimensions and test one intentional change in a suitable editor. A video that looks correct in one preview still needs a check in the receiving application.

## A small diagnostic record prevents repeat work

Write down the source dimensions, whether bars change with the player window and whether a decoded frame contains them. Add the destination’s display shape and what content must remain. These observations are enough to choose the next useful action without pretending every bar is a conversion failure.

If the source is already a small picture inside a large padded frame, removing the padding elsewhere will not create new detail in that picture. If the bars are only the player background, there may be no unwanted pixels in the video to remove. Preserve the original and choose the framing deliberately rather than treating a successful compression download as evidence of a crop.
