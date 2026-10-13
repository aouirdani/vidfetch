/** Test entry only: mock challenge on loopback, separate key and quota ledger. */
import { createServer } from "node:http";
import { createGateway } from "../../../backend/gateway/server";
import { GatewayLedger } from "../../../backend/gateway/ledger";
import { serviceKey } from "../../../src/server/access-crypto";
import { createAccessIssuer } from "../../../src/server/download-access";
const origin = "https://vidfetch.app:33443", key = serviceKey(process.env.VIDFETCH_VALIDATION_KEY);
const gate = createGateway({ origin, sites: [origin], key, backend: "http://127.0.0.1:18888", ledger: new GatewayLedger("/var/lib/vidfetch-migration-validation/quota.sqlite"), queue: { maxWaiting: 2, waitMs: 180000, estimateMs: 90000 }, requireIsolation: true, isolationProfile: "vidfetch-uid-nft-v1" });
gate.server.listen(18889, "127.0.0.1");
const issuer = createAccessIssuer({ key, siteOrigin: origin, gatewayOrigin: origin, verifyChallenge: async token => token === "authorized-local-fixture" });
const auth = createServer(async (req, res) => {
  if (req.method === "GET") { res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify({ ok: true, available: true, siteKey: "test-only-widget" })); return; }
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 8192) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
  const response = await issuer(new Request(origin + "/api/download-access", { method: "POST", headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v ?? "")])), body: Buffer.concat(chunks).toString("utf8") }));
  res.writeHead(response.status, Object.fromEntries(response.headers.entries())); res.end(Buffer.from(await response.arrayBuffer()));
});
auth.listen(18890, "127.0.0.1");
for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => { auth.closeAllConnections(); auth.close(); void gate.shutdown(); });
