import { request } from "node:http";
import { AccessError } from "./access-crypto";

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
