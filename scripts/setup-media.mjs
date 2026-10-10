import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";

// The standalone builds include curl_cffi, required by current Instagram/TikTok extractors.
const configured = process.env.YTDLP_PATH;
const directory = join(process.cwd(), ".media-bin");
const destination = join(directory, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
const usable = (path) => Boolean(path && existsSync(path) && spawnSync(path, ["--version"], { timeout: 10000, encoding: "utf8" }).status === 0);

if (usable(configured) || usable(destination)) {
  console.log("[vidfetch] Download engine ready.");
} else {
  const filename = process.platform === "linux"
    ? process.arch === "arm64" ? "yt-dlp_linux_aarch64" : process.arch === "x64" ? "yt-dlp_linux" : null
    : process.platform === "darwin" ? "yt-dlp_macos" : process.platform === "win32" ? "yt-dlp.exe" : null;
  if (!filename) throw new Error("Set YTDLP_PATH to an installed yt-dlp binary on this architecture.");
  await mkdir(directory, { recursive: true });
  const temporary = `${destination}.${process.pid}.part`;
  try {
    console.log("[vidfetch] Installing the official yt-dlp standalone build with browser-request support…");
    const response = await fetch(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${filename}`, { signal: AbortSignal.timeout(120000) });
    if (!response.ok || !response.body) throw new Error(`yt-dlp download failed (${response.status}).`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
    const checksumResponse = await fetch("https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS", { signal: AbortSignal.timeout(30000) });
    if (!checksumResponse.ok) throw new Error("Unable to verify the yt-dlp release checksum.");
    const checksums = await checksumResponse.text();
    const expected = checksums.split(/\r?\n/).map((line) => line.trim().split(/\s+/)).find((parts) => parts[1]?.replace(/^\*/, "") === filename)?.[0];
    const actual = createHash("sha256").update(await readFile(temporary)).digest("hex");
    if (!expected || actual !== expected) throw new Error("The yt-dlp binary failed its SHA-256 integrity check.");
    await chmod(temporary, 0o755);
    await rename(temporary, destination);
    if (!usable(destination)) throw new Error("The downloaded yt-dlp binary cannot run on this server.");
    await writeFile(join(directory, "release.json"), JSON.stringify({ source: response.url, sha256: actual }, null, 2));
    console.log("[vidfetch] yt-dlp installed and verified.");
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
