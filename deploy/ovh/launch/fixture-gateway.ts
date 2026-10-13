/** Dedicated loopback fixture: isolated key/ledger, simulated challenge, real gateway. */
import { createServer, request } from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { createGateway } from "../../../backend/gateway/server";
import { GatewayLedger } from "../../../backend/gateway/ledger";
import { serviceKey, serviceMac } from "../../../src/server/access-crypto";
import { createAccessIssuer } from "../../../src/server/download-access";

const origin = "https://vidfetch.app:33443", key = serviceKey(process.env.VIDFETCH_VALIDATION_KEY);
const state = process.env.VIDFETCH_FIXTURE_STATE;
if (!state?.startsWith("/var/lib/vidfetch-launch-fixture-")) throw Error("Dedicated fixture state required");
const gate = createGateway({ origin, sites: [origin], key, backend: "http://127.0.0.1:18888",
  ledger: new GatewayLedger(state + "/quota.sqlite"), queue: { maxWaiting: 2, waitMs: 180000, estimateMs: 90000 },
  requireIsolation: true, isolationProfile: "vidfetch-uid-nft-v1" });
gate.server.listen(18889, "127.0.0.1");
const issuer = createAccessIssuer({ key, siteOrigin: origin, gatewayOrigin: origin,
  verifyChallenge: async token => token === "authorized-local-fixture",
  admit: (req, requestNonce, keyHash) => new Promise<void>((resolve, reject) => {
    const identity = createHmac("sha256", key).update(req.headers.get("x-forwarded-for") ?? "").digest("base64url");
    const body = JSON.stringify({ identity, requestNonce, keyHash }), timestamp = String(Date.now()), nonce = randomUUID();
    const connection = request({ hostname: "127.0.0.1", port: 18889, path: "/auth/admission", method: "POST", headers: {
      Host: new URL(origin).host, "X-Forwarded-Proto": "https", "X-Forwarded-For": "127.0.0.1", "Content-Type": "application/json",
      "X-VidFetch-Service-Time": timestamp, "X-VidFetch-Service-Nonce": nonce, "X-VidFetch-Service-MAC": serviceMac(key, body, timestamp, nonce),
    } }, response => { response.resume(); response.once("end", () => response.statusCode === 200 ? resolve() : reject(Error("Fixture admission refused"))); });
    connection.setTimeout(5000, () => connection.destroy()); connection.once("error", reject); connection.end(body);
  }),
});
const auth = createServer(async (req, res) => {
  if (req.method === "GET") { res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify({ ok: true, available: true, siteKey: "test-only-widget" })); return; }
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 8192) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
  const response = await issuer(new Request(origin + "/api/download-access", { method: "POST", headers: Object.fromEntries(Object.entries(req.headers).map(([name, value]) => [name, String(value ?? "")])), body: Buffer.concat(chunks).toString("utf8") }));
  res.writeHead(response.status, Object.fromEntries(response.headers.entries())); res.end(Buffer.from(await response.arrayBuffer()));
});
auth.listen(18890, "127.0.0.1");
for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => { auth.closeAllConnections(); auth.close(); void gate.shutdown(); });
