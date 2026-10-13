import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { internalGatewayReady, internalAdmissionPost } from "../src/server/internal-admission";

test("OVH admission stays on fixed loopback, sends trusted headers and refuses redirects", async () => {
  let code = 200;
  let reply = '{"ok":true,"draining":false}';
  const requests: { host?: string; proto?: string | string[]; ip?: string | string[]; path?: string }[] = [];
  const server = createServer((req, res) => {
    requests.push({ host: req.headers.host, proto: req.headers["x-forwarded-proto"], ip: req.headers["x-forwarded-for"], path: req.url });
    req.resume(); req.on("end", () => { res.writeHead(code, { Location: "http://169.254.169.254/" }); res.end(reply); });
  });
  server.listen(8789, "127.0.0.1"); await once(server, "listening");
  try {
    await internalAdmissionPost(new URL("https://vidfetch.app/auth/admission"), "{}", {});
    assert.deepEqual(requests[0], { host: "vidfetch.app", proto: "https", ip: "127.0.0.1", path: "/auth/admission" });
    code = 302;
    await assert.rejects(internalAdmissionPost(new URL("https://vidfetch.app/auth/admission"), "{}", {}), { code: "BACKEND_UNAVAILABLE", status: 503 });
    code = 429;
    await assert.rejects(internalAdmissionPost(new URL("https://vidfetch.app/auth/admission"), "{}", {}), { code: "RATE_LIMITED", status: 429 });
    await assert.rejects(internalAdmissionPost(new URL("http://vidfetch.app/auth/admission"), "{}", {}));
    await assert.rejects(internalAdmissionPost(new URL("https://vidfetch.app/other"), "{}", {}));
    assert.equal(requests.length, 3);
    code = 200;
    assert.equal(await internalGatewayReady("https://dl.vidfetch.app", Buffer.alloc(32, 1)), true);
    assert.equal(requests.at(-1)?.host, "dl.vidfetch.app");
    assert.equal(requests.at(-1)?.path, "/auth/deployment");
    reply = '{"ok":true,"draining":true}';
    assert.equal(await internalGatewayReady("https://dl.vidfetch.app", Buffer.alloc(32, 1)), false);
    code = 401;
    assert.equal(await internalGatewayReady("https://dl.vidfetch.app", Buffer.alloc(32, 1)), false);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
