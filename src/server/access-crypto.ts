import { createHash, createHmac, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import type { AccessClaims, BrowserKey, RequestProof } from "../lib/access-types";

export class AccessError extends Error {
  constructor(public code: string, public status = 401) { super(code); }
}
export const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("base64url");
export function serviceKey(value: string | undefined): Buffer {
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new AccessError("BACKEND_UNAVAILABLE", 503);
  const key = Buffer.from(value, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== value) throw new AccessError("BACKEND_UNAVAILABLE", 503);
  return key;
}
export function browserKey(value: unknown): BrowserKey {
  const k = value as BrowserKey & { d?: string };
  if (!k || k.kty !== "EC" || k.crv !== "P-256" || k.d || !/^[A-Za-z0-9_-]{43}$/.test(k.x ?? "") || !/^[A-Za-z0-9_-]{43}$/.test(k.y ?? "")) throw new AccessError("INVALID_PROOF");
  const result: BrowserKey = { kty: "EC", crv: "P-256", x: k.x, y: k.y };
  try { createPublicKey({ key: result, format: "jwk" }); } catch { throw new AccessError("INVALID_PROOF"); }
  return result;
}
export const keyId = (key: BrowserKey) => digest(JSON.stringify(browserKey(key)));
export function serviceMac(key: Buffer, body: Buffer | string, timestamp: string, nonce: string) {
  return createHmac("sha256", key).update(JSON.stringify({ timestamp, nonce, body: digest(body) })).digest("base64url");
}
export function verifyServiceMac(key: Buffer, body: Buffer, timestamp: string, nonce: string, mac: string) {
  if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 30000 || !/^[a-f0-9-]{36}$/.test(nonce)) throw new AccessError("INVALID_ACCESS");
  const a = Buffer.from(serviceMac(key, body, timestamp, nonce)), b = Buffer.from(mac);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new AccessError("INVALID_ACCESS");
}
function decode(value: string): unknown {
  if (!value || value.length > 6000 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new AccessError("INVALID_ACCESS");
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")); } catch { throw new AccessError("INVALID_ACCESS"); }
}
export function signAccess(claims: AccessClaims, key: Buffer): string {
  const data = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`;
  return `${data}.${createHmac("sha256", key).update(data).digest("base64url")}`;
}
export function verifyAccess(token: string, key: Buffer, audience: string, purpose: AccessClaims["purpose"], now = Date.now()): AccessClaims {
  if (token.length > 6000) throw new AccessError("INVALID_ACCESS");
  const parts = token.split(".");
  if (parts.length !== 3) throw new AccessError("INVALID_ACCESS");
  const header = decode(parts[0]) as { alg?: string; typ?: string };
  if (!header || header.alg !== "HS256" || header.typ !== "JWT") throw new AccessError("INVALID_ACCESS");
  const signature = Buffer.from(parts[2], "base64url"), expected = createHmac("sha256", key).update(`${parts[0]}.${parts[1]}`).digest();
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw new AccessError("INVALID_ACCESS");
  const c = decode(parts[1]) as AccessClaims, seconds = Math.floor(now / 1000);
  if (!c || c.iss !== "vidfetch-access" || c.aud !== audience || c.purpose !== purpose || !/^[a-f0-9-]{36}$/.test(c.sub ?? "")
    || !Number.isInteger(c.iat) || !Number.isInteger(c.exp) || c.iat > seconds + 10 || c.exp <= seconds || c.exp <= c.iat || c.exp - c.iat > (purpose === "api" ? 120 : 1800)) throw new AccessError("EXPIRED_ACCESS");
  c.key = browserKey(c.key);
  return c;
}
/** Application PoP, not an assertion of RFC DPoP compliance; binds the body too. */
export function verifyProof(value: string, key: BrowserKey, request: { method: string; path: string; body: Buffer | string; token: string }, now = Date.now()): RequestProof {
  const parts = value.split(".");
  if (parts.length !== 2 || value.length > 2000) throw new AccessError("INVALID_PROOF");
  const proof = decode(parts[0]) as RequestProof;
  if (!proof || Math.abs(Math.floor(now / 1000) - proof.iat) > 30 || !Number.isInteger(proof.iat) || !/^[a-f0-9-]{36}$/.test(proof.jti ?? "")
    || proof.method !== request.method || proof.path !== request.path || proof.bodyHash !== digest(request.body) || proof.tokenHash !== digest(request.token)) throw new AccessError("INVALID_PROOF");
  let valid = false;
  try { valid = verify("sha256", Buffer.from(parts[0]), { key: createPublicKey({ key: browserKey(key), format: "jwk" }), dsaEncoding: "ieee-p1363" }, Buffer.from(parts[1], "base64url")); } catch { /* invalid key/signature */ }
  if (!valid) throw new AccessError("INVALID_PROOF");
  return proof;
}
