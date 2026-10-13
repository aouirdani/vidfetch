---
{
  "title": "How to convert a video into an audio file",
  "description": "Extract an existing soundtrack or make an MP3 copy of a video you are allowed to use, while preserving the original and checking audio quality.",
  "category": "Audio conversion",
  "created": "2026-10-12",
  "updated": "2026-10-12",
  "published": null,
  "status": "ready",
  "related": [
    "mp3-vs-m4a",
    "backup-your-videos",
    "video-download-fails"
  ],
  "sources": [
    {
      "title": "FFmpeg: streamcopy and transcoding",
      "url": "https://www.ffmpeg.org/ffmpeg.html"
    },
    {
      "title": "FFmpeg: libmp3lame options",
      "url": "https://www.ffmpeg.org/ffmpeg-codecs.html#libmp3lame"
    }
  ]
}
---
A video can contain a separate audio track. Turning it into an audio file means either copying that track into a suitable container or encoding it into another format, such as MP3. Copying can preserve the encoded audio exactly; transcoding can improve compatibility but does not improve the original sound. Start with a video you own or have permission to use.

## Check that there is a soundtrack

Some recordings are silent or contain no audio stream at all. Others contain several tracks, such as different languages or a commentary. Listen to the video and inspect its track list before choosing an output.

A basic conversion is not a vocal-removal or instrument-separation tool. It takes an existing track. If music and speech are already mixed together, they remain mixed in the resulting file.

## Create an MP3 copy locally

An FFmpeg installation with libmp3lame can make a 192 kbps MP3. This command selects the first audio stream and creates a separate output:

```sh
ffmpeg -i own-video.mp4 -map 0:a:0 -vn -c:a libmp3lame -b:a 192k soundtrack.mp3
```

If there is no audio stream, the command should report that rather than inventing sound. Keep the input file. Test the output before deleting or replacing any other file. You may need a different stream selection when the first track is not the language you want.

## Copy compatible AAC without encoding

If inspection confirms that the desired audio track is AAC, copying it into M4A can avoid a lossy re-encode:

```sh
ffmpeg -i own-video.mp4 -map 0:a:0 -vn -c:a copy soundtrack.m4a
```

This command is conditional on compatible input. It is not a universal conversion command for every video codec. If the source audio cannot be stored in that container, choose a suitable output or encode a new track. [MP3 versus M4A](/blog/mp3-vs-m4a) explains the distinction.

## Choose an output for the destination

Use a format your player or editing software accepts. For editing, retaining a good original matters more than adding a high-bitrate label to an already compressed source. Repeated lossy conversions can accumulate changes.

For a spoken lesson, confirm intelligibility and pauses. For a music recording, compare a detailed passage at the same listening volume. Check that the complete ending is present and that the output has the expected duration.

## Using VidFetch instead

For an accessible supported video link, choose Extract, then the Audio tab and an available audio option. The MP3 option encodes the soundtrack at 192 kbps. Original formats depend on the source. A video that requires login or is blocked by its platform cannot be made available by selecting Audio.

The service is intended for single videos, subject to its file, duration and concurrency limits. It does not bypass technical restrictions. If preparation fails, use [the troubleshooting checklist](/blog/video-download-fails) before retrying.

## Common question

### Is converting to MP3 lossless?

No. MP3 is a lossy format. Keep your original recording if you want to retain its available detail for later work.
