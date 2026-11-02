// Bundles and runs browser-download.e2e.ts. BROWSERS=chromium,firefox,webkit (default: all three installed engines).
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
await mkdir("backend/artifacts", { recursive: true });
const output = resolve(`backend/artifacts/browser-download-${Date.now()}.cjs`);
await build({ entryPoints: ["backend/gateway/browser-download.e2e.ts"], outfile: output, bundle: true, platform: "node", target: "node22", format: "cjs",
  external: ["esbuild", "playwright"], logLevel: "warning" });
await createRequire(import.meta.url)(output).main();
