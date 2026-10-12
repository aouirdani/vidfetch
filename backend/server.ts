import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { finished } from "node:stream/promises";
import type { Readable } from "node:stream";
import { detectPlatform } from "../src/lib/platforms";
import {
  EngineError, engineStatus, ytDlpBinary, ffmpegBinary, engineContext, dumpJson,
  buildDownloadPlan, classifyEngineFailure, isEngineError,
} from "../src/lib/engine";
import { startEngineProcess } from "../src/lib/engine-process";
import { toMediaInfo } from "../src/lib/extract";
import { buildFilename } from "../src/lib/media";
import { cancellable } from "./async";
import { assertPublicUrl, validateMediaDestinations } from "./network";

const MAX_BODY = 8192;
const defaults = {
  ticketMs: 60000, statusMs: 30 * 60 * 1000, firstMs: 90000, metadataMs: 75000,
  operationMs: 10 * 60 * 1000, idleMs: 30000, bodyMs: 10000,
  maxBytes: 256 * 1024 * 1024, maxDuration: 30 * 60, maxMetadataBytes: 2 * 1024 * 1024,
};
const engineDefaults = { engineStatus, ytDlpBinary, ffmpegBinary, engineContext, dumpJson, assertPublicUrl, validateMediaDestinations };
type State = "ready" | "streaming" | "completed" | "failed" | "aborted" | "expired";
type TransferStatus = { status: State; bytes: number; error: string | null; updated: number };
type Process = ReturnType<typeof startEngineProcess>;
type Work = {
  token: string; controller: AbortController; processes: Process[];
  cleanup?: () => Promise<void>; output?: Readable; timer: NodeJS.Timeout;
  dispose: () => Promise<void>;
};
type Ticket = {
  work: Work; filename: string; contentType: string; platform: string;
  iterator: AsyncIterator<Buffer>; first: Buffer; deadline: number; timer: NodeJS.Timeout;
};

function json(res: ServerResponse, status: number, body: unknown) {
  if (res.destroyed || res.writableEnded) return;
  if (res.headersSent) { res.destroy(); return; }
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", ...(status === 429 ? { "Retry-After": "30" } : {}),
  });
  res.end(JSON.stringify(body));
}
function fail(res: ServerResponse, error: unknown) {
  if (isEngineError(error)) { json(res, error.status, { ok: false, code: error.code, error: error.message }); return; }
  // Never print raw upstream errors: URLs, cookie paths and proxy credentials can appear there.
  console.error("[vidfetch] request failed: ENGINE_ERROR");
  json(res, 500, { ok: false, code: "ENGINE_ERROR", error: "The request could not be completed." });
}
function validateUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 4096) throw new EngineError("INVALID_URL", "A valid video URL is required", 400);
  const detected = detectPlatform(value);
  if (!detected.ok || !detected.platform) throw new EngineError("INVALID_URL", "Paste a valid YouTube, TikTok, Instagram or X video link.", 400);
  return detected;
}
function readJson(req: IncomingMessage, timeoutMs: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0, done = false;
    const chunks: Buffer[] = [];
    const finish = (error?: Error, value?: Record<string, unknown>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      req.removeListener("data", data); req.removeListener("end", end);
      req.removeListener("aborted", abort); req.removeListener("error", abort);
      req.resume();
      if (error) reject(error); else resolve(value!);
    };
    const data = (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) finish(new EngineError("INVALID_URL", "Request body too large", 413));
      else chunks.push(chunk);
    };
    const end = () => {
      let value: unknown;
      try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { return finish(new EngineError("INVALID_URL", "Invalid JSON body", 400)); }
      if (!value || typeof value !== "object" || Array.isArray(value)) return finish(new EngineError("INVALID_URL", "A JSON object is required", 400));
      finish(undefined, value as Record<string, unknown>);
    };
    const abort = () => finish(new EngineError("TIMEOUT", "Client disconnected.", 504));
    const timer = setTimeout(() => finish(new EngineError("TIMEOUT", "Request body took too long.", 504)), timeoutMs);
    req.on("data", data); req.once("end", end); req.once("aborted", abort); req.once("error", abort);
    if (Number(req.headers["content-length"] ?? 0) > MAX_BODY) finish(new EngineError("INVALID_URL", "Request body too large", 413));
  });
}
function disposition(filename: string) {
  const safe = filename.replace(/[\r\n"\\]/g, "_");
  return `attachment; filename="${safe.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

/** Dependencies and short limits are injectable for tests; HTTP cannot change them. */
export function createBackend(options: {
  limits?: Partial<typeof defaults>; engine?: Partial<typeof engineDefaults>;
} = {}) {
  const limits = { ...defaults, ...options.limits };
  const engine = { ...engineDefaults, ...options.engine };
  const active = new Set<Work>();
  const tickets = new Map<string, Ticket>();
  const statuses = new Map<string, TransferStatus>();
  const setStatus = (token: string, status: State, bytes = 0, error: string | null = null) => {
    prune();
    statuses.set(token, { status, bytes, error, updated: Date.now() });
  };
  const prune = () => {
    for (const [token, status] of statuses) if (Date.now() - status.updated >= limits.statusMs) statuses.delete(token);
  };
  const acquire = (needsStatus = false): Work => {
    prune();
    if (active.size >= 1) throw new EngineError("BUSY", "The server is busy. Try again shortly.", 429);
    if (needsStatus && statuses.size >= 256) throw new EngineError("BUSY", "The server's transfer history is full. Try again shortly.", 429);
    const controller = new AbortController();
    let disposal: Promise<void> | undefined;
    const work: Work = {
      token: randomUUID(), controller, processes: [],
      timer: setTimeout(() => controller.abort(new EngineError("TIMEOUT", "Maximum operation duration exceeded.", 504)), limits.operationMs),
      dispose: () => disposal ??= (async () => {
        clearTimeout(work.timer);
        work.output?.destroy();
        work.processes.forEach((process) => process.stop());
        await Promise.all(work.processes.map((process) => process.completion));
        try { await work.cleanup?.(); }
        catch { console.error("[vidfetch] session cleanup failed: ENGINE_ERROR"); }
        finally { active.delete(work); }
      })(),
    };
    work.timer.unref();
    active.add(work); // Reserve before any extraction or other asynchronous work.
    return work;
  };
  const onDisconnect = (res: ServerResponse, work: Work) => {
    const abort = () => { if (!res.writableFinished) work.controller.abort(new EngineError("TIMEOUT", "Client disconnected.", 504)); };
    res.once("close", abort);
    return () => res.removeListener("close", abort);
  };
  const mediaInfo = async (url: string, work: Work) => {
    const detected = validateUrl(url);
    await engine.assertPublicUrl(detected.url, work.controller.signal);
    const dump = await engine.dumpJson(detected.url, limits.metadataMs, {
      signal: work.controller.signal, cache: false, maxMetadataBytes: limits.maxMetadataBytes,
    });
    work.controller.signal.throwIfAborted();
    const health = engine.engineStatus();
    return { info: toMediaInfo({ raw: dump.raw, platform: detected.platform!, url: detected.url, ffmpeg: health.ffmpeg }),
      health, platform: detected.platform!, raw: dump.raw };
  };
  const expire = (token: string) => {
    const ticket = tickets.get(token);
    if (!ticket) return; // A reused or unknown token must never overwrite another status.
    tickets.delete(token); clearTimeout(ticket.timer);
    setStatus(token, "expired", 0, "Download ticket expired.");
    ticket.work.controller.abort(new EngineError("EXPIRED", "Download ticket expired.", 404));
    void ticket.work.dispose();
  };
  const prepare = async (body: Record<string, unknown>, res: ServerResponse) => {
    const url = validateUrl(body.url).url;
    const formatId = body.format_id ?? body.formatId;
    const type = body.type;
    if (typeof formatId !== "string" || !/^[a-zA-Z0-9_.-]{1,180}$/.test(formatId)) throw new EngineError("ENGINE_ERROR", "Invalid format selection.", 400);
    if (type !== "video" && type !== "audio") throw new EngineError("ENGINE_ERROR", "Type must be video or audio.", 400);
    const work = acquire(true);
    const detach = onDisconnect(res, work);
    let published = false;
    try {
      const { info, health, platform, raw } = await mediaInfo(url, work);
      if (raw.is_live === true || raw.live_status === "is_live" || raw.live_status === "is_upcoming") throw new EngineError("UNAVAILABLE", "Live streams are not supported.", 400);
      if (info.duration !== null && info.duration > limits.maxDuration) throw new EngineError("ENGINE_ERROR", "Video duration exceeds the server limit.", 413);
      const choices = type === "audio" ? info.audioFormats : info.formats.filter((format) => format.kind === "video");
      const selected = choices.find((format) => format.id === formatId);
      if (!selected) throw new EngineError("ENGINE_ERROR", "Selected format is no longer available. Fetch the video information again.", 400);
      const audio = !selected.hasAudio ? info.audioFormats.find((format) => format.id !== "mp3") : undefined;
      if (audio && !/^[a-zA-Z0-9_.-]{1,180}$/.test(audio.id)) throw new EngineError("ENGINE_ERROR", "The source returned an invalid audio format.", 502);
      if ((selected.filesize ?? 0) + (audio?.filesize ?? 0) > limits.maxBytes) throw new EngineError("ENGINE_ERROR", "Download exceeds the server size limit.", 413);
      const plan = buildDownloadPlan({ formatId: selected.id, mediaType: type, preferredExt: selected.ext,
        ffmpeg: health.ffmpeg, hasAudio: selected.hasAudio, audioFormatId: audio?.id, protocol: selected.protocol });
      // yt-dlp only sees the explicitly selected formats, including a source for MP3.
      const allowed = selected.id === "mp3" ? info.formats.filter((format) => format.hasAudio).map((format) => format.id) : [selected.id, audio?.id];
      const selectedRaw = { ...raw, formats: Array.isArray(raw.formats) ? raw.formats.filter((format) => format && typeof format === "object" && allowed.includes((format as Record<string, unknown>).format_id as string)) : undefined };
      await engine.validateMediaDestinations(selectedRaw, work.controller.signal);
      const context = await engine.engineContext(platform);
      work.cleanup = context.cleanup;
      work.controller.signal.throwIfAborted();
      const spawn = (binary: string, args: string[], conversion = false) => {
        const process = startEngineProcess(binary, args, { signal: work.controller.signal, onFailure: (result) => {
          work.controller.abort(result.error || conversion
            ? new EngineError("ENGINE_ERROR", conversion ? "Audio conversion failed." : "The download engine could not start.", result.error ? 503 : 502)
            : classifyEngineFailure(result.code, result.stderr, platform));
        } });
        work.processes.push(process);
        return process.child;
      };
      const child = spawn(engine.ytDlpBinary(), [...context.flags, ...plan.args,
        "--max-filesize", String(limits.maxBytes), "--limit-rate", "2M", "--concurrent-fragments", "1",
        "--abort-on-unavailable-fragments", "--downloader-args", "ffmpeg_i:-protocol_whitelist http,https,tcp,tls,crypto"]);
      work.output = child.stdout;
      if (plan.convertToMp3) {
        const converter = spawn(engine.ffmpegBinary(), ["-hide_banner", "-loglevel", "error", "-nostdin", "-abort_on", "empty_output", "-threads", "1",
          "-protocol_whitelist", "pipe", "-i", "pipe:0", "-vn", "-c:a", "libmp3lame", "-b:a", "192k", "-f", "mp3", "pipe:1"], true);
        child.stdout.pipe(converter.stdin);
        work.output = converter.stdout;
      }
      child.stdin.end(JSON.stringify(selectedRaw));
      const iterator = work.output[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
      const firstTimer = setTimeout(() => work.controller.abort(new EngineError("TIMEOUT", "The source took too long to start the download.", 504)), limits.firstMs);
      let first: IteratorResult<Buffer>;
      try { first = await cancellable(iterator.next(), work.controller.signal); }
      finally { clearTimeout(firstTimer); }
      if (first.done || !first.value?.length) {
        await cancellable(Promise.all(work.processes.map((process) => process.completion)), work.controller.signal);
        throw new EngineError("ENGINE_ERROR", "The source returned no downloadable data.", 502);
      }
      const ticket: Ticket = { work, filename: buildFilename(info.title, plan.ext), contentType: plan.contentType, platform,
        iterator, first: first.value, deadline: Date.now() + limits.ticketMs,
        timer: setTimeout(() => expire(work.token), limits.ticketMs) };
      ticket.timer.unref();
      // A process can fail while its ticket is waiting for the client.
      work.controller.signal.addEventListener("abort", () => {
        if (!tickets.has(work.token)) return;
        tickets.delete(work.token); clearTimeout(ticket.timer);
        const reason = work.controller.signal.reason;
        setStatus(work.token, "failed", 0, isEngineError(reason) ? reason.message : "Download failed.");
        void work.dispose();
      }, { once: true });
      work.controller.signal.throwIfAborted();
      tickets.set(work.token, ticket); setStatus(work.token, "ready");
      published = true;
      json(res, 201, { ok: true, token: work.token, filename: ticket.filename, downloadUrl: `/api/download?ticket=${work.token}` });
    } finally {
      detach();
      if (!published) await work.dispose();
    }
  };
  const stream = async (ticket: Ticket, res: ServerResponse) => {
    const { work, iterator } = ticket;
    const detach = onDisconnect(res, work);
    let bytes = 0, idleTimer: NodeJS.Timeout | undefined;
    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => work.controller.abort(new EngineError("TIMEOUT", "The transfer stalled.", 504)), limits.idleMs);
    };
    const write = async (chunk: Buffer) => {
      work.controller.signal.throwIfAborted();
      if (bytes + chunk.length > limits.maxBytes) throw new EngineError("ENGINE_ERROR", "Download exceeds the server size limit.", 413);
      if (res.destroyed) throw new EngineError("TIMEOUT", "Client disconnected.", 504);
      const accepted = res.write(chunk);
      bytes += chunk.length; setStatus(work.token, "streaming", bytes); resetIdle();
      if (!accepted) await new Promise<void>((resolve, reject) => {
        const clean = () => {
          res.removeListener("drain", drain); res.removeListener("close", close); res.removeListener("error", error);
          work.controller.signal.removeEventListener("abort", abort);
        };
        const drain = () => { clean(); resetIdle(); resolve(); };
        const error = () => { clean(); reject(new EngineError("TIMEOUT", "Client disconnected.", 504)); };
        const close = error;
        const abort = () => { clean(); reject(work.controller.signal.reason); };
        res.once("drain", drain); res.once("close", close); res.once("error", error);
        work.controller.signal.addEventListener("abort", abort, { once: true });
        if (work.controller.signal.aborted) abort(); else if (res.destroyed) close();
      });
    };
    try {
      setStatus(work.token, "streaming");
      res.writeHead(200, { "Content-Type": ticket.contentType, "Content-Disposition": disposition(ticket.filename),
        "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff",
        "X-VidFetch-Platform": ticket.platform, "X-VidFetch-Transfer": work.token });
      resetIdle();
      await write(ticket.first);
      while (true) {
        const chunk = await cancellable(iterator.next(), work.controller.signal);
        if (chunk.done) break;
        await write(chunk.value);
      }
      const results = await cancellable(Promise.all(work.processes.map((process) => process.completion)), work.controller.signal);
      if (results.some((result) => result.code !== 0)) throw new EngineError("ENGINE_ERROR", "The download process failed.", 502);
      work.controller.signal.throwIfAborted();
      const flushed = finished(res, { cleanup: true });
      res.end();
      await cancellable(flushed, work.controller.signal);
      setStatus(work.token, "completed", bytes);
    } catch (error) {
      const disconnected = res.destroyed && (!isEngineError(error) || error.message === "Client disconnected.");
      setStatus(work.token, disconnected ? "aborted" : "failed", bytes, disconnected ? "Client disconnected." : isEngineError(error) ? error.message : "Streaming failed.");
      if (!res.destroyed) res.destroy();
    } finally {
      detach(); if (idleTimer) clearTimeout(idleTimer);
      await work.dispose();
    }
  };
  const handlers = new Set<Promise<void>>();
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    res.on("error", () => {});
    try {
      // Host headers are untrusted and unnecessary for relative route parsing.
      const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
      const path = requestUrl.pathname;
      // Protect a loopback listener against browser DNS rebinding and cross-origin POSTs.
      const host = req.headers.host?.split(":")[0];
      if (!host || !["127.0.0.1", "localhost"].includes(host)) throw new EngineError("INVALID_URL", "Invalid local Host header.", 400);
      if (req.headers.origin) {
        let origin: URL;
        try { origin = new URL(req.headers.origin); } catch { throw new EngineError("INVALID_URL", "Invalid origin.", 403); }
        if (origin.origin !== `http://${req.headers.host}`) throw new EngineError("INVALID_URL", "Cross-origin access is disabled for this local backend.", 403);
      }
      if (path === "/api/health" && req.method === "GET") {
        const health = engine.engineStatus();
        json(res, health.ytDlp && health.ffmpeg ? 200 : 503, { ok: Boolean(health.ytDlp && health.ffmpeg), service: "vidfetch.io", engine: health, timestamp: new Date().toISOString() });
      } else if (path === "/api/fetch-info" && req.method === "POST") {
        const body = await readJson(req, limits.bodyMs);
        const url = validateUrl(body.url).url;
        const work = acquire(), detach = onDisconnect(res, work);
        try { const result = await mediaInfo(url, work); json(res, 200, { ok: true, info: result.info, engine: result.health }); }
        finally { detach(); await work.dispose(); }
      } else if (path === "/api/download" && req.method === "POST") {
        await prepare(await readJson(req, limits.bodyMs), res);
      } else if (path === "/api/download" && req.method === "GET" && requestUrl.searchParams.has("status")) {
        prune();
        const status = statuses.get(requestUrl.searchParams.get("status") || "");
        if (!status) json(res, 404, { ok: false, code: "EXPIRED", error: "Transfer status expired." });
        else json(res, 200, { ok: true, status: status.status, bytes: status.bytes, error: status.error });
      } else if (path === "/api/download" && req.method === "GET" && requestUrl.searchParams.has("ticket")) {
        const token = requestUrl.searchParams.get("ticket") || "";
        const ticket = tickets.get(token);
        if (!ticket || Date.now() >= ticket.deadline) {
          expire(token); json(res, 404, { ok: false, code: "EXPIRED", error: "Download ticket expired." });
        } else {
          tickets.delete(token); clearTimeout(ticket.timer);
          await stream(ticket, res);
        }
      } else if (["/api/health", "/api/fetch-info", "/api/download"].includes(path)
        && !((path === "/api/download" && ["GET", "POST"].includes(req.method || "")) || (path === "/api/health" && req.method === "GET") || (path === "/api/fetch-info" && req.method === "POST"))) {
        res.setHeader("Allow", path === "/api/health" ? "GET" : path === "/api/fetch-info" ? "POST" : "GET, POST");
        json(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED", error: "Method not allowed." });
      } else json(res, 404, { ok: false, code: "NOT_FOUND", error: "Not found." });
    } catch (error) { fail(res, error); }
  };
  const server = createServer((req, res) => {
    const task = handle(req, res);
    handlers.add(task);
    void task.finally(() => handlers.delete(task));
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  server.maxConnections = 32;
  const sweeper = setInterval(prune, Math.min(limits.statusMs, 60000));
  sweeper.unref();
  const shutdown = async () => {
    clearInterval(sweeper);
    for (const ticket of tickets.values()) clearTimeout(ticket.timer);
    tickets.clear();
    for (const work of active) work.controller.abort(new EngineError("TIMEOUT", "Backend stopped.", 504));
    server.closeAllConnections();
    await Promise.all([...handlers]);
    await Promise.all([...active].map((work) => work.dispose()));
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  server.once("close", () => clearInterval(sweeper));
  return { server, shutdown };
}

export function startBackend() {
  const port = Number(process.env.PORT || 8788);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  if (process.env.HOST && process.env.HOST !== "127.0.0.1") throw new Error("HOST must remain 127.0.0.1");
  const backend = createBackend();
  backend.server.on("error", () => { console.error("[vidfetch] listener failed"); process.exitCode = 1; void backend.shutdown(); });
  // Resolve engine executables once before requests, avoiding blocking discovery per request.
  engineStatus();
  backend.server.listen(port, "127.0.0.1", () => console.log(`[vidfetch-backend] Listening on http://127.0.0.1:${port}; max operations: 1`));
  let stopping = false;
  const stop = () => { if (stopping) return; stopping = true; void backend.shutdown(); };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
}
