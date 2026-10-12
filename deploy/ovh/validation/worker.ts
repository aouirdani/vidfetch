/** Test entry only: fixed licensed fixture, separate port; never in a release. */
import { readFileSync } from "node:fs";
import { createBackend } from "../../../backend/server";
import { engineStatus } from "../../../src/lib/engine";
import { verifyUidIsolation } from "../../../backend/ovh/isolation";
const profile = "/etc/vidfetch/isolation.json";
verifyUidIsolation(profile);
const raw = JSON.parse(readFileSync("/opt/vidfetch/validation-3/fixture-metadata.json", "utf8"));
const app = createBackend({ engine: { engineStatus: () => ({ ...engineStatus(), isolationProfile: verifyUidIsolation(profile), fixture: true }), dumpJson: async () => ({ raw, ytDlpVersion: engineStatus().ytDlp }) } });
app.server.listen(18888, "127.0.0.1");
for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => void app.shutdown());
