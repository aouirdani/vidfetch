import type { BrowserKey, RequestProof } from "./access-types";

const encoder = new TextEncoder();
const encode = (value: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...(value instanceof Uint8Array ? value : new Uint8Array(value)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hash = async (value: string) => encode(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
export class SecureDownloadClient {
  private pair?: Promise<CryptoKeyPair>;
  private access?: { grant: string; expiresAt: number };
  private renewing?: Promise<void>;
  constructor(readonly origin: string, private issuer: typeof fetch = (input,init)=>fetch(input,init), private transport: typeof fetch = (input,init)=>fetch(input,init)) {}
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
    const access = await response.json() as { ok: boolean; grant: string; expiresAt: number; error?: string };
    if (!response.ok || !access.ok) throw new Error(access.error ?? "Verify the download authorization again.");
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
    const grant = await this.grant(), method = init.method ?? "GET", body = typeof init.body === "string" ? init.body : "";
    const headers = new Headers(init.headers); headers.set("Authorization", `Bearer ${grant}`); headers.set("X-VidFetch-Proof", await this.proof(method, path, body, grant));
    try { return await this.transport(`${this.origin}${path}`, { ...init, headers, credentials: "omit", cache: "no-store", redirect: "error" }); }
    catch { throw new Error("The secure download service could not be reached. Please try again later."); }
  }
  /** Called synchronously on a user gesture, before awaiting preparation. */
  openTransfer() {
    const popup = window.open(`${this.origin}/download-helper`, "_blank");
    if (!popup) throw new Error("Allow the download window in your browser and try again.");
    let dispose = () => {};
    const ready = new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => { dispose(); reject(new Error("The download window could not connect.")); }, 15000);
      const listener = (event: MessageEvent) => { if (event.source === popup && event.origin === this.origin && event.data?.type === "vidfetch-helper-ready") { dispose(); resolve(); } };
      dispose = () => { window.clearTimeout(timer); window.removeEventListener("message", listener); };
      window.addEventListener("message", listener);
    });
    // Prevent a blocked preparation from leaving an unhandled ready rejection.
    void ready.catch(() => {});
    return {
      isOpen:()=>!popup.closed,
      close: () => { dispose(); popup.close(); },
      start: async (ticket: string) => {
        await ready;
        const grant = await this.grant(), body = JSON.stringify({ ticket }), proof = await this.proof("POST", "/auth/transfer", body, grant);
        return new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => { cleanup(); reject(new Error("The download window did not confirm authorization.")); }, 15000);
          const listener = (event: MessageEvent) => {
            if (event.source !== popup || event.origin !== this.origin) return;
            if (event.data?.type === "vidfetch-started") { cleanup(); resolve(); }
            if (event.data?.type === "vidfetch-error") { cleanup(); reject(new Error("Download authorization failed. Please try again.")); }
          };
          const cleanup = () => { clearTimeout(timer); window.removeEventListener("message", listener); };
          window.addEventListener("message", listener); popup.postMessage({ type: "vidfetch-transfer", ticket, grant, proof }, this.origin);
        });
      },
    };
  }
}
