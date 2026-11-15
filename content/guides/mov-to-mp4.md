---
{
  "title": "Convert MOV to MP4 locally",
  "description": "Convert a compatible MOV in the browser and inspect the real output. Includes measured MP4 results and the conditional WebM fallback.",
  "category": "Local video",
  "created": "2026-11-07",
  "updated": "2026-11-07",
  "published": null,
  "status": "draft",
  "author": "[À COMPLÉTER : auteur]",
  "series": "adsense-2026-11",
  "planId": "G11",
  "planRank": 4,
  "tool": "compress",
  "related": [
    "mov-vs-mp4",
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
      "src": "/guides/lab/mov-to-mp4.webp",
      "alt": "VidFetch’s completed MP4 conversion from the generated MOV fixture",
      "width": 848,
      "height": 839
    }
  ],
  "keyword": {
    "query": "how to convert mov to mp4",
    "volume": 4400,
    "difficulty": 13,
    "market": "us",
    "language": "en"
  },
  "wordCount": 912,
  "reviewedBy": null,
  "reviewedAt": null
}
---
To convert a MOV to MP4 with VidFetch, choose the local compressor and use a source that your browser can decode and encode into H.264/AAC. This makes a new delivery copy; it is not a universal repair or a guarantee that every MOV will become MP4. If the interface indicates WebM instead, the browser has selected a different supported output, and changing its filename will not turn it into MP4.

## Inspect the recording before blaming MOV

MOV is a container. It can hold different video and audio codecs, and two files with the same extension can have very different processing requirements. A camera recording with H.264 and AAC is not equivalent to one with a different codec, profile, bit depth or set of tracks.

Start with a recording you own or are authorised to edit. Open it in a player that you know can handle the source and confirm that its pictures and sound are complete. Keep that original. If it already plays in the required destination, converting it merely because the extension looks unfamiliar may add work and another encoding generation without solving a real problem.

Decide what the receiving application actually needs. A request for MP4 normally still leaves the codecs and practical limits to be checked. The [container comparison](/blog/mov-vs-mp4) discusses choosing a wrapper; this page is the browser conversion procedure.

## Use the compressor as a conditional converter

1. Open the [local video compressor](/compress-video) and select your MOV. Wait for the tool to inspect it. If it refuses the file, do not assume that renaming the source will change codec support.
2. Choose a compression preset and maximum height appropriate to the delivery copy. Balanced is a useful first comparison; the setting is a target for a new encode, not a promise to preserve all source detail.
3. Read the planned output format. Continue for MP4 if that is the format shown and needed. If WebM is proposed, assess whether your destination accepts it or use a different suitable editor for the MP4 requirement.
4. Convert, download to a new filename and inspect the finished file. Verify the codec as well as the extension, then check playback in the actual destination.

The normal MP4 path prefers H.264 video with AAC sound when the necessary encoders exist. The alternative uses WebM with different codecs. VidFetch does not upload an unsupported file to a separate conversion server, and this interface does not provide an HEVC decoder installation or a hidden compatibility switch.

The height choice is also not a crop. It preserves the source proportions while applying the tool’s output bounds. A portrait video stays portrait. If the task requires changing the composition, use an editor that explicitly provides that operation rather than expecting a container conversion to do it.

## A reproducible MOV conversion

Our test on 7 November 2026 began with a generated six-second H.264/AAC recording. We copied its tracks into a MOV fixture, making an input of 4,503,419 bytes at 640 × 360 pixels. This was a controlled file, not a claim that all iPhone or professional-camera MOV recordings use those tracks.

On the public tool, Balanced compression with a 720-pixel maximum height produced an MP4 of 788,324 bytes. The actual picture remained 640 × 360: selecting a higher ceiling did not upscale the source. The downloaded file contained H.264 and AAC, and its container duration was 6.036 seconds.

![VidFetch’s completed MP4 conversion from the generated MOV fixture](/guides/lab/mov-to-mp4.webp)

This run used Chromium 156 on a desktop system. No WebM fallback was shown in this particular run, and no upload or third-party request was observed during conversion. The MP4 was downloaded and inspected with ffprobe. Different browser capabilities or source codecs can change the outcome; the test is evidence for this combination only.

## Why the new file can be much smaller

The source fixture intentionally used a generous video data rate. The conversion assigned a lower target to a new video encoding, so a large reduction was possible. The reduction did not come from the letters MP4 replacing MOV in the filename.

A lean source can behave differently. Re-encoding an already small recording at a larger target can produce a larger file. Audio and container overhead also contribute. Compare the saved output and retain the original if a new copy offers no practical benefit.

Do not call a smaller result lossless merely because the dimensions and duration look similar. Re-encoding can change fine textures, edges and motion. Examine a representative passage, including any small writing. The [codec guide](/blog/h264-h265-av1) explains why compression and compatibility are separate choices.

## Check the delivered MP4

Confirm four things: it is a new file, it contains the expected video and audio tracks, its duration is complete, and the receiving app plays it. A browser preview of the input does not establish all four. Keep a clear filename so that you do not accidentally send the original MOV after checking the MP4.

If there is no audio in the output, first establish whether the original had a usable soundtrack. If timing differs, compare corresponding moments in both files before diagnosing the conversion. Do not keep converting a damaged output in the hope that another pass will restore its source.

For archival footage, retain the camera original and use the MP4 as a purpose-specific delivery copy. The successful result of one browser conversion is a reason to use that copy for its tested destination, not a reason to discard the best source you have.
