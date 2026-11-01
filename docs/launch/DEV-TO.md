# Dev.to version — How VidFetch converts your own video without uploading it

*Ready-to-edit article adapted from `TECHNICAL-ARTICLE.md`. Verify the release-specific limits and links before publishing.*

VidFetch has two different paths: a service request for a public TikTok link, and browser-local conversion for a video file you select from your own device. The privacy claim in this article applies only to the second path. The platform link is sent to VidFetch for analysis; local media conversion does not upload the selected file.

## Loading the engine only when needed

The page renders useful content first. Conversion code is downloaded after the user selects a file, then runs in a dedicated worker. That keeps the initial page light and lets the interface keep showing progress and cancellation.

Mediabunny and WebCodecs handle supported media formats. If a browser can encode H.264 and AAC, the compression tool prefers MP4. Otherwise it can offer WebM VP8/Opus with a warning about iPhone playback. MP3 encoding uses a bundled LAME WebAssembly worker because native MP3 encoding support varies.

## Streaming input is only half the problem

Reading a Blob incrementally avoids copying the entire input into a JavaScript buffer. But a long output can still exhaust memory if the application collects it all in RAM. VidFetch therefore prefers writing incrementally to a user-selected file or OPFS when those APIs are available. OPFS output is checked against the browser's storage estimate before work starts and is removed after download or abandonment. Memory is a bounded fallback.

Storage estimates can change and browsers differ. A predicted output that will not fit is stopped before conversion and the interface suggests a shorter trim or stronger compression setting. This is more honest than accepting a large file and failing after several minutes.

## Four local operations

Audio extraction exports MP3 at a selected bitrate or copies AAC to M4A when possible. Compression has three presets and an optional output height; its size estimate is not a guarantee. Trimming can use a fast keyframe-aligned copy or precise re-encoding. GIF export limits the clip to 15 seconds and exposes width and frame-rate controls.

The tools do not promise support for every MOV, HEVC or WebM variant. Decoding and encoding capabilities belong to the browser, and mobile operating systems can suspend tabs or limit available storage. The UI enforces device-specific input and duration limits.

## Checking the network boundary

During a local conversion, engine code and worker assets may be fetched, but the selected media should not be sent in a request body or posted to an API. Automated privacy tests intercept network requests while synthetic local files are converted. This is a regression guard; it does not replace code review or physical-device testing.

The local conversion path avoids uploading the source file. It cannot remove browser resource limits or make incompatible codecs play everywhere. The production site links to the exact open-source notices and source material for its bundled components.

Before publishing, replace this note with links to the deployed license page and device test results for the exact VidFetch release. Do not claim that iPhone or Android support is verified until the current builds have been tested on those devices.
