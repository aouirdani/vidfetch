---
{
  "title": "Compress a video on your phone",
  "description": "Create a smaller local sharing copy on your phone. See measured dimensions, output size and the limits of mobile browser testing.",
  "category": "Local video",
  "created": "2026-11-07",
  "updated": "2026-11-07",
  "published": null,
  "status": "draft",
  "author": "[À COMPLÉTER : auteur]",
  "series": "adsense-2026-11",
  "planId": "G10",
  "planRank": 2,
  "tool": "compress",
  "related": [
    "trim-video-phone",
    "720p-1080p-4k"
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
      "title": "Apple: reduce video size",
      "url": "https://support.apple.com/en-us/127765",
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
      "src": "/guides/lab/mobile-compress.webp",
      "alt": "VidFetch’s result after compressing a portrait test video",
      "width": 358,
      "height": 1123
    }
  ],
  "keyword": {
    "query": "how to compress a video from iphone",
    "volume": 5400,
    "difficulty": 0,
    "market": "us",
    "language": "en"
  },
  "wordCount": 913
}
---
To compress a video on a phone, make a smaller delivery copy by lowering its data budget and, when useful, its pixel dimensions. VidFetch can perform that conversion locally in a compatible mobile browser without uploading the recording. Choose the result for its destination, and retain the camera original.

## Begin with the file you actually need to send

A phone recording can be large because it is long, highly detailed, encoded at a generous bitrate or stored in a format intended for editing. Those are different causes. Before changing anything, note the current size and duration, and decide whether the recipient needs the complete recording or only a short explanation.

For a quick view of an object, a smaller frame can be adequate. For a recording of a whiteboard or a screen full of small text, reducing the dimensions may destroy the useful information. Do not judge either case from the size estimate alone. The test is whether the intended detail remains readable in the downloaded copy.

If the beginning and end are unnecessary, trim them first rather than spending the entire file budget on footage nobody needs. The [phone trimming procedure](/blog/trim-video-phone) covers that separate operation. Compression does not know which part of a recording matters to you.

## A browser workflow for iPhone and Android

Open the [local video compressor](/compress-video) and choose a saved video. The file picker belongs to the phone and browser; VidFetch cannot search your photo library or delete items from it. Wait until the file has been read and the compression controls are available.

Start with Balanced when you need a comparison copy. Use Strong if the first result is still too large, accepting that lower video bitrate may discard more visible detail. The presets are targets, not a guarantee of a particular size or perceptual quality. Light, Balanced and Strong currently target 2,000,000, 1,000,000 and 500,000 video bits per second, respectively; audio is handled separately.

Choose a maximum height appropriate to the content. This is a ceiling in the stored video’s geometry, not a command to crop to a social-media canvas. A portrait recording can become narrower as its height is reduced. The tool does not enlarge a small source simply because a larger setting is selected.

Read the proposed output format before converting. MP4 is preferred when the needed encoders are available. If the interface indicates a WebM fallback, check the destination’s actual support rather than renaming the extension to MP4. Renaming does not change the video or audio codec.

## Measured portrait example

Our public-site run on 7 November 2026 used a generated 360 × 640 H.264/AAC video, six seconds long and 4,503,305 bytes. With Strong compression and a maximum height of 480, the downloaded file contained a 270 × 480 H.264 picture and AAC sound.

| Property | Source | Downloaded copy |
| --- | --- | --- |
| File size | 4,503,305 bytes | 411,447 bytes |
| Dimensions | 360 × 640 | 270 × 480 |
| Container duration | 6.000 seconds | 6.036 seconds |
| Format | MP4, H.264/AAC | MP4, H.264/AAC |

![VidFetch’s result after compressing a portrait test video](/guides/lab/mobile-compress.webp)

This was Chromium mobile emulation at 390 pixels with touch enabled, not a physical-phone certification. The file was really converted on vidfetch.app and downloaded; inspection confirmed its tracks. No media upload or third-party request was observed during the operation. A synthetic pattern is also easier to reproduce than an uncontrolled camera scene, so these byte counts should not be projected onto your next recording.

## Avoid the two common false conclusions

First, a lower maximum height is not the same thing as a smaller file. The encoder’s target bitrate, audio, duration and overhead also matter. An already economical source can become larger after re-encoding at a more generous target. Compare actual saved sizes after each trial, not only the numbers offered before processing.

Second, a successful download does not prove that the chosen copy is good enough. View small text, motion and a darker part of the scene. Listen to the beginning, middle and end. A smaller picture that hides the subject is not an improvement, even if it travels faster.

Use the same representative interval when comparing settings. If one copy contains less motion than another, you may be comparing two different encoding jobs rather than the effect of the preset. Keep the source constant and change one setting at a time.

## Native editing is another option

Apple documents an iMovie workflow that exports a video at lower resolution. Its current instructions use the share/export options and allow choosing a destination for the new copy. That is an alternative in Apple’s app, not a VidFetch feature; the documentation was checked on 7 November 2026 and its menus may change.

The browser route is useful when you do not want to send a file to a conversion service. It does not remove the need for storage on the phone. There can be a temporary processing output as well as the downloaded copy. Leave the tab open until processing and saving finish, and make sure the file exists where you intended to save it.

If memory, storage or codec checks refuse the recording, shorten the source or use another compatible browser or editor. There is no hidden server fallback that uploads a refused file. For a problem tied specifically to dimensions, use the [resolution reference](/blog/720p-1080p-4k) rather than choosing the strongest compression setting without a reason.
