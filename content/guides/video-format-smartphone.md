---
{
  "title": "Choosing a video format for your smartphone",
  "description": "Pick a playable video for a phone by checking container, codecs, resolution and available storage instead of relying on a filename alone.",
  "category": "Playback",
  "created": "2026-10-12",
  "updated": "2026-10-29",
  "published": "2026-10-29",
  "status": "ready",
  "related": [
    "mp4-vs-webm",
    "h264-h265-av1",
    "720p-1080p-4k"
  ],
  "sources": [
    {
      "title": "Android: supported media formats",
      "url": "https://developer.android.com/media/platform/supported-formats"
    },
    {
      "title": "Apple AVFoundation: audiovisual media",
      "url": "https://developer.apple.com/av-foundation/"
    }
  ]
}
---
For a video you want to watch on a phone, start with a format the device and playback application support. MP4 with common H.264 video and AAC audio is often a useful compatibility baseline. The exact codec profile, resolution and operating-system version still matter. Test one file before downloading many large videos.

## Check more than the extension

MP4 names a container, not one fixed video encoding. A downloaded MP4 may contain H.264, HEVC or another track. Both video and audio must be supported for a complete playback experience.

A file that plays in a browser might be handled differently by the phone's gallery or another application. If sound works but the picture does not, or the reverse, inspect the individual tracks. Our [container guide](/blog/mp4-vs-webm) explains what is inside the wrapper.

## Match the resolution to your use

For a reference clip on a small screen, an available 720p or 1080p version may be enough. For detailed text, cropping or later editing, a larger source may be useful. Choose according to what you intend to do, rather than selecting the largest label every time.

Higher resolution and frame rate can demand more decoding work. Efficient hardware support varies by device and codec. An old phone may struggle with a file that a recent one plays smoothly. [The resolution guide](/blog/720p-1080p-4k) separates pixel dimensions from other quality factors.

## Plan storage and transfer size

A format list may show an estimated size rather than an exact one. Variable bitrate, separately delivered tracks and the final container can change that estimate. Leave spare storage instead of filling the phone to its last megabyte.

A interrupted download is not a complete playable file. Use a stable connection for a larger transfer, keep the browser open until it finishes and verify the downloaded copy. Avoid repeatedly requesting the same large file after a connection failure.

## Find the saved file

Mobile browsers commonly put downloads in a downloads area or the operating system's file manager. Saving a file does not necessarily add it to the photo library. The exact location and import behavior depend on the browser and operating system.

If the file is complete but cannot play, try inspecting its codec information before converting it. Keep the original and make a separate compatibility copy if you need one. Changing `.webm` to `.mp4` in the filename does not perform that conversion.

## Using VidFetch on mobile

Paste an authorized video link, choose Extract and select an available format. The form also accepts supported shared links. Platform restrictions, rate limits and a busy service can prevent preparation, independently of your phone.

The listed formats reflect the source, not a promise of every resolution or codec. Consult [H.264, H.265 and AV1](/blog/h264-h265-av1) if several encodings are offered and compatibility is unclear.

## Common question

### Why is the saved video missing from Photos?

It may be in the browser's download location instead. Locate the completed file first, then use the device's supported import or share action if you want it in a media library.
