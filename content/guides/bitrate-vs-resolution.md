---
{
  "title": "Bitrate vs resolution: what controls video quality and size?",
  "description": "Understand how pixels, data rate, duration and codecs work together, with a simple size calculation and examples for choosing a video.",
  "category": "Video quality",
  "created": "2026-10-12",
  "updated": "2026-10-12",
  "published": null,
  "status": "ready",
  "related": [
    "720p-1080p-4k",
    "reduce-video-size",
    "mp3-vs-m4a"
  ],
  "sources": [
    {
      "title": "YouTube Help: bitrate and upload recommendations",
      "url": "https://support.google.com/youtube/answer/1722171"
    },
    {
      "title": "FFmpeg: bitrate options",
      "url": "https://www.ffmpeg.org/ffmpeg.html"
    }
  ]
}
---
Resolution describes how many pixels a frame contains. Bitrate describes how much data is used per second. Both affect a video, but they are not interchangeable. A high-resolution file with too little data for its scene can look worse than a lower-resolution file with a more suitable encoding. Duration is the other essential number when estimating size.

## Pixels describe the frame

A 1920 × 1080 frame contains more pixels than a 1280 × 720 frame. That offers space for more detail if the capture and encoding preserve it. It does not prove that the video is sharp, in focus or free of compression artifacts.

Frame rate adds another dimension: more frames per second describe motion more frequently. Content also matters. A still presentation slide and a rapidly moving camera do not challenge an encoder in the same way.

## Bitrate describes the data budget

Bitrate is commonly given in kilobits or megabits per second. Bits and bytes are different units: eight bits make one byte. Some formats use variable bitrate, allocating more data to demanding sections and less to simpler ones.

A displayed video bitrate may omit the audio track. A final file also carries container metadata. That is why a rough calculation and the actual size can differ. Treat a size shown before preparation as an estimate unless the source provides an exact complete-file length.

## Calculate a useful estimate

For 60 seconds of video averaging 3 megabits per second, the video data alone is approximately `3,000,000 × 60 ÷ 8 = 22,500,000` bytes. That is 22.5 decimal megabytes, or about 21.5 mebibytes. Audio and container overhead increase the total.

Doubling duration at the same average bitrate roughly doubles size. Doubling resolution does not give such a direct size rule, because the encoder can allocate a different bitrate. See [720p, 1080p and 4K](/blog/720p-1080p-4k) for the pixel dimensions.

## Compare quality fairly

Use the same source scene, playback size and listening volume. Look at fast motion, textures, fine text and dark gradients. Do not compare a clean studio recording with a noisy handheld clip and attribute every difference to bitrate.

Codecs and encoder settings affect how efficiently data is used. Equal bitrates across different codecs do not guarantee equal appearance. A higher-bitrate file made from a poor original cannot restore missing detail.

## Choose the smallest useful copy

Decide whether you need a reference, a presentation copy or an editing source. For delivery, try the smaller available rendition on the destination device. For archival work, preserve the original instead of selecting solely on size.

VidFetch shows source formats and available size information. It does not create arbitrary custom-bitrate video encodes. If you own a file and need to compress a separate delivery copy, use [the reduction workflow](/blog/reduce-video-size).

## Common question

### Does 320 kbps MP3 improve a low-quality recording?

No bitrate label can recover information already missing from the source. Audio has the same basic distinction between data budget and original quality; see [MP3 versus M4A](/blog/mp3-vs-m4a).
