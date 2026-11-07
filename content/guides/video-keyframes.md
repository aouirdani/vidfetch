---
{
  "title": "Video keyframes and precise cuts",
  "description": "Understand decoding points, copy-mode cuts and re-encoding. Compare two real exports without claiming millisecond-perfect boundaries.",
  "category": "Local video",
  "created": "2026-11-07",
  "updated": "2026-11-07",
  "published": null,
  "status": "draft",
  "author": "[À COMPLÉTER : auteur]",
  "series": "adsense-2026-11",
  "planId": "G19",
  "planRank": 7,
  "tool": "trim",
  "related": [
    "trim-video-phone",
    "h264-h265-av1"
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
      "src": "/guides/lab/keyframe-copy.webp",
      "alt": "The copy-mode trim result for the 0.3–2.7 second test",
      "width": 848,
      "height": 839
    },
    {
      "src": "/guides/lab/keyframe-precise.webp",
      "alt": "The precise trim result for the same requested interval",
      "width": 848,
      "height": 839
    }
  ],
  "keyword": {
    "query": "what is a keyframe",
    "volume": 1300,
    "difficulty": 9,
    "market": "us",
    "language": "en"
  },
  "wordCount": 910
}
---
A video keyframe provides a decoding point that does not need the same earlier picture history as dependent frames. That is why a fast copy-mode cut and a newly encoded cut can behave differently around your selected start. Use precise re-encoding when the boundary matters, and inspect the saved result rather than assuming a decimal input guarantees an exact frame.

## Why encoded frames are not independent photographs

Many video encoders store a complete picture periodically and describe other pictures through changes or predictions. A player needs the relevant reference information to reconstruct dependent pictures. The visible frames may be displayed in an order different from the encoded packets, so a file’s internal timing can be more complicated than a row of individual images.

A keyframe in this context concerns video compression. It is different from an animation editor’s keyframe that sets an object’s position or opacity. VidFetch’s trim controls do not offer animated effects or a visual keyframe editor.

Copying encoded packets avoids a full decode-and-encode cycle and preserves their existing compression. It cannot freely create a new independent picture at an arbitrary point. A muxer may use timestamps, edit lists or earlier decoding material to present a requested interval. The visible start depends on the file and on how the player handles that structure.

A precise trim instead decodes the material and encodes a new result. This takes more work and introduces another encoding generation, but it permits a fresh boundary. Neither method removes the need to watch the downloaded clip.

## Compare the same requested interval

Our controlled test on the public [video trimmer](/trim-video) used a six-second H.264/AAC file at 640 × 360, occupying 4,503,368 bytes. We selected 0.3–2.7 seconds, an intended interval of 2.4 seconds, on 7 November 2026.

| Mode | Downloaded size | Reported container duration |
| --- | --- | --- |
| Copy | 1,962,265 bytes | 2.433333 seconds |
| Precise re-encoding | 614,500 bytes | 2.430688 seconds |

Both outputs were MP4 with H.264 video. The sizes differ because one keeps encoded source material while the other creates a new video stream. A smaller re-encoded result is not evidence that it retained more detail.

![The copy-mode trim result for the 0.3–2.7 second test](/guides/lab/keyframe-copy.webp)

![The precise trim result for the same requested interval](/guides/lab/keyframe-precise.webp)

We inspected the downloaded streams with ffprobe. The slightly different durations do not, on their own, establish the exact first source frame presented by either file. They also do not prove a particular keyframe spacing. Those conclusions require inspecting frame timestamps and decoded content, not subtracting a duration from the source length.

This distinction prevents a common false demonstration: a result being 0.03 seconds longer does not mean its visible start is exactly 0.03 seconds earlier. Audio padding, container timing and frame intervals can all affect the reported duration.

## Choose the mode according to the job

Copy mode is worth trying when you want to avoid another lossy video generation and the boundaries are flexible. A rough extract that leaves a little context around the event may be a better candidate than a tight dialogue edit. Watch it in the player the recipient will use; a successful preview in one player is not a guarantee of identical handling everywhere.

Precise mode is the more appropriate starting point for a cut intended to begin with a specific action or omit adjacent material. Keep a margin when a word or gesture must remain complete. Even with re-encoding, the result lives on video frames and audio samples; it is not an arbitrary continuum of millisecond boundaries.

Do not confuse this choice with spatial cropping. Both of our outputs retained 640 × 360. A fresh boundary changes the selected time, not the sides of the image. VidFetch does not expose a crop control or promise to remove black bars.

## Validate without an elaborate measurement setup

Start by watching the source several seconds around the proposed cut. Write down an unmistakable event near the start and another near the end. Then inspect the downloaded output from its beginning, with sound enabled. Confirm that it contains the intended event, no unintended private material and a complete ending.

If a boundary is unacceptable, return to the original and adjust the requested interval or use precise mode. Repeatedly cutting an already cut copy makes the source time harder to track. Keep a note of the source filename, mode and two requested endpoints.

For a spoken excerpt, listen for consonants, breaths and overlap with the preceding sentence. For a visual demonstration, look for a cursor already mid-movement or a hand already covering the control. These observable checks are more useful than a filename that merely says “exact”.

## Where this explanation stops

Our fixture establishes that the two modes produced different encodings and sizes for the same selection. It is not a benchmark across codecs, cameras, phones or browsers. The experiment used Chromium on the public site and generated material; no selected media was uploaded during processing.

For the complete mobile workflow, use [trim a video on a phone](/blog/trim-video-phone). For the separate choice between video codecs, see [H.264, H.265 and AV1](/blog/h264-h265-av1). Codec efficiency and boundary handling are related to encoded video, but choosing a codec does not replace checking the actual cut.

If an editor or player labels something a keyframe, first identify whether it means a compression access point or an animation control. That single clarification often resolves advice that otherwise sounds contradictory.
