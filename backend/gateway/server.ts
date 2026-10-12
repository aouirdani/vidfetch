import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { AccessError, verifyAccess, verifyProof, verifyServiceMac } from "../../src/server/access-crypto";
import { detectPlatform } from "../../src/lib/platforms";
import { GatewayLedger } from "./ledger";
import { downloadHelper } from "./helper";
import { WaitingQueue,type QueueOptions } from "./queue";

type Job = { inner: string; owner: string; ip: string; expires: number; retained: number; used: boolean; delivered: boolean; cookie?: string; timer?: NodeJS.Timeout; totalTimer?: NodeJS.Timeout; bytes: number; terminal?: "aborted" | "failed" | "expired"; settle: (bytes: number) => void; controller: AbortController; deadline: number };
export function createGateway(options: {
  origin: string; sites: string[]; key: Buffer; backend: string; ledger: GatewayLedger;
  requireIsolation?: boolean; ticketMs?: number; retentionMs?: number; operationMs?: number; maxBytes?: number;
  backendSocket?: string; proxy?: "reverse-proxy" | "funnel"; queue?: QueueOptions; bytesPerSecond?: number;
  admitWork?:()=>Promise<void>;
  isDraining?:()=>boolean;
  backendTicketMs?:number; isolationProfile?: "vidfetch-netns-v1" | "vidfetch-uid-nft-v1";
}) {
  const target = new URL(options.backend);
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1" || target.username || target.password || target.pathname !== "/" || target.search || target.hash) throw new Error("Backend must be a fixed loopback origin");
  if(options.backendSocket&&options.backendSocket!=="/run/vidfetch-public/backend.sock")throw Error("Invalid isolated backend socket");
  const queue=options.queue?new WaitingQueue(options.queue):undefined;
  const bytesPerSecond=options.bytesPerSecond??2*1024**2;
  if(!Number.isInteger(bytesPerSecond)||bytesPerSecond<32768||bytesPerSecond>2*1024**2)throw Error("Invalid streaming rate");
  const jobs = new Map<string, Job>();
  const pending = new Set<AbortController>();
  let active = false;
  let activeOwner: string | undefined,activeIp: string | undefined;
  const maxBytes = options.maxBytes ?? 256 * 1024 ** 2, ticketMs = options.ticketMs ?? 55000, retentionMs = options.retentionMs ?? 1800000;
  function json(res: ServerResponse, status: number, value: unknown) {
    if (res.destroyed) return;
    if (res.headersSent) { res.destroy(); return; }
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...(status === 429 ? { "Retry-After": "60" } : {}) });
    res.end(JSON.stringify(value));
  }
  const alias = (value: string) => createHmac("sha256", options.key).update(value).digest("base64url");
  const release = (job: Job) => { clearTimeout(job.timer); clearTimeout(job.totalTimer); job.settle(job.bytes); active = false;activeOwner=undefined;activeIp=undefined; };
  const prune = () => {
    const now = Date.now();
    for (const [token, job] of jobs) if (now >= job.retained) { clearTimeout(job.timer); jobs.delete(token); }
    options.ledger.prune(now);
    queue?.sweep(now);
  };
  function upstream(path: string, method: string, body: Buffer | undefined, signal: AbortSignal): Promise<IncomingMessage> {
    return new Promise((resolve, reject) => {
      const request = httpRequest(new URL(path, target), { method, signal, ...(options.backendSocket?{socketPath:options.backendSocket}:{}), headers: { Host: "127.0.0.1:8788", ...(body ? { "Content-Type": "application/json", "Content-Length": body.length } : {}) } }, resolve);
      request.on("error", reject);
      request.setTimeout(path.includes("?ticket=") ? 30000 : 180000, () => request.destroy(new AccessError("TIMEOUT", 504)));
      request.end(body);
    });
  }
  async function upstreamJson(path: string, method: string, body: Buffer | undefined, signal: AbortSignal) {
    const response = await upstream(path, method, body, signal);
    let bytes = 0; const chunks: Buffer[] = [];
    for await (const chunk of response) {
      bytes += chunk.length;
      if (bytes > 2 * 1024 ** 2) { response.destroy(); throw new AccessError("UPSTREAM_INVALID", 502); }
      chunks.push(chunk);
    }
    let data: Record<string, unknown>;
    try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new AccessError("UPSTREAM_INVALID", 502); }
    return { status: response.statusCode ?? 502, data };
  }
  async function readBody(req: IncomingMessage) {
    let size = 0; const chunks: Buffer[] = [];
    if (Number(req.headers["content-length"] ?? 0) > 8192) throw new AccessError("BODY_TOO_LARGE", 413);
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { req.destroy(); reject(new AccessError("TIMEOUT", 504)); }, 10000); });
    try {
      const iterator = req[Symbol.asyncIterator]();
      while (true) { const next = await Promise.race([iterator.next(), deadline]); if (next.done) break; size += next.value.length; if (size > 8192) throw new AccessError("BODY_TOO_LARGE", 413); chunks.push(next.value); }
      return Buffer.concat(chunks);
    } finally { clearTimeout(timer); }
  }
  async function handle(req: IncomingMessage, res: ServerResponse) {
    res.on("error", () => {});
    let controller: AbortController | undefined;
    let hold = false, published = false;
    let quota: ((bytes: number) => void) | undefined;
    let operationTimer: NodeJS.Timeout | undefined;
    let transferJob: Job | undefined;
    const onClose = () => { if (!res.writableFinished) controller?.abort(); };
    res.once("close", onClose);
    try {
      prune();
      if (req.headers.host !== new URL(options.origin).host) throw new AccessError("FORBIDDEN_HOST", 403);
      const peer = req.socket.remoteAddress;
      if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer ?? "")) throw new AccessError("FORBIDDEN_PROXY", 403);
      if (req.headers["x-forwarded-proto"] !== "https") throw new AccessError("HTTPS_REQUIRED", 403);
      if(options.proxy==="funnel"&&(req.headers["tailscale-funnel-request"]!=="?1"||req.headers["x-forwarded-host"]!==new URL(options.origin).host))throw new AccessError("FORBIDDEN_PROXY",403);
      const rawIp = req.headers["x-forwarded-for"];
      if (typeof rawIp !== "string" || !isIP(rawIp)) throw new AccessError("FORBIDDEN_PROXY", 403);
      const ip = alias(isIP(rawIp) === 6 ? new URL(`http://[${rawIp}]`).hostname : rawIp);
      options.ledger.rate(ip, "request", 120, 60000);
      const url = new URL(req.url ?? "/", options.origin);
      if (url.origin !== options.origin) throw new AccessError("FORBIDDEN_HOST", 403);
      let path = url.pathname;
      const origin = req.headers.origin;
      if (origin && !options.sites.includes(origin) && origin !== options.origin) throw new AccessError("FORBIDDEN_ORIGIN", 403);
      if (origin && options.sites.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-VidFetch-Proof"); res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      }
      if (req.method === "OPTIONS") { if (!origin || !options.sites.includes(origin)) throw new AccessError("FORBIDDEN_ORIGIN", 403); res.writeHead(204); res.end(); return; }
      if (path === "/auth/deployment" && req.method === "GET") {
        const timestamp = String(req.headers["x-vidfetch-service-time"] ?? ""), nonce = String(req.headers["x-vidfetch-service-nonce"] ?? "");
        verifyServiceMac(options.key, Buffer.alloc(0), timestamp, nonce, String(req.headers["x-vidfetch-service-mac"] ?? ""));
        options.ledger.useProof("service", nonce);
        json(res, 200, { ok: true, draining: options.isDraining?.() === true, active, waiting: queue?.size() ?? 0 }); return;
      }
      if (options.isDraining?.() && req.method === "POST" && ["/api/fetch-info", "/api/download"].includes(path)) throw new AccessError("BACKEND_UNAVAILABLE", 503);
      if(path==="/auth/admission"&&req.method==="POST"){
        const body=await readBody(req);
        const timestamp=String(req.headers["x-vidfetch-service-time"]??""),nonce=String(req.headers["x-vidfetch-service-nonce"]??"");
        verifyServiceMac(options.key,body,timestamp,nonce,String(req.headers["x-vidfetch-service-mac"]??""));options.ledger.useProof("service",nonce);
        let identity:unknown,requestNonce:unknown,keyHash:unknown;try{({identity,requestNonce,keyHash}=JSON.parse(body.toString("utf8")));}catch{throw new AccessError("INVALID_JSON",400);}
        if(typeof identity!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(identity))throw new AccessError("INVALID_ACCESS");
        if(typeof requestNonce!=="string"||!/^[a-f0-9-]{36}$/.test(requestNonce)||typeof keyHash!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(keyHash))throw new AccessError("INVALID_ACCESS");
        options.ledger.useProof(`issuer:${keyHash}`,requestNonce);
        options.ledger.rate(identity,"grant",10,60000);json(res,200,{ok:true});return;
      }
      if (path === "/download-helper" && req.method === "GET") {
        const helper = downloadHelper(options.sites);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": helper.csp, "Referrer-Policy": "no-referrer", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); res.end(helper.html); return;
      }
      if (!["/api/health", "/api/fetch-info", "/api/download", "/api/queue", "/auth/transfer"].includes(path)) throw new AccessError("NOT_FOUND", 404);
      const method = req.method ?? "";
      if (!((path === "/api/health" && method === "GET") || (["/api/download","/api/queue"].includes(path) && ["GET", "POST"].includes(method)) || (["/api/fetch-info", "/auth/transfer"].includes(path) && method === "POST"))) throw new AccessError("METHOD_NOT_ALLOWED", 405);
      let body: Buffer = method === "POST" ? await readBody(req) : Buffer.alloc(0);
      let payload: Record<string, unknown> = {};
      if (method === "POST") { try { payload = JSON.parse(body.toString("utf8")); } catch { throw new AccessError("INVALID_JSON", 400); } if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new AccessError("INVALID_JSON", 400); }
      let job: Job | undefined;
      const ticket = url.searchParams.get("ticket");
      if (path === "/api/download" && method === "GET" && ticket) {
        job = jobs.get(ticket);
        const cookie = req.headers.cookie?.split(";").map(x => x.trim()).find(x => x.startsWith("__Secure-vidfetch-transfer="))?.slice("__Secure-vidfetch-transfer=".length);
        if (!job || !cookie || alias(cookie) !== job.cookie || job.ip !== ip || job.used || Date.now() >= job.expires || req.headers["sec-fetch-site"] !== "same-origin") throw new AccessError("EXPIRED", 404);
        // Single-use authorization is consumed atomically before any upstream work.
        job.used = true; job.cookie = undefined; clearTimeout(job.timer);
        transferJob = job;
        controller = job.controller;
        let response: IncomingMessage;
        try { response = await upstream(`/api/download?ticket=${encodeURIComponent(job.inner)}`, "GET", undefined, controller.signal); }
        catch { job.terminal = "failed"; controller.abort(); release(job); throw new AccessError("BACKEND_UNAVAILABLE", 503); }
        if (response.statusCode !== 200) { response.destroy(); job.terminal = "failed"; controller.abort(); release(job); throw new AccessError("BACKEND_UNAVAILABLE", 503); }
        res.setHeader("Set-Cookie", "__Secure-vidfetch-transfer=; Path=/api/download; Max-Age=0; Secure; HttpOnly; SameSite=Strict");
        res.writeHead(200, { "Content-Type": response.headers["content-type"] ?? "application/octet-stream", "Content-Disposition": response.headers["content-disposition"] ?? 'attachment; filename="VidFetch_download"', "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
        const current = job;
        let sourceFailed=false;
        response.once("aborted",()=>{if(!current.controller.signal.aborted)sourceFailed=true;});
        response.once("error",()=>{if(!current.controller.signal.aborted)sourceFailed=true;});
        let nextOutput = Date.now(); let timer: NodeJS.Timeout | undefined;
        const throttle = new Transform({ highWaterMark: 65536, transform(chunk: Buffer, _encoding, callback) {
          if (current.bytes + chunk.length > maxBytes) { sourceFailed=true;return callback(new AccessError("TOO_LARGE", 413)); }
          current.bytes += chunk.length;
          const wait = Math.max(0, nextOutput - Date.now()); nextOutput = Math.max(nextOutput, Date.now()) + chunk.length / bytesPerSecond * 1000;
          timer = setTimeout(() => { timer = undefined; callback(null, chunk); }, wait);
        }, destroy(error, callback) { clearTimeout(timer); callback(error); } });
        try { await pipeline(response, throttle, res, { signal: controller.signal }); current.delivered = true; }
        catch { current.terminal = !sourceFailed && res.destroyed && !res.writableFinished ? "aborted" : "failed"; controller.abort(); }
        finally { clearTimeout(timer); current.retained = Date.now() + retentionMs; release(current); }
        return;
      }
      const grant = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
      const claims = verifyAccess(grant, options.key, options.origin, "api");
      const proof = verifyProof(typeof req.headers["x-vidfetch-proof"] === "string" ? req.headers["x-vidfetch-proof"] : "", claims.key, { method, path: url.pathname + url.search, body, token: grant });
      options.ledger.useProof(claims.sub, proof.jti);
      let claimed=false;
      if(path==="/api/queue"){
        if(!queue)throw new AccessError("NOT_FOUND",404);
        const token=method==="GET"?url.searchParams.get("job"):(payload.claim??payload.cancel);
        if(typeof token!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new AccessError("INVALID_QUEUE_REQUEST",400);
        if(method==="GET"){json(res,200,queue.inspect(token,claims.sub,ip,active));return;}
        if(typeof payload.cancel==="string"){queue.cancel(token,claims.sub,ip);json(res,200,{ok:true,cancelled:true});return;}
        const entry=queue.claim(token,claims.sub,ip,active);
        path=entry.path;body=entry.body;payload=JSON.parse(body.toString("utf8"));claimed=true;
      }
      if (path === "/auth/transfer") {
        const outer = typeof payload.ticket === "string" ? payload.ticket : ""; job = jobs.get(outer);
        if (!job || job.owner !== claims.sub || job.ip !== ip || job.used || Date.now() >= job.expires) throw new AccessError("EXPIRED", 404);
        if (job.cookie) throw new AccessError("EXPIRED", 404);
        const cookie = randomBytes(32).toString("base64url"); job.cookie = alias(cookie);
        res.setHeader("Set-Cookie", `__Secure-vidfetch-transfer=${cookie}; Path=/api/download; Max-Age=${Math.max(1, Math.floor((job.expires - Date.now()) / 1000))}; Secure; HttpOnly; SameSite=Strict`);
        json(res, 200, { ok: true }); return;
      }
      controller = new AbortController(); pending.add(controller);
      const operationStarted = Date.now();
      if (res.destroyed) controller.abort();
      operationTimer = setTimeout(() => controller?.abort(), path === "/api/download" && method === "POST" ? (options.operationMs ?? 600000) : 180000);
      if (path === "/api/download" && method === "GET") {
        const status = url.searchParams.get("status"); job = status ? jobs.get(status) : undefined;
        if (!job || job.owner !== claims.sub) throw new AccessError("EXPIRED", 404);
        const reply = await upstreamJson(`/api/download?status=${encodeURIComponent(job.inner)}`, "GET", undefined, controller.signal);
        if (reply.status === 200) {
          const state = reply.data.status;
          if (["completed", "failed", "aborted", "expired"].includes(String(state))) job.retained = Math.min(job.retained, Number(reply.data.updated ?? Date.now()) + retentionMs);
          if (job.terminal) { reply.data.status = job.terminal; reply.data.bytes = job.bytes; reply.data.error = "The transfer stopped before delivery finished."; }
          // The relay also needs a finished response, not just a successful source.
          if (state === "completed" && !job.delivered && !job.terminal) { reply.data.status = "streaming"; reply.data.bytes = job.bytes; }
        }
        json(res, reply.status, reply.data); return;
      }
      if (path === "/api/health") {
        const reply = await upstreamJson("/api/health", "GET", undefined, controller.signal);
        if (options.requireIsolation !== false && (reply.data.engine as { isolationProfile?: string } | undefined)?.isolationProfile !== (options.isolationProfile ?? "vidfetch-netns-v1")) throw new AccessError("SECURITY_NOT_READY", 503);
        await options.admitWork?.();
        if(queue)reply.data.queue={enabled:true,waiting:queue.size(),maximum:queue.maximum,maxWaitMs:queue.waitMs};
        json(res, reply.status, reply.data); return;
      }
      if ((!queue&&active) || jobs.size >= 256) throw new AccessError("BUSY", 429);
      const detection = detectPlatform(typeof payload.url === "string" ? payload.url : "");
      if (!detection.ok) throw new AccessError("INVALID_URL", 400);
      if (path === "/api/download" && (typeof payload.format_id !== "string" || !/^[a-zA-Z0-9_.-]{1,180}$/.test(payload.format_id) || !["video", "audio"].includes(String(payload.type)))) throw new AccessError("INVALID_FORMAT", 400);
      if(!claimed){options.ledger.rate(ip, "work", 20, 600000); options.ledger.rate(claims.sub, "work", 20, 600000);}
      if(queue&&!claimed){
        if(activeOwner===claims.sub||activeIp===ip)throw new AccessError("QUEUE_DUPLICATE",429);
        if([...jobs.values()].some(job=>job.owner===claims.sub&&!job.delivered&&!job.terminal))throw new AccessError("QUEUE_DUPLICATE",429);
        if(active||queue.size()){json(res,202,queue.enqueue({owner:claims.sub,ip,path:path as "/api/download"|"/api/fetch-info",body},active));return;}
      }
      if(active)throw new AccessError("BUSY",429);
      active = true;activeOwner=claims.sub;activeIp=ip; hold = true;
      await options.admitWork?.();
      if (options.requireIsolation !== false) {
        const health = await upstreamJson("/api/health", "GET", undefined, controller.signal);
        if (health.status !== 200 || (health.data.engine as { isolationProfile?: string } | undefined)?.isolationProfile !== (options.isolationProfile ?? "vidfetch-netns-v1")) throw new AccessError("SECURITY_NOT_READY", 503);
      }
      if (path === "/api/download") quota = options.ledger.reserve(ip, claims.sub, maxBytes);
      const reply = await upstreamJson(path, method, body, controller.signal);
      if (path === "/api/download" && reply.status === 201 && reply.data.ok === true) {
        if (typeof reply.data.token !== "string" || !/^[a-f0-9-]{36}$/.test(reply.data.token)) throw new AccessError("UPSTREAM_INVALID", 502);
        const token = randomBytes(32).toString("base64url");
        const current: Job = { inner: reply.data.token, owner: claims.sub, ip, expires: Date.now() + ticketMs, retained: Date.now() + retentionMs, used: false, delivered: false, bytes: 0, settle: quota!, controller, deadline: operationStarted + (options.operationMs ?? 600000) };
        current.timer = setTimeout(() => {
          current.terminal = "expired";
          // The source ticket lives 60s; an outer 55s expiry must not offer the
          // next waiter while yt-dlp is still holding its original source slot.
          const grace=queue?Math.max(0,(options.backendTicketMs??60000)-ticketMs)+1000:0;
          if(grace){current.timer=setTimeout(()=>release(current),grace);current.timer.unref();}
          else release(current);
        }, ticketMs);
        current.timer.unref();
        jobs.set(token, current); reply.data.token = token; reply.data.downloadUrl = `/api/download?ticket=${token}`;
        published = true; pending.delete(controller);
        // Keep the complete-operation timer owned by the job after this response.
        current.totalTimer = operationTimer; operationTimer = undefined;
        current.totalTimer?.unref();
      }
      json(res, reply.status, reply.data);
    } catch (error) {
      if (transferJob && !transferJob.delivered) { transferJob.terminal ??= "failed"; transferJob.controller.abort(); release(transferJob); }
      const issue = error instanceof AccessError ? error : new AccessError("BACKEND_UNAVAILABLE", 503);
      if (hold && !published) { active = false;activeOwner=undefined;activeIp=undefined; quota?.(0); }
      if (!res.destroyed) json(res, issue.status, { ok: false, code: issue.code, error: issue.status === 429 ? "The download service is busy or your quota is reached. Try later." : "The secure download request could not be completed." });
    } finally {
      clearTimeout(operationTimer); res.removeListener("close", onClose);
      if (controller && !published) pending.delete(controller);
      if (hold && !published) {active = false;activeOwner=undefined;activeIp=undefined;}
    }
  }
  const tasks = new Set<Promise<void>>();
  const server = createServer((req, res) => { const task = handle(req, res); tasks.add(task); void task.finally(() => tasks.delete(task)); });
  server.maxConnections = 32; server.headersTimeout = 10000; server.requestTimeout = 15000; server.keepAliveTimeout = 5000;
  const sweeper = setInterval(prune, 60000); sweeper.unref();
  const shutdown = async () => {
    clearInterval(sweeper);
    queue?.close();
    for (const job of jobs.values()) { job.controller.abort(); release(job); }
    for (const controller of pending) controller.abort();
    server.closeAllConnections();
    await Promise.all(tasks);
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    jobs.clear(); options.ledger.close();
  };
  return { server, shutdown };
}
