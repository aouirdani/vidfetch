---
{
  "title": "Make a GIF from a local video",
  "description": "Select a short local video interval, width and frame rate. Follow a measured GIF export and verify the animation before sharing.",
  "category": "Local video",
  "created": "2026-11-07",
  "updated": "2026-11-07",
  "published": null,
  "status": "draft",
  "author": "[À COMPLÉTER : auteur]",
  "series": "adsense-2026-11",
  "planId": "G12",
  "planRank": 8,
  "tool": "gif",
  "related": [
    "gif-frame-rate",
    "gif-quality"
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
      "src": "/guides/lab/create-gif.webp",
      "alt": "VidFetch displaying the completed two-second GIF conversion",
      "width": 848,
      "height": 839
    }
  ],
  "keyword": {
    "query": "how to make a gif from a video",
    "volume": 5400,
    "difficulty": 38,
    "market": "us",
    "language": "en"
  },
  "wordCount": 882
}
---
To make a GIF from a video, choose a short local clip, select its start and end, set a modest width and frame rate, then export and inspect the animation. VidFetch performs this in your browser without sending the selected video for conversion. The GIF contains no audio, and a long, high-resolution scene can produce a surprisingly large file.

## Pick an action that works without sound

A useful GIF usually conveys one visible event: a control changing state, an object moving or a brief reaction. Speech that carries all the meaning is a poor candidate because the audio disappears. An important warning visible only as tiny text can also become unreadable after resizing.

Choose your own recording or material you have permission to process. This workflow starts with a file already on your device. It does not fetch from a video URL, access a private account or turn an existing GIF back into a video.

Locate a beginning that establishes the scene and an ending that completes the action. Repetition may make a rough transition more obvious than it was in a single playback. If a smooth loop matters, choose an action that naturally returns to a similar position rather than expecting the converter to invent intermediate movement.

Write down endpoints in seconds. An interval from 1 to 3 seconds is two seconds long. The tool’s inputs are endpoints, so confusing the final timestamp with a duration can unintentionally include too much footage.

## Create the animation

1. Open [video to GIF](/video-to-gif) and select the local video. Wait for the preview and file information.
2. Enter the desired Start and End. Choose a width appropriate to where the animation will appear; do not export a desktop-sized image just to display it as a small chat illustration.
3. Choose the offered frame rate. A small animation of a static interface may work with fewer frames than fast motion.
4. Convert locally, download the GIF and open the actual saved file. Check the action, size, timing and legibility at the intended display size.

Keep the original video separately. The GIF is a derivative with different limitations, not an archival replacement. If you need sound or extensive motion, a short MP4 may be the more useful delivery file.

## The public-site experiment

On 7 November 2026 we used a generated six-second H.264/AAC file at 640 × 360, measuring 4,503,368 bytes. In the public tool we selected seconds 1–3, a width of 320 pixels and 10 frames per second.

The downloaded GIF was 142,604 bytes, 320 × 180 pixels and two seconds long. The output’s height followed the source ratio; it did not become a square because the width was 320. Inspection identified a GIF rather than a video container, and no audio track was present.

![VidFetch displaying the completed two-second GIF conversion](/guides/lab/create-gif.webp)

No media upload was observed during processing. The test used a generated moving pattern in Chromium, so its file size is an example rather than a prediction for a photographic scene or every mobile browser. The screenshot shows the VidFetch interface used for the conversion; it is not a still that proves the animation’s entire visual quality.

The original contained six seconds and the GIF contained two. Their size difference therefore combines a shorter interval, fewer pixels, different frame sampling and a different encoding format. Calling it a like-for-like compression ratio would hide those changes.

## Balance the controls separately

Duration decides how much action is included. Width decides how much spatial detail remains. Frame rate decides how often the motion is sampled. Changing all three at once can make a file smaller, but it also makes it difficult to know why an important detail disappeared.

Start with the necessary action length. Then reduce width only until labels and shapes remain useful at the destination. Finally compare frame rates on the saved animation. The [GIF timing guide](/blog/gif-frame-rate) explains frame counts and rounded delays; [GIF quality](/blog/gif-quality) covers the separate issue of palette and fine detail.

A higher frame rate is not a cure for poor source focus. A wider image is not a cure for a color palette that cannot preserve every subtle shade. VidFetch does not expose a palette editor, dithering selector or a tool to restore detail already missing from the recording.

## Check the downloaded file where it will be used

Open the GIF in a viewer that actually animates it. A file manager thumbnail may show only one frame; that does not establish that export failed. Also test the destination that will display the animation, because some services make their own conversions or previews.

Look at the beginning and end, not only the middle. Confirm that the action is complete, the repetition is acceptable and any text stays visible long enough to read. If it is too large, return to the original video and change one control rather than trying to import and recompress the GIF in this tool.

The available controls and limits are those displayed by VidFetch. A browser may refuse an unsupported source or run out of resources on a demanding job. Try a short compatible example to separate a file-specific issue from a general browser problem. Keep the tab open until the result is saved and verify the downloaded filename and extension before sharing it.
