import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createGateway } from "./server";
import { GatewayLedger } from "./ledger";
import { SecureDownloadClient } from "../../src/lib/secure-client";
import { createAccessIssuer } from "../../src/server/download-access";
import { verifyAccess } from "../../src/server/access-crypto";

test("same-origin transfer: scoped cookie, signed preparation, ownership, IP, single use and unchanged quotas", async () => {
  const key = randomBytes(32), site = "https://vidfetch.app", origin = "https://dl.vidfetch.app";
  const folder = await mkdtemp(resolve("backend/artifacts/same-origin-"));
  let upstreamOwner: unknown, prepares = 0;
  const bytes = Buffer.alloc(65536, 31);
  const backend = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST") {
      let body = ""; req.on("data", chunk => body += chunk); req.on("end", () => {
        upstreamOwner = JSON.parse(body).owner; prepares++;
        res.writeHead(201); res.end(JSON.stringify({ ok: true, token: "12345678-1234-1234-1234-123456789abc", filename: "fixture.mp4" }));
      });
    } else if (req.url?.includes("status=")) res.end('{"ok":true,"status":"completed","bytes":65536}');
    else { res.setHeader("Content-Type", "video/mp4"); res.setHeader("Content-Disposition", 'attachment; filename="fixture.mp4"'); res.end(bytes); }
  });
  backend.listen(0, "127.0.0.1"); await once(backend, "listening");
  const ba = backend.address(); assert(ba && typeof ba !== "string");
  const gateway = createGateway({ origin, sites: [site, "https://other.example.net"], key, backend: `http://127.0.0.1:${ba.port}`, ledger: new GatewayLedger(resolve(folder, "quota.sqlite")), requireIsolation: false });
  gateway.server.listen(0, "127.0.0.1"); await once(gateway.server, "listening");
  const ga = gateway.server.address(); assert(ga && typeof ga !== "string");
  const send = (path: string, init: RequestInit = {}, extra: Record<string, string> = {}) => new Promise<Response>((done, reject) => {
    const req = request(`http://127.0.0.1:${ga.port}${path}`, { method: init.method ?? "GET", headers: { Host: "vidfetch.app", "X-Forwarded-Proto": "https", "X-Forwarded-For": "203.0.113.30", "Sec-Fetch-Site": "same-origin", Origin: site, ...Object.fromEntries(new Headers(init.headers)), ...extra } }, res => {
      const chunks: Buffer[] = []; res.on("data", chunk => chunks.push(chunk)); res.on("end", () => {
        const headers = new Headers(); for (const [k, v] of Object.entries(res.headers)) if (v) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
        done(new Response(Buffer.concat(chunks), { status: res.statusCode, headers }));
      });
    }); req.on("error", reject); req.end(typeof init.body === "string" ? init.body : undefined);
  });
  const actor = () => {
    let session = "";
    const issuer = createAccessIssuer({ key, siteOrigin: site, gatewayOrigin: origin, verifyChallenge: async token => token === "original-fixture" });
    return new SecureDownloadClient(origin, (async (_input, init) => {
      const res = await issuer(new Request(site, { ...init, headers: { Origin: site, Cookie: session } }));
      if (res.ok) session = res.headers.get("set-cookie")!.split(";")[0]; return res;
    }) as typeof fetch, (async (input, init) => send(new URL(String(input)).pathname + new URL(String(input)).search, init)) as typeof fetch, site);
  };
  const a = actor(), b = actor();
  const body = JSON.stringify({ url: "https://www.tiktok.com/@example/video/1234567890123456789", format_id: "18", type: "video", owner: "forged" });
  const path = "/api/transfer/download";
  try {
    await a.authorize("original-fixture"); await b.authorize("original-fixture");
    assert.equal(prepares, 0, "warming grants consumes no ticket or download quota");
    const grant = await a.grant(), proof = await a.proof("POST", path, body, grant);
    const headers = { Authorization: `Bearer ${grant}`, "X-VidFetch-Proof": proof };
    assert.equal((await send(path, { method: "POST", body })).status, 401);
    for (const p of ["", "forged.signature"]) assert.equal((await send(path, { method: "POST", body, headers: { ...headers, "X-VidFetch-Proof": p } })).status, 401);
    assert.equal((await send(path, { method: "POST", body, headers }, { "Sec-Fetch-Site": "same-site" })).status, 403);
    assert.equal((await send(path, { method: "POST", body, headers }, { Origin: "https://evil.example" })).status, 403);
    assert.equal((await send(path, { method: "POST", body, headers }, { Origin: "" })).status, 403);
    const ready = await send(path, { method: "POST", body, headers }); assert.equal(ready.status, 201);
    assert.equal((await send(path, { method: "POST", body, headers })).status, 401, "proof replay");
    assert.equal(upstreamOwner, verifyAccess(grant, key, origin, "api").sub, "gateway replaces untrusted owner");
    const cookieHeader = ready.headers.get("set-cookie")!;
    assert.match(cookieHeader, /; Path=\/api\/transfer\/download;.*Secure; HttpOnly; SameSite=Strict$/);
    assert(!cookieHeader.includes("Domain="));
    const cookie = cookieHeader.split(";")[0], ticket = await ready.json();
    assert.match(ticket.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal((await send(ticket.downloadUrl)).status, 404, "no cookie");
    assert.equal((await send(ticket.downloadUrl, { headers: { Cookie: cookie } }, { "X-Forwarded-For": "203.0.113.31" })).status, 404);
    for (const site of ["cross-site", "same-site", "none", ""]) assert.equal((await send(ticket.downloadUrl, { headers: { Cookie: cookie } }, { "Sec-Fetch-Site": site })).status, 403);
    assert.equal((await send(ticket.downloadUrl, { headers: { Cookie: cookie } }, { Host: "other.example.net", Origin: "https://other.example.net" })).status, 404);
    assert.equal((await send(`/api/download?ticket=${ticket.token}`, { headers: { Cookie: cookie } }, { Host: "dl.vidfetch.app" })).status, 404);
    assert.equal((await b.request(`/api/download?status=${ticket.token}`)).status, 404);
    const stream = await send(ticket.downloadUrl, { headers: { Cookie: cookie } }); assert.equal(stream.status, 200);
    assert.match(stream.headers.get("content-disposition")!, /^attachment/); assert.match(stream.headers.get("cache-control")!, /no-store/);
    assert.deepEqual(Buffer.from(await stream.arrayBuffer()), bytes);
    assert.equal((await send(ticket.downloadUrl, { headers: { Cookie: cookie } })).status, 404, "ticket replay");
    await delay(5);
    for (let i = 1; i < 8; i++) {
      const next = await a.request("/api/download", { method: "POST", body }); assert.equal(next.status, 201, `download ${i + 1}`);
      const payload = await next.json();
      assert.equal((await send(payload.downloadUrl, { headers: { Cookie: next.headers.get("set-cookie")!.split(";")[0] } })).status, 200);
      await delay(5);
    }
    const limited = await a.request("/api/download", { method: "POST", body }); assert.equal(limited.status, 429);
    assert.equal((await limited.json()).code, "QUOTA_EXCEEDED"); assert.equal(prepares, 8);
  } finally {
    await gateway.shutdown(); backend.closeAllConnections(); await new Promise<void>(r => backend.close(() => r()));
  }
});
