---
{
  "title": "Choose a GIF frame rate",
  "description": "Compare GIF frame counts, delays and size at 5 and 15 fps. Understand why a reported rate can differ from the whole animation’s timing.",
  "category": "Local video",
  "created": "2026-11-07",
  "updated": "2026-11-07",
  "published": null,
  "status": "draft",
  "author": "[À COMPLÉTER : auteur]",
  "series": "adsense-2026-11",
  "planId": "G14",
  "planRank": 10,
  "tool": "gif",
  "related": [
    "gif-quality",
    "make-gif-from-video"
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
      "title": "gifenc: frame delay implementation",
      "url": "https://github.com/mattdesl/gifenc",
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
      "src": "/guides/lab/gif-five-fps.webp",
      "alt": "VidFetch after exporting the five-frame-per-second animation",
      "width": 848,
      "height": 839
    },
    {
      "src": "/guides/lab/gif-fifteen-fps.webp",
      "alt": "VidFetch after exporting the fifteen-frame-per-second animation",
      "width": 848,
      "height": 839
    }
  ],
  "keyword": {
    "query": "gif frame rate",
    "volume": 210,
    "difficulty": 0,
    "market": "us",
    "language": "en"
  },
  "wordCount": 717,
  "reviewedBy": null,
  "reviewedAt": null
}
---
GIF frame rate describes how often the image changes, but the saved animation is timed through frame delays. More frames can make motion smoother and increase size; they cannot add detail missing from the source. Choose a rate by watching the actual downloaded loop, especially when a short action or label must remain understandable.

## Count frames and time separately

For a two-second animation, five frames per second suggests about ten frames. Fifteen suggests about thirty. This is useful for planning the amount of image data, but the GIF’s stored delays also matter. GIF timing uses hundredths of a second, so not every requested frame interval can be represented as an identical whole-number delay.

A rate such as 15 fps corresponds to about 6.67 hundredths between frames. A sequence may need a mixture of rounded delays. A metadata tool that reports an average rate from a single rounded interval can therefore look different from frame count divided by total duration.

Do not infer that the animation suddenly contains extra motion just because a probe prints a surprising fraction. Inspect frame count and total time together, then watch the result in the intended viewer. The browser or destination may handle timing differently from a standalone image inspector.

## Same clip, two sampling choices

We generated a six-second 640 × 360 H.264/AAC pattern recording and selected seconds 1–3 in the public [GIF tool](/video-to-gif) on 7 November 2026. Both exports used width 320 and retained a 320 × 180 picture.

| Requested rate | Counted frames | Total duration | File size |
| --- | --- | --- | --- |
| 5 fps | 10 | 2 seconds | 71,056 bytes |
| 15 fps | 30 | 2 seconds | 214,092 bytes |

![VidFetch after exporting the five-frame-per-second animation](/guides/lab/gif-five-fps.webp)

![VidFetch after exporting the fifteen-frame-per-second animation](/guides/lab/gif-fifteen-fps.webp)

The 15 fps result occupied about three times the bytes in this fixture. That is an observed relationship for this content, not a universal GIF size multiplier. Each sampled image has its own color and motion information.

ffprobe reported an average-rate field of 50/3 for the second output. Counting its 30 decoded frames over its two-second duration gives 15 frames per second overall. We retain both observations rather than mislabeling the output as a 16.67 fps conversion. The interface screenshots document the test settings; they are not a playback comparison.

No media upload was observed. The generated fixture and Chromium environment establish this particular operation, not all GIF viewers or physical phones.

## Choose according to the action

A pointer moving slowly between two controls can remain understandable at a low rate. A small ball moving quickly may jump a substantial distance between sampled frames. A higher rate can make that path easier to follow, but only if the source contains the intervening information.

For a screen demonstration, consider whether the goal is to show movement or a sequence of states. A clear two-second sequence may be preferable to a long, smooth loop whose label is too small to read. Pause or hold time in the source is different from increasing sample rate; more samples do not make a brief label remain longer.

If timing is the problem, first choose a more appropriate interval. Then compare two frame rates while keeping width and duration unchanged. Changing all controls together makes it hard to tell which one helped.

## Treat spatial quality as another decision

Frame rate changes temporal sampling. Width changes spatial detail. Palette conversion affects colors. Increasing one does not reliably fix the others. A high-rate GIF can still have unreadable text or stepped gradients.

Use [GIF quality](/blog/gif-quality) for those spatial and color questions. The [complete video-to-GIF procedure](/blog/make-gif-from-video) covers selecting and downloading a local clip.

VidFetch does not interpolate motion, edit per-frame delays or import an existing GIF for retiming. Its frame-rate control applies to conversion from a supported video. If a destination changes the saved animation, keep your exported file and compare it separately to identify which stage introduced the difference.

Open the actual download rather than relying on a static thumbnail. Check the full loop, the transition at its end and any text. A smaller file is useful only if the action remains clear, and a smoother loop is useful only if its size and destination behavior are acceptable.
