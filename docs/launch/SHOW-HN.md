# Show HN draft — VidFetch

**Title**

Show HN: VidFetch — local video conversion in the browser, plus a TikTok link tool

**Post**

I built VidFetch to handle two jobs without pretending they are the same thing.

For a public TikTok post, the link tool asks the service to inspect an available rendition and prepare MP4 or MP3. It is subject to source restrictions, short-lived download links, quotas and server capacity. It does not remove an embedded watermark. YouTube stays unavailable; Instagram and X are not claimed as verified services.

For a file already on your device, the local tools can extract MP3/M4A, compress, trim or create a GIF. The UI loads the conversion engine only after you choose a file. Processing uses browser workers, WebCodecs where available, a bundled LAME WebAssembly MP3 encoder, and OPFS/file streaming for output when supported. The selected source file is not sent to VidFetch during conversion. This is a privacy property of that workflow, not the platform-link workflow.

The project is Next.js App Router with static/SSR content, eight locales and an OVH deployment behind Caddy and Cloudflare. Browser codec support and storage quotas vary, so the interface applies file/time limits and can decline a job before processing. The local tools are open in the UI; their licenses and corresponding-source notices are linked from the site.

I’d appreciate code and UX feedback, especially on whether the output estimates and mobile limits are clear. Please report device/browser details for compatibility problems.

**Submission note**: verify the deployed engine/version first. Do not submit this draft if the production release does not match these claims.
