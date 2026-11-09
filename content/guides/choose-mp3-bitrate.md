---
{
  "title": "Choose an MP3 bitrate",
  "description": "Compare 128, 192 and 320 kbps MP3 sizes from one source. Choose a listening copy without claiming to restore missing audio detail.",
  "category": "Audio",
  "created": "2026-11-07",
  "updated": "2026-11-07",
  "published": null,
  "status": "draft",
  "author": "[À COMPLÉTER : auteur]",
  "series": "adsense-2026-11",
  "planId": "G03",
  "planRank": 13,
  "tool": "audio",
  "related": [
    "mp3-vs-m4a",
    "mono-vs-stereo"
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
      "src": "/guides/lab/mp3-128.webp",
      "alt": "The 128 kbps MP3 result",
      "width": 848,
      "height": 839
    },
    {
      "src": "/guides/lab/mp3-192.webp",
      "alt": "The 192 kbps MP3 result",
      "width": 848,
      "height": 839
    },
    {
      "src": "/guides/lab/mp3-320.webp",
      "alt": "The 320 kbps MP3 result",
      "width": 848,
      "height": 839
    }
  ],
  "keyword": {
    "query": "mp3 bitrate",
    "volume": 320,
    "difficulty": 14,
    "market": "us",
    "language": "en"
  },
  "wordCount": 790
}
---
MP3 bitrate is the amount of encoded audio data allocated per second. In VidFetch you can compare 128, 192 and 320 kbps on the same supported source; a larger number creates a larger file but cannot restore information already lost in the original. Choose by listening to the content you need, then checking size and compatibility.

## What the number measures

Bitrate is not volume, channel count or sample rate. A quiet recording exported at 320 kbps can remain quiet. A mono source does not become stereo because its bitrate is higher. Sample rate uses another unit and describes a different property of the audio track.

For a roughly constant bitrate, size is approximately bitrate multiplied by duration and divided by eight. A minute at 128 kilobits per second needs around 960,000 bytes before small format details. At 320 it needs around 2,400,000. These are planning estimates, not exact file sizes promised for every encoder.

Use decimal units consistently when doing the calculation. Some file managers display binary units while labeling them loosely, so compare the actual bytes when a delivery allowance is tight. The whole saved file includes more than an idealized stream budget.

## Three exports from one source

On 7 November 2026 we generated a six-second 640 × 360 H.264/AAC fixture with a known stereo synthetic signal. Its original video file occupied 4,503,368 bytes. We used the public [MP3 extractor](/video-to-mp3) three times from the original.

| Selected bitrate | Downloaded MP3 bytes | Reported duration |
| --- | --- | --- |
| 128 kbps | 96,576 | 6.024979 seconds |
| 192 kbps | 144,768 | 6.024979 seconds |
| 320 kbps | 241,152 | 6.024979 seconds |

All three files contained two-channel MP3 audio at 48 kHz. Inspection used ffprobe, and no media upload was observed during processing.

![The 128 kbps MP3 result](/guides/lab/mp3-128.webp)

![The 192 kbps MP3 result](/guides/lab/mp3-192.webp)

![The 320 kbps MP3 result](/guides/lab/mp3-320.webp)

These measurements demonstrate predictable size differences. They do not demonstrate that listeners preferred one version: the fixture was a controlled signal, not a blind listening trial with speech and music. The larger file should not be advertised as perceptually superior on the basis of its byte count alone.

## Make your own listening decision

Choose a representative passage from a recording you own or may convert. Include the most demanding sound, not only silence or a steady tone. Spoken material might include quiet consonants and overlapping voices; music might include transients, sustained notes and dense passages.

Export alternatives from the same original and compare at similar playback levels. Keep the same headphones or speakers and avoid using a louder volume setting for one version. If possible, hide the filenames while listening so the bigger number does not decide the result in advance.

For a listening note where all three versions are adequate, a smaller copy may be the practical choice. For material you will edit later, preserve the original rather than assuming a high-bitrate MP3 replaces it. MP3 remains a lossy encoding format at these settings.

The [MP3 versus M4A guide](/blog/mp3-vs-m4a) addresses choosing the output codec and container. If you already have AAC and can copy it to M4A, that is a different operation from re-encoding it as MP3. Do not compare the labels as though they were interchangeable quality numbers.

## Diagnose problems that bitrate cannot solve

Clipped sound, room echo, a missing microphone and background traffic are already part of the recorded signal or its absence. Increasing the bitrate does not normalize volume, remove noise or separate a speaker. VidFetch does not expose those editing functions.

If the output is silent, compare the original and confirm that a decodable audio track exists. If only one side is audible, inspect the source channel layout and playback setup. [Mono versus stereo](/blog/mono-vs-stereo) explains why a two-channel label alone does not establish a good spatial recording.

If the browser refuses the source, another bitrate is unlikely to solve a decoding failure. The extension identifies a container, not all the codecs inside it. Read the displayed error, retain the source and use an appropriate local application if the needed codec is unsupported.

## Save a result you can trace

Use filenames that identify the source and bitrate. Check the downloaded file’s duration, beginning and ending before discarding any intermediate experiment. A conversion that produces a valid MP3 can still be the wrong interval or the wrong recording.

When storage or delivery size matters, multiply the actual result by the number of recordings you plan to keep. A small difference for six seconds can become meaningful across hours. When the content matters more than storage, keep the original as well: selecting the largest MP3 option is a delivery decision, not a guarantee of archival preservation.
