---
{
  "title": "Compress a video for Discord",
  "description": "Prepare an attachment with the current Discord account limit in mind. Estimate a budget, compress locally and inspect the saved copy.",
  "category": "Local video",
  "created": "2026-11-07",
  "updated": "2026-11-07",
  "published": null,
  "status": "draft",
  "author": "[À COMPLÉTER : auteur]",
  "series": "adsense-2026-11",
  "planId": "G07",
  "planRank": 5,
  "tool": "compress",
  "related": [
    "bitrate-vs-resolution"
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
      "title": "Discord: File Attachments FAQ",
      "url": "https://support.discord.com/hc/en-us/articles/25444343291031-File-Attachments-FAQ",
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
      "src": "/guides/lab/discord-copy.webp",
      "alt": "The local compression result used for the Discord delivery example",
      "width": 848,
      "height": 839
    }
  ],
  "keyword": {
    "query": "compress video for discord",
    "volume": 1600,
    "difficulty": 10,
    "market": "us",
    "language": "en"
  },
  "wordCount": 899,
  "reviewedBy": null,
  "reviewedAt": null
}
---
To compress a video for Discord, first check the attachment limit that applies to your account, then create and inspect a smaller copy before uploading it. VidFetch can compress a compatible local recording in your browser, but it cannot send the attachment or guarantee that Discord will accept a particular result. Keep some space below the stated limit rather than aiming at the last byte.

## Use the limit you actually have

Discord’s File Attachments FAQ, consulted on 7 November 2026, lists 20 MB for free accounts, 50 MB for Nitro Basic and 1 GB for Nitro. The same documentation notes experiments with different limits. Your current account and the upload interface therefore matter more than an old tutorial quoting 8 or 10 MB. Limits and app menus can change.

Do not buy a subscription or keep re-encoding solely because a historical limit appears in a search result. Check the present product message first. Also distinguish an attachment rejection from a playback problem: a file may fit the size allowance while using a codec that the receiving device cannot play.

A working delivery target includes three things: maximum file size, footage that must remain, and a picture size that is still useful. For a demonstration of a small interface control, legible text may matter more than smooth background motion. For a sports clip, the important detail may move throughout the frame. These are different compression jobs even when their original files have the same size.

## Choose a budget before encoding

Average total bitrate multiplied by duration gives an approximate file size. For an 18 MB target and a two-minute clip, the budget is roughly 1.2 megabits per second before accounting for overhead. Audio uses part of it. This is a planning calculation, not a promised output from a quality preset.

Use the [bitrate and resolution explanation](/blog/bitrate-vs-resolution) if the units are unfamiliar. MB and megabits are different units; eight bits make one byte. A bitrate entered in the wrong unit can lead to a file many times larger than intended.

VidFetch exposes presets and maximum dimensions, not a guaranteed “Discord size” switch. A selected quality setting must still be followed by checking the downloaded file. A moving, detailed recording can be harder to compress than a static talking slide. An already efficient source may become larger after another encode.

## Make one sharing copy

1. Open the [local video compressor](/compress-video), select the original and wait for its information to load.
2. Start with a setting that preserves the important material. If the duration includes an irrelevant lead-in, create a shorter source separately rather than destroying text legibility to preserve empty footage.
3. Select a maximum size suited to the intended display. A smaller frame can reduce the burden on the encoder, but check labels and faces in the saved result.
4. Convert, download and inspect the new file’s size, duration, sound and picture. Only then attempt the attachment in Discord.

The local compressor does not upload the selected media for processing. The webpage itself still loads through the network. Keep the tab active until the download is available, especially on a memory-constrained device, and leave the original intact.

## A measured public-site example

We generated a six-second H.264/AAC video at 640 × 360 with deliberately high source bitrate. It occupied 4,503,368 bytes. On 7 November 2026, the public VidFetch compressor’s Strong setting with a 360-pixel maximum produced a 413,019-byte MP4. The output retained 640 × 360 pixels and had a container duration of 6.036 seconds.

![The local compression result used for the Discord delivery example](/guides/lab/discord-copy.webp)

This example was already below the documented free-account limit before conversion. It demonstrates the reduction and output inspection workflow; it is not proof that a long clip will fit, nor a test of uploading to a Discord account. We inspected the downloaded tracks with ffprobe and observed no media upload during the browser operation.

The unusually large reduction partly reflects the intentionally high-bitrate fixture. Do not apply that percentage to your own recording as a forecast. The only size that settles whether your particular result fits is the size of the actual saved file.

## If it is still too large

Try a shorter extract when the whole recording is not needed. Next consider a smaller frame while checking the exact part a recipient needs to see. A stronger preset is another tradeoff, but compare it with the previous saved copy rather than assuming smaller always means acceptable.

Reopen the original for each alternative. Recompressing the compressed result accumulates losses and makes it harder to distinguish the effects of each choice. Keep filenames that identify the setting, such as “demo-strong-360”, rather than a series of “final” files.

For a long recording that must retain fine detail, a permission-controlled sharing link may be more appropriate than forcing an attachment into a small budget. Check who can access it and test the recipient’s path. VidFetch does not host the output or create that link.

If Discord rejects a file that appears to fit, read the current rejection message. Verify the current account limit, whether the complete message has other attachments and whether the file is actually finished downloading. If upload succeeds but playback fails, check the exported container and codec; changing the filename extension does not convert either. Retain the original and the successful sharing copy until the recipient confirms that both picture and audio work.
