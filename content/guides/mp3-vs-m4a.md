---
{
  "title": "MP3 vs M4A: choosing an audio format",
  "description": "Learn what MP3 and M4A actually contain, when conversion makes sense, and how to balance playback compatibility with audio size.",
  "category": "Audio formats",
  "created": "2026-10-12",
  "updated": "2026-10-12",
  "published": "2026-10-29",
  "status": "ready",
  "related": [
    "video-to-audio",
    "bitrate-vs-resolution",
    "backup-your-videos"
  ],
  "sources": [
    {
      "title": "MDN: audio codecs",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs"
    },
    {
      "title": "Apple: ALAC reference implementation",
      "url": "https://github.com/macosforge/alac"
    }
  ]
}
---
Choose MP3 when broad playback compatibility is your main requirement. Keep an existing M4A if it already plays where you need it: converting it to MP3 does not improve its original sound. M4A is a container label, while MP3 usually identifies MPEG audio compression. An M4A can contain lossy AAC or lossless ALAC, so the filename alone is not enough to judge quality.

## Compare the actual audio

An audio codec determines how sound is stored. Lossy encoding discards information to reduce size. Lossless encoding preserves the decoded signal, but cannot restore information that an earlier lossy version already removed.

A lossless ALAC file made from a lossy recording does not recover the recording's missing detail. Similarly, converting AAC to a higher-bitrate MP3 makes a new encoding; it does not turn the source into a higher-quality master. Keep the best available original when planning [a backup](/blog/backup-your-videos).

## Understand bitrate and size

Bitrate describes data per second. For a constant 192 kilobits per second, three minutes of audio represent approximately 4.32 megabytes of audio data: `192,000 × 180 ÷ 8`. Tags and container overhead add a little more. Variable bitrate and different durations change the result.

That calculation estimates size, not perceived sound quality. Different codecs do not give identical results at the same bitrate. Listening conditions matter too: a spoken memo and a complex music recording place different demands on an encoder. Our [bitrate guide](/blog/bitrate-vs-resolution) explains the units.

## When to keep M4A

If your player supports the file and you do not need another format, keeping M4A avoids an unnecessary conversion. Check whether it contains AAC or ALAC before deciding how to edit or archive it. A media inspection tool can identify the track without modifying the file.

For an audio track already stored as compatible AAC, copying it to an M4A container may be possible without re-encoding. This is different from converting arbitrary video audio into AAC. The destination container must support the codec being copied.

## When MP3 is useful

MP3 can be useful for a playback device or workflow that explicitly requires it. Convert a copy, preserve the original and test the beginning, middle and end. Do not repeatedly convert the same file between lossy formats.

VidFetch can encode an accessible video's soundtrack as MP3 at 192 kbps. It does not offer a lossless reconstruction or promise that MP3 will sound better than the source. An original audio option may also be available, depending on the formats returned by the platform.

## Common questions

### Does a larger M4A always sound better?

No. Size depends on duration, bitrate, codec and whether the audio is lossless. Inspect the track and compare the same passage at the same listening volume.

### Can I extract sound without downloading the pictures?

You can choose an audio option when it exists. Read [the video-to-audio guide](/blog/video-to-audio) for the difference between copying a track and encoding an MP3.
