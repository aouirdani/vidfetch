---
{
  "title": "Trim a video on iPhone or Android",
  "description": "Trim a local clip on a phone, preserve the original and check the downloaded result. Includes a measured browser test and native alternatives.",
  "category": "Local video",
  "created": "2026-11-07",
  "updated": "2026-11-07",
  "published": null,
  "status": "draft",
  "author": "[À COMPLÉTER : auteur]",
  "series": "adsense-2026-11",
  "planId": "G18",
  "planRank": 1,
  "tool": "trim",
  "related": [
    "video-keyframes",
    "reduce-video-size"
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
      "title": "Apple: trim a video",
      "url": "https://support.apple.com/en-au/104968",
      "accessed": "2026-11-07"
    },
    {
      "title": "Google Gallery: edit videos",
      "url": "https://support.google.com/android/answer/9361143?hl=en-GB",
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
      "src": "/guides/lab/mobile-trim.webp",
      "alt": "VidFetch showing the result of the three-second portrait trim",
      "width": 358,
      "height": 1123
    }
  ],
  "keyword": {
    "query": "how to trim a video on iphone",
    "volume": 9900,
    "difficulty": 5,
    "market": "us",
    "language": "en"
  },
  "wordCount": 909,
  "reviewedBy": null,
  "reviewedAt": null
}
---
To trim a video on an iPhone or Android phone, select the portion you want to keep and save it as a new file. VidFetch’s browser trimmer can do this for a compatible video already on your device; use precise re-encoding when the visible start and end matter more than copying the existing encoded tracks. Keep the original until you have checked the downloaded clip.

## Decide what the new clip should contain

A useful cut starts with an event, not a round number. For a demonstration, include the hand reaching for the object rather than starting after the action has begun. For speech, leave a short pause around the sentence so that the first consonant and the final word survive. Watch beyond your intended endpoint before choosing it: a gesture or a reply may change the meaning of the extract.

Trimming changes the time interval. It does not remove a person from the side of the picture or turn a landscape recording into a vertical one. VidFetch does not offer a crop box. If the framing is the problem, saving a shorter section will keep the same framing within that section.

Write down the desired beginning and end in seconds. A selection from 0.5 to 3.5 seconds contains three seconds of requested footage, not three and a half. This distinction is easy to miss when a control asks for an endpoint rather than a duration.

## Cut a local file in the browser

1. Open the [local video trimmer](/trim-video) and choose an MP4, MOV or WebM from your device. Wait for the tool to read it. An extension alone does not establish whether the browser can decode the tracks inside.
2. Enter Start and End in seconds. Use the preview to check the selected action. The preview is a convenient reference, while the downloaded file is the result you must ultimately validate.
3. Choose Precise re-encoding for a cut that needs a newly encoded boundary. The copy option has a different tradeoff around independently decodable frames; the [keyframe guide](/blog/video-keyframes) develops that distinction.
4. Convert locally, keep the tab open and download the result. Use a different filename from the source. Check the complete clip, including sound and its ending, before sending it elsewhere.

The original is not replaced by this workflow. Resetting the browser tool releases its working state; it does not delete a file you have already downloaded. If your browser opens a save dialog, choose a separate destination rather than treating the conversion as an edit to the source file.

## What the public-site test produced

On 7 November 2026, we generated a portrait H.264/AAC recording with two audio channels, a six-second duration and 360 × 640 pixels. Its size was 4,503,305 bytes. We selected 0.5–3.5 seconds in precise mode on the public VidFetch tool, using Chromium with a 390-pixel mobile viewport and touch emulation.

The downloaded MP4 was 760,535 bytes. Inspection found H.264 video at 360 × 640, AAC audio and a container duration of 3.028 seconds. The small difference from the requested three seconds matters: container and audio timing should not be advertised as exact to the millisecond merely because the controls accept decimals.

![VidFetch showing the result of the three-second portrait trim](/guides/lab/mobile-trim.webp)

That was a real browser operation with a generated file, not a test on a physical iPhone or Android handset. No media upload or third-party request was observed during processing. The downloaded output was inspected with ffprobe; successful processing of this fixture does not establish support for every camera format or phone.

## When the phone’s editor is sufficient

Apple’s Photos instructions describe opening a video, using Edit and the timeline handles, then choosing Done and a save option. Saving as a new clip preserves a separate original. Google’s Gallery documentation also describes a video-length slider and saving a copy. These are native alternatives, not controls inside VidFetch.

The cited instructions were consulted on 7 November 2026. App menus and save wording can change. If you use a native editor, check its actual save choice instead of assuming every app handles the original in the same way. The browser method above is useful when you want the same basic time-selection interface across devices, but it still depends on browser codec support.

## Resolve a refused or unexpected cut

If the file is rejected before controls appear, check the displayed input limits and the codec rather than repeatedly pressing the same button. A short file can still use an unsupported codec. A MOV from one camera can behave differently from another MOV because the container name does not specify the encoded video.

If the wrong section appears, return to the original and recheck the two endpoints. Do not trim the mistaken output repeatedly: that makes the time references harder to follow and can introduce another encoding generation. If sound begins late or ends abruptly, inspect the original at the same point; the source may already contain that timing.

For a smaller sharing copy, decide whether shortening alone is enough before applying compression. The [size-reduction guide](/blog/reduce-video-size) explains the separate choices. A tiny file is not a successful cut if it omits the required action, loses the last word or cannot be opened by its recipient.

Keep a simple check record for important footage: source filename, requested interval, output filename and actual duration. These four details make a later correction much easier than remembering which of several nearly identical clips was the right one.
