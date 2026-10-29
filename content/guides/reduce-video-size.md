---
{
  "title": "How to reduce video size without unnecessary quality loss",
  "description": "Make smaller copies of your own videos by choosing sensible resolution, bitrate and encoder settings, then checking the result before replacing anything.",
  "category": "Video quality",
  "created": "2026-10-12",
  "updated": "2026-10-29",
  "published": "2026-10-29",
  "status": "ready",
  "related": [
    "bitrate-vs-resolution",
    "720p-1080p-4k",
    "backup-your-videos"
  ],
  "sources": [
    {
      "title": "FFmpeg: encoding and stream selection",
      "url": "https://www.ffmpeg.org/ffmpeg.html"
    },
    {
      "title": "FFmpeg: video filters",
      "url": "https://www.ffmpeg.org/ffmpeg-filters.html"
    }
  ],
  "seoTitle": "Reduce video size without needless quality loss"
}
---
To make a video smaller, reduce the amount of data it carries. Shortening a clip, choosing a lower bitrate or reducing resolution can help, but each choice serves a different purpose. Work on a copy and check a representative scene before converting a whole collection. There is no setting that guarantees the same quality at a much smaller size for every source.

## Start with the intended use

A clip for a messaging conversation does not need the same delivery settings as footage you plan to edit. Decide where the copy will be watched, how long it must be, and whether it must meet a file-size limit. Preserve the original for editing or backup.

Removing an unneeded introduction is sometimes more useful than aggressively compressing every frame. If the video already fits its purpose, another lossy conversion may save little while introducing visible artifacts.

## Match resolution to the job

Reducing a 4K source to 1080p reduces the number of pixels the encoder has to describe. Fine detail is lost, but that tradeoff may be reasonable for a small screen. Enlarging a 720p source to 1080p does not recreate detail that was never captured.

Frame rate is a separate decision. Reducing it changes motion, especially for sports or fast camera movement. Test motion before accepting a smaller copy. See [the resolution guide](/blog/720p-1080p-4k) for the dimensions behind the labels.

## Try a quality-based encode on your own file

With an FFmpeg build that includes the named encoders, this creates a new MP4 copy. It selects the first video and, if present, first audio track. It does not overwrite the original:

```sh
ffmpeg -i original.mp4 -map 0:v:0 -map '0:a:0?' -c:v libx264 -crf 23 -preset medium -c:a aac -b:a 128k -movflags +faststart smaller-copy.mp4
```

CRF is a quality-oriented control for this encoder. A higher value generally trades more detail for fewer bytes; a lower value generally does the reverse. `23` is a starting experiment, not a promised quality level or output size. The preset changes the encoder's speed and compression tradeoff. Audio is encoded here too.

## Check before committing to the result

- Play a busy scene and a dark scene, not just a still opening frame.
- Check speech, music and lip synchronization.
- Compare the files on the device that will receive the copy.
- Confirm the duration and audio tracks are what you expected.
- Keep the original until the new copy and your backup are verified.

If you need an exact size ceiling, [bitrate calculations](/blog/bitrate-vs-resolution) can help you plan a budget. Container overhead and variable bitrate mean a rough estimate is not a guarantee.

## What VidFetch can do

VidFetch lists available source formats and can convert a soundtrack to MP3. It is not an upload-based video compressor and does not provide a custom CRF slider. Choosing a smaller available rendition can reduce the download size without a separate local encode.

## Common question

### Should I keep only the compressed copy?

For footage you own and may reuse, retain the original and a tested backup. A delivery copy is optimized for a particular purpose, not for every future edit.
