---
{
  "title": "Download your TikTok account data",
  "description": "Request a copy of your TikTok account data in the app. Separate the account export from saved videos and understand what VidFetch can access.",
  "category": "TikTok",
  "created": "2026-11-14",
  "updated": "2026-11-14",
  "published": null,
  "status": "draft",
  "reviewedBy": null,
  "reviewedAt": null,
  "series": "adsense-2026-11",
  "planId": "G27",
  "planRank": 30,
  "slug": "download-tiktok-account-data",
  "related": [
    "backup-your-videos",
    "save-tiktok-phone-gallery"
  ],
  "sources": [
    {
      "title": "TikTok: Requesting your data (official rendered help page)",
      "url": "https://www.tiktok.com/support/faq_detail?id=7543597460594285112&category=web_account",
      "accessed": "2026-11-14"
    },
    {
      "title": "VidFetch: public-link access boundaries",
      "url": "https://github.com/aouirdani/vidfetch/blob/8fec2b980a6ce43df8e36ae8dc9be4fd31e44e03/backend/server.ts",
      "accessed": "2026-11-14"
    }
  ]
}
---
Request your TikTok account data through TikTok’s own account settings. VidFetch cannot request this export, sign in to your account or retrieve private account records. An account-data request and saving an authorised public video are separate operations.

## Request the export in TikTok

TikTok’s current official instructions describe this route. Labels can vary with the app language; the English labels below are translations of the official help page checked on 14 November 2026.

1. Open TikTok and go to your profile.
2. Open the menu, then Settings and privacy.
3. Open Account, then Download your data.
4. Choose which information to include and a file format from the available choices.
5. Submit the request and return to the download-data tab to check its status.

TikTok says preparation can take a few days and that the available file must be collected within four days. It also notes that some categories may omit the most recent 24–48 hours and that information affecting other people’s privacy may be excluded. Those are platform conditions, not a delivery promise from VidFetch.

## Account records and video copies serve different purposes

Start by deciding which copy you need. VidFetch’s server workflow accepts a public TikTok video URL and a requested media format. It does not accept an account archive as a source, discover every post associated with a username or enumerate a private library. Do not paste your password, login token or export contents into the link field.

If your goal is a playable copy of an authorised public post, use the separate [TikTok video downloader](/tiktok-video-downloader). A successful download there is a media operation; it is not evidence that an account export was requested or that an account has been backed up.

If a video is already on your phone, locate that actual media file before trying another request. The [phone gallery guide](/blog/save-tiktok-phone-gallery) describes that different task. An account-data export should not be treated as a guarantee that a missing original recording or draft will be restored.

## Keep the requested export separate

VidFetch has no account-import screen and no account-data viewer. Its local tools process selected audio or video files in the browser; they are not an archive-import service. There is no reason to send your personal account-data file to VidFetch as part of this procedure.

Keep the export separate from clips you intend to share. For an existing media collection, follow the [video backup checklist](/blog/backup-your-videos) and verify the actual files you retained. Neither an account request nor a single downloaded MP4 proves that every item you wanted has been preserved.

## Verification scope before publication

The official documentation was read in a public browser on 14 November 2026. No export was requested or downloaded from the publisher’s account during this work. The human review must still record the actual app version, language, menu labels, selected categories and format, request and receipt dates, and the observed contents. No complete-account export, processing-time measurement or physical-phone test is claimed here.
