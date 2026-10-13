/** Manual, isolated OVH test entry. Never imported by the production bundle.
 * Metadata is injected for Blender's authorized Big Buck Bunny trailer hosted
 * by W3C (MP4) or Blender (OGV audio source). URL/DNS/media validation and the existing UID nft policy stay active.
 * This validates transport/conversion, not extraction from YouTube.
 */
import { createBackend } from "../server";
import { engineStatus } from "../../src/lib/engine";
import { verifyUidIsolation } from "./isolation";

if (process.env.VIDFETCH_PHASE8_FIXTURE !== "1") throw Error("Manual fixture only");
const profile = "/etc/vidfetch/isolation.json";
verifyUidIsolation(profile);
const audioFixture = process.env.VIDFETCH_PHASE8_AUDIO_FIXTURE === "1";
const source = audioFixture ? "https://download.blender.org/peach/trailer/trailer_400p.ogg" : "https://media.w3.org/2010/05/bunny/trailer.mp4";
const raw = {
  id: "authorized-bbb-trailer", title: "Authorized Big Buck Bunny trailer fixture", duration: 33,
  extractor: "generic", extractor_key: "Generic", webpage_url: source, original_url: source,
  formats: [{ format_id: "18", url: source,
    ext: audioFixture ? "ogv" : "mp4", vcodec: audioFixture ? "theora" : "h264", acodec: audioFixture ? "vorbis" : "aac", protocol: "https", filesize: audioFixture ? 4360399 : 11053871 }],
};
const app = createBackend({ engine: {
  engineStatus: () => ({ ...engineStatus(), isolationProfile: verifyUidIsolation(profile) }),
  dumpJson: async () => ({ raw, ytDlpVersion: "authorized-metadata-fixture-real-download" }),
} });
app.server.listen(18888, "127.0.0.1");
for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => void app.shutdown());
