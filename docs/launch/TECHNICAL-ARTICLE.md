# How VidFetch converts your own video without uploading it

*Publication draft — technical article for the VidFetch blog*

## Two workflows, two privacy boundaries

VidFetch has a link-based workflow for public TikTok posts and a set of local tools for files on your device. The distinction matters. When you paste a platform link, VidFetch needs to contact its service to inspect the post and prepare an available file. Platform restrictions, service quotas and network availability apply. The service does not promise that every public URL can be processed, does not remove an embedded watermark, and does not support YouTube.

The local tools have a different design. You select a file from your device and ask the browser to extract audio, compress or trim the video, or create a GIF. The media bytes stay in that browser workflow; they are not uploaded to VidFetch for conversion. This article describes that local path only.

## Why run conversion in a browser?

Sending a personal camera recording to a remote conversion service means transferring the whole file and trusting that service with a copy. A local workflow can avoid that upload. It can also work without waiting for a server-side conversion job, though the result depends on the user's CPU, memory, browser codecs and available storage.

“Local” does not mean “unlimited” or “identical on every device.” A five-minute 4K video may decode very differently from a short 1080p clip. Mobile browsers can suspend a tab, impose storage quotas or lack an encoder. VidFetch therefore checks a tool-specific input limit and duration before processing, estimates output size where it can, and stops when the browser cannot safely write the result.

## The conversion pipeline

The page is rendered with its headings and instructions before JavaScript runs. The heavier conversion code is loaded only after a person selects a file. A dedicated worker handles probing and conversion so that progress updates and cancel controls can remain responsive in the page.

For formats the browser supports, the tools use WebCodecs and Mediabunny. Compression prefers H.264 video and AAC audio when the browser reports that both encoders are available. Some browsers do not expose those encoders; in that case the tool can use WebM with VP8/Opus and displays a warning that WebM may not open in iPhone Photos. The output is reduced to the configured resolution ceiling rather than enlarged to invent detail.

MP3 is a special case. Browser support for encoding MP3 is not uniform, so VidFetch includes a LAME encoder compiled to WebAssembly and runs it in a worker. The source video is read as a Blob-backed stream. The worker decodes the audio and encodes the selected bitrate. M4A is offered only as a direct copy when the source audio is AAC; VidFetch does not relabel another codec as M4A.

## Keeping large output out of JavaScript memory

A streaming input avoids reading the entire original file into a JavaScript array, but output can still become a problem if it is assembled in one large in-memory buffer. Where available, VidFetch writes output incrementally to a user-selected file. On browsers with the required private storage APIs, it can instead write to the Origin Private File System (OPFS) and offer a download through a bounded streaming response. Temporary files are removed after download, cancellation or abandonment. A quota check runs before processing, and a predicted output that will not fit is refused with a suggested adjustment such as a shorter trim or stronger compression.

If neither streaming route is available, the memory buffer is only a bounded fallback. The exact limits differ by tool and device profile; the interface shows those values rather than promising that any file will work. Browser storage estimates are estimates, and a device can still run short of space after the check.

## What the tools do — and do not do

- **Extract audio:** MP3 at 128, 192 or 320 kbps; M4A only when an AAC track can be copied directly.
- **Compress:** choose a preset and optional output height. The size shown is an estimate, not a guarantee; content complexity affects the result.
- **Trim:** choose an interval. A fast stream-copy cut can start on a nearby keyframe, so its actual boundaries may differ slightly. Precise mode re-encodes.
- **Make a GIF:** choose an excerpt of up to 15 seconds, width and frame rate. GIF has no audio and can still be large for detailed motion.

Inputs are checked against the supported formats in the tool. A browser that cannot decode an HEVC or unusual MOV file will show an error; local processing cannot manufacture a missing decoder. Output compatibility also varies. Preview and open the saved result in the app you intend to use.

## How to verify the privacy claim

For the local conversion path, open browser developer tools and watch the Network panel after selecting a file. Engine assets may load from VidFetch, but the selected media should not appear as a request body or be posted to an API. The project also runs automated browser checks that intercept outgoing requests during synthetic conversions. Those checks are useful regression tests, not a substitute for reviewing the code or testing every browser extension and device configuration.

The platform-link workflow is different and makes network requests to VidFetch's service. Do not use it for private links or content you do not have permission to save. A public link does not grant copyright permission.

## Browser support is a measured boundary

WebCodecs, OPFS and file-system APIs vary by browser version. Safari may use different codecs from Chromium; iOS can suspend background tabs; device storage can be nearly full. The most reliable product guidance comes from testing camera files on physical devices and reporting the exact browser, OS, input codec, input size, selected option and output.

VidFetch publishes conservative limits and a device test protocol rather than claiming that every phone can process a particular duration or resolution. If conversion is declined before it starts, shorten the clip, reduce the output settings or choose a desktop browser with more available storage.

## Source and licensing

The local tool bundles its conversion engine and notices on the VidFetch domain. The site’s Licenses section links to the relevant licenses and corresponding source material, including the LAME WebAssembly encoder, Mediabunny and the GIF encoder. Check those notices for the exact versions distributed with the current release.

This design keeps personal file conversion in the browser, with visible resource limits and an explicit distinction between local files and platform links. It is a practical boundary, not a promise that a browser can convert every file.
