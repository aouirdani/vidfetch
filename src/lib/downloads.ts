import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import type { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { downloads } from "@/db/schema";
import { EngineError, buildDownloadPlan, classifyEngineFailure, dumpJson, engineContext, engineStatus, ffmpegBinary, invalidateMetadata, isEngineError, ytDlpBinary } from "./engine";
import { toMediaInfo } from "./extract";
import { buildFilename } from "./media";
import { detectPlatform, type Platform } from "./platforms";

export type DownloadInput = { url: string; format_id: string; type: "video" | "audio" };
type Status = "ready" | "streaming" | "completed" | "failed" | "aborted" | "expired";
export type TransferStatus = { status: Status; bytes: number; error: string | null };
type OpenStream = { first: Buffer; iterator: AsyncIterator<Buffer>; completion: Promise<EngineError | null>; stop: () => void };
type Transfer = {
  token: string; filename: string; contentType: string; platform: Platform;
  stream: OpenStream; status: TransferStatus; id: number | null;
  expires: ReturnType<typeof setTimeout>; release: () => void;
};
type State = { active: number; tickets: Map<string, Transfer>; statuses: Map<string, TransferStatus & { expires: number }> };
const globalState = globalThis as typeof globalThis & { __vidfetchTransfers?: State };
const state = globalState.__vidfetchTransfers ??= { active: 0, tickets: new Map(), statuses: new Map() };

export function parseDownloadInput(value: unknown): DownloadInput {
  if (!value || typeof value !== "object") throw new EngineError("INVALID_URL", "A video URL, format_id and type are required.", 400);
  const data = value as Record<string, unknown>;
  const detection = detectPlatform(typeof data.url === "string" ? data.url : "");
  if (!detection.ok) throw new EngineError("INVALID_URL", "Paste a valid YouTube, TikTok, Instagram or X video link.", 400);
  if (typeof data.format_id !== "string" || !/^[a-zA-Z0-9_.-]{1,180}$/.test(data.format_id)) {
    throw new EngineError("INVALID_URL", "Choose a valid format from the extracted video.", 400);
  }
  if (data.type !== "video" && data.type !== "audio") throw new EngineError("INVALID_URL", "The download type must be video or audio.", 400);
  return { url: detection.url, format_id: data.format_id, type: data.type };
}

function terminate(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null) return;
  try {
    if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
    else child.kill("SIGKILL");
  } catch { child.kill("SIGKILL"); }
}

/** A readable is kept paused after the first chunk. Backpressure bounds memory for any file size. */
async function openStream(input: DownloadInput, raw: Record<string, unknown>, plan: ReturnType<typeof buildDownloadPlan>, platform: Platform): Promise<OpenStream> {
  const context = await engineContext(platform);
  const children: ChildProcess[] = [];
  let output: Readable | undefined;
  const stop = () => { children.forEach(terminate); output?.destroy(); };
  const monitor = (child: ChildProcess, conversion = false): Promise<EngineError | null> => {
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString("utf8")).slice(-12000); });
    return new Promise((resolve) => {
      child.once("error", (error) => resolve(new EngineError("ENGINE_ERROR", "The download engine could not start.", 503, error.message)));
      child.once("close", (code) => resolve(code === 0 ? null : conversion
        ? new EngineError("ENGINE_ERROR", "The source audio could not be converted to MP3. Try an original format instead.", 502, stderr.slice(-1200))
        : classifyEngineFailure(code, stderr, platform)));
    });
  };
  try {
    const source = spawn(ytDlpBinary(), [...context.flags, ...plan.args], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32" });
    children.push(source);
    const completions = [monitor(source)];
    source.stdin.on("error", () => { /* A failed process is reported by monitor(). */ });
    source.stdin.end(JSON.stringify(raw));
    output = source.stdout;
    if (plan.convertToMp3) {
      const converter = spawn(ffmpegBinary(), ["-hide_banner", "-loglevel", "error", "-nostdin", "-i", "pipe:0", "-vn", "-c:a", "libmp3lame", "-b:a", "192k", "-f", "mp3", "pipe:1"], {
        stdio: ["pipe", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32",
      });
      children.push(converter);
      completions.push(monitor(converter, true));
      converter.stdin.on("error", () => terminate(source));
      source.stdout.pipe(converter.stdin);
      output = converter.stdout;
    }
    const completion = Promise.all(completions).then((errors) => errors.find(Boolean) ?? null)
      .finally(() => context.cleanup().catch(() => undefined));
    const iterator = output[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const first = await Promise.race([
        iterator.next(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new EngineError("TIMEOUT", "The source did not start sending the video in time. Please try again.", 504)), 90000); }),
      ]);
      if (first.done || !first.value.length) {
        const failure = await completion;
        throw failure ?? new EngineError("UNAVAILABLE", "The source returned an empty video. Re-extract the link and try again.", 404);
      }
      return { first: first.value, iterator, completion, stop };
    } finally { if (timer) clearTimeout(timer); }
  } catch (error) {
    stop();
    await context.cleanup().catch(() => undefined);
    if (isEngineError(error)) throw error;
    throw new EngineError("ENGINE_ERROR", "The video stream could not be opened. Please try again.", 502, String(error));
  }
}

async function saveStatus(transfer: Transfer): Promise<void> {
  state.statuses.set(transfer.token, { ...transfer.status, expires: Date.now() + 30 * 60 * 1000 });
  if (!transfer.id) return;
  try {
    await db.update(downloads).set({
      status: transfer.status.status, bytesStreamed: transfer.status.bytes, errorMessage: transfer.status.error,
      finishedAt: ["completed", "failed", "aborted", "expired"].includes(transfer.status.status) ? new Date() : null,
    }).where(eq(downloads.id, transfer.id));
  } catch (error) { console.error("[vidfetch] transfer log update failed", error); }
}

function rememberFailure(id: number | null, message: string): void {
  if (id) void db.update(downloads).set({ status: "failed", errorMessage: message, finishedAt: new Date() })
    .where(eq(downloads.id, id)).catch((error) => console.error("[vidfetch] transfer log failed", error));
}

export async function prepareDownload(input: DownloadInput): Promise<{ token: string; filename: string; downloadUrl: string }> {
  const configured = Number(process.env.MAX_PARALLEL_DOWNLOADS ?? 4);
  const limit = Number.isInteger(configured) && configured > 0 ? configured : 4;
  if (state.active >= limit) throw new EngineError("BUSY", "All download slots are busy. Please try again shortly.", 429);
  state.active++;
  let released = false;
  const release = () => { if (!released) { released = true; state.active = Math.max(0, state.active - 1); } };
  let id: number | null = null;
  try {
    const detection = detectPlatform(input.url);
    const platform = detection.platform!;
    const { raw } = await dumpJson(input.url);
    const engine = engineStatus();
    const info = toMediaInfo({ raw, platform, url: input.url, ffmpeg: engine.ffmpeg });
    const pool = input.type === "audio" ? info.audioFormats : info.formats.filter((f) => f.kind === "video");
    const selection = pool.find((f) => f.id === input.format_id);
    if (!selection) throw new EngineError("UNAVAILABLE", "This format is no longer available. Extract the video again and choose another quality.", 404);
    const separateAudio = info.formats.filter((f) => f.kind === "audio")
      .sort((a, b) => Number(b.ext === "m4a") - Number(a.ext === "m4a") || (b.bitrateKbps ?? 0) - (a.bitrateKbps ?? 0))[0];
    const plan = buildDownloadPlan({
      formatId: selection.id, mediaType: input.type, preferredExt: selection.ext, ffmpeg: engine.ffmpeg,
      hasAudio: selection.hasAudio, audioFormatId: separateAudio?.id, protocol: selection.protocol,
    });
    const filename = buildFilename(info.title, plan.ext);
    try {
      const rows = await db.insert(downloads).values({
        platform, platformVideoId: info.platformVideoId, title: info.title, formatId: selection.id,
        mediaType: input.type, qualityLabel: selection.label, container: plan.ext, filename, status: "preparing",
        meta: { merged: plan.merged, converted: plan.convertToMp3, engine: engine.ytDlp },
      }).returning({ id: downloads.id });
      id = rows[0]?.id ?? null;
    } catch (error) { console.error("[vidfetch] transfer log unavailable", error); }
    const stream = await openStream(input, raw, plan, platform);
    const token = randomUUID();
    const transfer: Transfer = {
      token, filename, contentType: plan.contentType, platform, stream, id, release,
      status: { status: "ready", bytes: 0, error: null },
      expires: setTimeout(() => {
        if (!state.tickets.has(token)) return;
        state.tickets.delete(token);
        stream.stop(); release();
        transfer.status = { status: "expired", bytes: 0, error: "The download link expired. Click Download to prepare a new one." };
        void saveStatus(transfer);
      }, 60000),
    };
    transfer.expires.unref();
    state.tickets.set(token, transfer);
    await saveStatus(transfer);
    return { token, filename, downloadUrl: `/api/download?ticket=${token}` };
  } catch (error) {
    release();
    invalidateMetadata(input.url);
    rememberFailure(id, error instanceof Error ? error.message : "Download failed.");
    throw error;
  }
}

export function getTransferStatus(token: string): TransferStatus | null {
  for (const [key, value] of state.statuses) if (value.expires < Date.now()) state.statuses.delete(key);
  while (state.statuses.size > 256) state.statuses.delete(state.statuses.keys().next().value!);
  const value = state.statuses.get(token);
  if (!value) return null;
  return { status: value.status, bytes: value.bytes, error: value.error };
}

export function takeDownload(token: string, signal: AbortSignal): Response {
  const transfer = state.tickets.get(token);
  if (!transfer) throw new EngineError("EXPIRED", "This download link has expired or was already used. Click Download to try again.", 410);
  state.tickets.delete(token);
  clearTimeout(transfer.expires);
  const { stream } = transfer;
  transfer.status.status = "streaming";
  void saveStatus(transfer);
  let finished = false;
  const finish = async (status: Status, message: string | null = null) => {
    if (finished) return;
    finished = true;
    signal.removeEventListener("abort", abort);
    if (status !== "completed") stream.stop();
    transfer.release();
    transfer.status.status = status;
    transfer.status.error = message;
    await saveStatus(transfer);
  };
  const abort = () => { void finish("aborted", "The download was cancelled before it finished."); };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  let sentFirst = false;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (finished) { controller.close(); return; }
        const chunk = sentFirst ? await stream.iterator.next() : { value: stream.first, done: false };
        sentFirst = true;
        if (chunk.done) {
          const error = await stream.completion;
          if (error) throw error;
          await finish("completed");
          controller.close();
          return;
        }
        transfer.status.bytes += chunk.value.length;
        state.statuses.set(token, { ...transfer.status, expires: Date.now() + 30 * 60 * 1000 });
        controller.enqueue(new Uint8Array(chunk.value));
      } catch (error) {
        const message = error instanceof Error ? error.message : "The source interrupted the video stream.";
        await finish("failed", message);
        controller.error(error);
      }
    },
    cancel() { return finish("aborted", "The download was cancelled before it finished."); },
  });
  // The media size is deliberately not advertised: native and converted streams can differ from metadata estimates.
  return new Response(body, { headers: {
    "Content-Type": transfer.contentType,
    "Content-Disposition": `attachment; filename="${transfer.filename}"; filename*=UTF-8''${encodeURIComponent(transfer.filename)}`,
    "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff",
    "X-VidFetch-Platform": transfer.platform, "X-VidFetch-Transfer": token,
  } });
}
