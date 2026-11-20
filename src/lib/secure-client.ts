import type { BrowserKey, RequestProof } from "./access-types";

const encoder = new TextEncoder();
const encode = (value: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...(value instanceof Uint8Array ? value : new Uint8Array(value)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hash = async (value: string) => encode(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
export class DownloadClientError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
export class SecureDownloadClient {
  private pair?: Promise<CryptoKeyPair>;
  private access?: { grant: string; expiresAt: number };
  private renewing?: Promise<void>;
  constructor(readonly origin: string, private issuer: typeof fetch = (input,init)=>fetch(input,init), private transport: typeof fetch = (input,init)=>fetch(input,init), private transferOrigin?: string) {}
  private keys() { return this.pair ??= crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]); }
  async publicKey(): Promise<BrowserKey> {
    const key = await crypto.subtle.exportKey("jwk", (await this.keys()).publicKey);
    return { kty: "EC", crv: "P-256", x: key.x!, y: key.y! };
  }
  async proof(method: string, path: string, body: string, token: string): Promise<string> {
    const payload: RequestProof = { method, path, bodyHash: await hash(body), tokenHash: await hash(token), iat: Math.floor(Date.now() / 1000), jti: crypto.randomUUID() };
    const data = encode(encoder.encode(JSON.stringify(payload)));
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, (await this.keys()).privateKey, encoder.encode(data));
    return `${data}.${encode(signature)}`;
  }
  async authorize(challenge?: string) {
    const key = await this.publicKey(), body = JSON.stringify({ key, challenge: challenge ?? null });
    const proof = await this.proof("POST", "/api/download-access", body, "");
    const response = await this.issuer("/api/download-access", { method: "POST", cache: "no-store", credentials: "same-origin", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, challenge: challenge ?? null, proof }) });
    const access = await response.json() as { ok: boolean; grant: string; expiresAt: number; error?: string; code?: string };
    if (!response.ok || !access.ok) {
      if (access.code === "CHALLENGE_REQUIRED" && typeof window !== "undefined") window.dispatchEvent(new Event("vidfetch-access-required"));
      throw new DownloadClientError(access.code ?? "INVALID_ACCESS", access.code === "CHALLENGE_REQUIRED" ? "Please verify again to continue." : access.error ?? "Verify the download authorization again.");
    }
    this.access = access;
  }
  async grant() {
    if (!this.access || this.access.expiresAt <= Date.now() + 15000) {
      this.renewing ??= this.authorize().finally(() => { this.renewing = undefined; });
      await this.renewing;
    }
    return this.access!.grant;
  }
  async request(path: string, init: RequestInit = {}): Promise<Response> {
    if (!/^\/api\/(?:health|fetch-info|download|queue)(?:\?|$)/.test(path) || path.includes("#") || path.includes("\\") || path.startsWith("//")) throw new Error("Invalid download API path.");
    const actualPath = this.transferOrigin ? path.replace("/api/", "/api/transfer/") : path;
    const grant = await this.grant(), method = init.method ?? "GET", body = typeof init.body === "string" ? init.body : "";
    const headers = new Headers(init.headers); headers.set("Authorization", `Bearer ${grant}`); headers.set("X-VidFetch-Proof", await this.proof(method, actualPath, body, grant));
    try { return await this.transport(`${this.transferOrigin ?? this.origin}${actualPath}`, { ...init, headers, credentials: this.transferOrigin ? "same-origin" : "omit", cache: "no-store", redirect: "error" }); }
    catch { throw new DownloadClientError("BACKEND_UNAVAILABLE", "The secure download service could not be reached. Please try again later."); }
  }
  /** Native attachment in the current tab; the cookie is set by preparation.
   * No blob, iframe, popup, transferable proof, or JavaScript-readable cookie. */
  startTransfer(ticket: string, filename: string) {
    if (!this.transferOrigin || this.transferOrigin !== window.location.origin || !/^[A-Za-z0-9_-]{43}$/.test(ticket)) throw new Error("Invalid transfer destination.");
    const anchor = document.createElement("a");
    anchor.href = `${this.transferOrigin}/api/transfer/download?ticket=${encodeURIComponent(ticket)}`;
    anchor.download = filename;
    anchor.referrerPolicy = "no-referrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
}
