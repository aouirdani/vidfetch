import { request } from "node:http";
import { AccessError, serviceMac } from "./access-crypto";
import { randomUUID } from "node:crypto";

/** Authenticated, fixed loopback probe; no deployment operation is invoked. */
export function internalGatewayReady(origin: string, key: Buffer): Promise<boolean> {
  const timestamp = String(Date.now()), nonce = randomUUID();
  return new Promise(resolve => {
    const req = request({ hostname: "127.0.0.1", port: 8789, path: "/auth/deployment", headers: {
      Host: new URL(origin).host, "X-Forwarded-Proto": "https", "X-Forwarded-For": "127.0.0.1",
      "X-VidFetch-Service-Time": timestamp, "X-VidFetch-Service-Nonce": nonce,
      "X-VidFetch-Service-MAC": serviceMac(key, "", timestamp, nonce),
    } }, response => {
      let body = "";
      response.on("data", chunk => { body += chunk.toString(); if (body.length > 8192) req.destroy(); });
      response.on("error", () => resolve(false));
      response.on("end", () => { try { const data = JSON.parse(body); resolve(response.statusCode === 200 && data.ok === true && data.draining === false); } catch { resolve(false); } });
    });
    const timer = setTimeout(() => req.destroy(), 1500);
    req.on("error", () => resolve(false)); req.on("close", () => clearTimeout(timer)); req.end();
  });
}

/** Fixed loopback destination; neither the URL nor visitor input can change it. */
export function internalAdmissionPost(origin: URL, body: string, headers: Record<string, string>): Promise<void> {
  if (origin.pathname !== "/auth/admission" || origin.protocol !== "https:" || Buffer.byteLength(body) > 8192) return Promise.reject(new AccessError("BACKEND_UNAVAILABLE", 503));
  return new Promise((resolve, reject) => {
    const fail = () => reject(new AccessError("BACKEND_UNAVAILABLE", 503));
    const req = request({ hostname: "127.0.0.1", port: 8789, path: "/auth/admission", method: "POST", headers: {
      ...headers, Host: origin.host, "X-Forwarded-Proto": "https", "X-Forwarded-For": "127.0.0.1", "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body),
    } }, response => {
      let size = 0;
      response.on("data", chunk => { size += chunk.length; if (size > 8192) req.destroy(); });
      response.on("error", fail);
      response.on("end", () => { if (response.statusCode === 200) resolve(); else if (response.statusCode === 429) reject(new AccessError("RATE_LIMITED", 429)); else fail(); });
    });
    const timer = setTimeout(() => req.destroy(), 8000);
    req.on("error", fail); req.on("close", () => clearTimeout(timer)); req.end(body);
  });
}
