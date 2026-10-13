---
{
  "title": "How to back up your own videos and verify the copies",
  "description": "Keep original recordings, organize independent copies and test restoration so a backup means more than a folder you have never checked.",
  "category": "Personal archives",
  "created": "2026-10-12",
  "updated": "2026-10-12",
  "published": null,
  "status": "ready",
  "related": [
    "mp4-vs-webm",
    "reduce-video-size",
    "video-to-audio"
  ],
  "sources": [
    {
      "title": "Library of Congress: personal digital archiving",
      "url": "https://www.digitalpreservation.gov/personalarchiving/"
    },
    {
      "title": "GNU Coreutils: checksum utilities",
      "url": "https://www.gnu.org/software/coreutils/manual/html_node/cksum-common-options.html"
    }
  ]
}
---
A useful video backup preserves your original files and gives you a working copy when the primary storage fails. Start with material you own or are authorized to retain. Keep more than one independent copy, record where it is stored and test that you can restore and play it. A synchronized folder alone is not proof of a recoverable archive.

## Keep the original recording

Retain the original camera or export file when possible. A smaller delivery copy can be convenient, but it may discard detail or metadata you want later. Repeatedly converting between lossy formats is not an archival strategy.

Store edited versions alongside originals with clear names. For example, separate `2026-10-family-trip-original` from `2026-10-family-trip-sharing-copy`. Include a short note describing the event, permissions and any editing steps rather than relying on memory.

## Make independent copies

Copies on the same physical drive share the risk of that drive failing. Consider an independent storage location and, when appropriate, a copy kept away from the primary location. Choose arrangements you can actually maintain.

Synchronization can propagate accidental deletion or unwanted changes. Check whether the storage method provides version history or another recovery mechanism, and test it. No particular storage brand is required for the principle to work.

## Verify that the bytes match

A checksum can help detect whether a file's bytes have changed. On Linux, a SHA-256 check can be created and verified with:

```sh
sha256sum own-video.mp4 > own-video.mp4.sha256
sha256sum -c own-video.mp4.sha256
```

Run verification from the directory containing the file, or adjust the recorded path. macOS commonly provides `shasum -a 256` for calculating SHA-256. A checksum match demonstrates byte agreement with the recorded reference; it does not establish ownership, authenticity or whether the original was already damaged.

## Test an actual restoration

Copy a sample back from the backup destination into a separate folder. Verify its checksum, play its beginning and ending, and confirm its expected duration and sound. Test more than one file type if your archive contains different camera formats.

Repeat a sample restoration after changing drives, software or your folder organization. Keep recovery instructions with the archive. The test is useful because it exercises the process you would need during a real failure.

## Separate downloads from backups

An authorized download can be one way to retrieve your own published material, but a platform's compressed rendition may differ from your original recording. Keep original masters when you have them. A temporary VidFetch link is not a permanent archive location.

After an allowed transfer, confirm it completed before adding the file to a backup. [Container formats](/blog/mp4-vs-webm) and [smaller delivery copies](/blog/reduce-video-size) serve different purposes from preserving the original.

## Common question

### Should I convert everything to one format?

Keep originals first. A separate compatibility copy can help future playback, but replacing every original with a lossy conversion discards information and creates another dependency on that conversion.
