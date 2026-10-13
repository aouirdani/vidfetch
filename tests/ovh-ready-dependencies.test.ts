import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { healthGET } from "../src/server/ovh-api";
import { issueDownloadAccess } from "../src/server/download-access";
import { publicMediaConfiguration } from "../src/server/media-config";

// What the OVH frontend asks of the engine (127.0.0.1:8788) and of the gateway (127.0.0.1:8789), and when.
// This is the dependency audit behind the deployment order: the frontend of main can be deployed with
// VIDFETCH_CONNECTION_READY=0 in front of ANY gateway, because in that state it never talks to it.
const secrets = {
  VIDFETCH_TARGET: "ovh", NEXT_PUBLIC_SITE_URL: "https://vidfetch.app", VIDFETCH_MEDIA_ORIGIN: "https://dl.vidfetch.app",
  TURNSTILE_SITE_KEY: "test-site-key", TURNSTILE_SECRET_KEY: "test-secret-key", VIDFETCH_ACCESS_SIGNING_KEY: randomBytes(32).toString("base64url"),
};
async function listen(port: number, handler: (request: IncomingMessage) => { status: number; body: string }) {
  const seen: string[] = [];
  const server: Server = createServer((request, response) => {
    seen.push(`${request.method} ${request.url} host=${request.headers.host}`);
    const reply = handler(request);
    response.writeHead(reply.status, { "Content-Type": "application/json" }); response.end(reply.body);
  });
  server.listen(port, "127.0.0.1");
  const [outcome] = await Promise.race([once(server, "listening").then(() => ["ok"]), once(server, "error").then(() => ["busy"])]);
  return { seen, busy: outcome === "busy", close: () => new Promise<void>(resolve => { if (outcome === "busy") resolve(); else server.close(() => resolve()); }) };
}
function environment(values: Record<string, string>) {
  const names = [...Object.keys(secrets), "VIDFETCH_CONNECTION_READY"];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  Object.assign(process.env, values);
  return () => { for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; } };
}
const engineHealthy = () => ({ status: 200, body: JSON.stringify({ ok: true, engine: { isolationProfile: "vidfetch-uid-nft-v1" } }) });

test("ready=0: the frontend contacts neither the engine nor the gateway, whatever is configured", async (t) => {
  const engine = await listen(8788, engineHealthy), gateway = await listen(8789, () => ({ status: 404, body: "{}" }));
  if (engine.busy || gateway.busy) { await engine.close(); await gateway.close(); t.skip("ports 8788/8789 are in use on this machine"); return; }
  const restore = environment({ ...secrets, VIDFETCH_CONNECTION_READY: "0" });   // even with every secret installed
  try {
    const health = await (await healthGET()).json();
    assert.equal(health.ok, true);
    assert.deepEqual(health.downloads, { available: false });
    assert.deepEqual(publicMediaConfiguration(), { ok: true, available: false, siteKey: "", gatewayOrigin: "" });
    const access = await issueDownloadAccess(new Request("https://vidfetch.app/api/download-access", { method: "POST", headers: { origin: "https://vidfetch.app" }, body: "{}" }));
    assert.equal(access.status, 503);
    assert.equal((await access.json()).code, "BACKEND_UNAVAILABLE");
    assert.deepEqual(engine.seen, [], "no request to the engine");
    assert.deepEqual(gateway.seen, [], "no request to the gateway");
  } finally { restore(); await engine.close(); await gateway.close(); }
});

test("ready=1: frontend health depends on the gateway's /auth/deployment (absent from the gateway running on the VPS today)", async (t) => {
  let deployment = { status: 404, body: JSON.stringify({ ok: false, code: "NOT_FOUND" }) };   // what the 12 Oct gateway answers
  const engine = await listen(8788, engineHealthy), gateway = await listen(8789, () => deployment);
  if (engine.busy || gateway.busy) { await engine.close(); await gateway.close(); t.skip("ports 8788/8789 are in use on this machine"); return; }
  const restore = environment({ ...secrets, VIDFETCH_CONNECTION_READY: "1" });
  try {
    assert.deepEqual(publicMediaConfiguration(), { ok: true, available: true, siteKey: "test-site-key", gatewayOrigin: "https://dl.vidfetch.app" });
    const old = await (await healthGET()).json();
    assert.equal(old.downloads.available, false, "an old gateway keeps the frontend health at 'unavailable'");
    assert.ok(gateway.seen.some(line => line === "GET /auth/deployment host=dl.vidfetch.app"), gateway.seen.join("; "));
    deployment = { status: 200, body: JSON.stringify({ ok: true, draining: false, active: 0, waiting: 0 }) };   // the gateway of main
    const current = await (await healthGET()).json();
    assert.equal(current.downloads.available, true);
    deployment = { status: 200, body: JSON.stringify({ ok: true, draining: true, active: 0, waiting: 0 }) };
    assert.equal((await (await healthGET()).json()).downloads.available, false, "a draining gateway is reported as unavailable");
  } finally { restore(); await engine.close(); await gateway.close(); }
});
