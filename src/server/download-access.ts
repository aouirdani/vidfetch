import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { publicGatewayOrigin } from "../lib/gateway-origin";
import { AccessError, browserKey, keyId, serviceKey, serviceMac, signAccess, verifyAccess, verifyProof } from "./access-crypto";
import { internalAdmissionPost } from "./internal-admission";
import { publicJsonPost } from "./public-request";

const sessionName = "__Host-vidfetch-access";
type Verification = (token: string, hostname: string) => Promise<boolean>;
export function createAccessIssuer(options: { key: Buffer; siteOrigin: string; gatewayOrigin: string; verifyChallenge: Verification; admit?: (request: Request, requestNonce: string, keyHash: string) => Promise<void>; now?: () => number }) {
  return async (request: Request) => {
    const now = options.now?.() ?? Date.now();
    try {
      if (request.headers.get("origin") !== options.siteOrigin) throw new AccessError("FORBIDDEN_ORIGIN", 403);
      if (Number(request.headers.get("content-length") ?? 0) > 8192) throw new AccessError("BODY_TOO_LARGE", 413);
      const reader = request.body?.getReader(); let text = "", size = 0;
      const decoder = new TextDecoder();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AccessError("TIMEOUT", 504)), 10000); });
      try {
        if (reader) while (true) {
          const part = await Promise.race([reader.read(), deadline]);
          if (part.done) break;
          size += part.value.length;
          if (size > 8192) throw new AccessError("BODY_TOO_LARGE", 413);
          text += decoder.decode(part.value, { stream: true });
        }
        text += decoder.decode();
      } finally { clearTimeout(timer); await reader?.cancel().catch(() => {}); }
      let payload: { key?: unknown; challenge?: unknown; proof?: unknown };
      try { payload = JSON.parse(text); } catch { throw new AccessError("INVALID_JSON", 400); }
      const key = browserKey(payload?.key);
      const proof = typeof payload.proof === "string" ? payload.proof : "";
      // Proof signs the key/challenge envelope, without recursively signing itself.
      const verified = verifyProof(proof, key, { method: "POST", path: "/api/download-access", body: JSON.stringify({ key, challenge: payload.challenge ?? null }), token: "" }, now);
      await options.admit?.(request, verified.jti, keyId(key));
      const cookie = request.headers.get("cookie")?.split(";").map(x => x.trim()).find(x => x.startsWith(`${sessionName}=`))?.slice(sessionName.length + 1);
      let subject: string | undefined;
      let sessionIssued = Math.floor(now / 1000), sessionExpiry = sessionIssued + 1800;
      if (cookie) {
        try {
          const c = verifyAccess(cookie, options.key, options.siteOrigin, "session", now);
          if (keyId(c.key) === keyId(key)) { subject = c.sub; sessionIssued = c.iat; sessionExpiry = c.exp; }
        } catch { /* challenge needed */ }
      }
      if (!subject) {
        if (typeof payload.challenge !== "string" || payload.challenge.length > 2048 || !await options.verifyChallenge(payload.challenge, new URL(options.siteOrigin).hostname)) throw new AccessError("CHALLENGE_REQUIRED", 403);
        subject = randomUUID();
      }
      const iat = Math.floor(now / 1000);
      const session = signAccess({ iss: "vidfetch-access", aud: options.siteOrigin, sub: subject, key, iat: sessionIssued, exp: sessionExpiry, purpose: "session" }, options.key);
      const grant = signAccess({ iss: "vidfetch-access", aud: options.gatewayOrigin, sub: subject, key, iat, exp: iat + 120, purpose: "api" }, options.key);
      return Response.json({ ok: true, grant, expiresAt: (iat + 120) * 1000 }, { headers: {
        "Cache-Control": "no-store", "Set-Cookie": `${sessionName}=${session}; Path=/; Max-Age=${sessionExpiry - iat}; HttpOnly; Secure; SameSite=Strict`,
      } });
    } catch (error) {
      const issue = error instanceof AccessError ? error : new AccessError("BACKEND_UNAVAILABLE", 503);
      return Response.json({ ok: false, code: issue.code, error: issue.status === 503 ? "The secure download service is unavailable." : "Download authorization could not be verified." }, { status: issue.status, headers: { "Cache-Control": "no-store" } });
    }
  };
}

export async function issueDownloadAccess(request: Request) {
  const ovh = process.env.VIDFETCH_TARGET === "ovh";
  const siteOrigin = publicGatewayOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  const gatewayOrigin = ovh ? siteOrigin : publicGatewayOrigin(process.env.NEXT_PUBLIC_API_ORIGIN);
  if (!ovh && process.env.VIDFETCH_TARGET !== "secure-gateway" || process.env.VIDFETCH_CONNECTION_READY !== "1" || !gatewayOrigin || !siteOrigin || !process.env.TURNSTILE_SECRET_KEY) {
    return Response.json({ ok: false, code: "BACKEND_UNAVAILABLE", error: "The secure download service is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const key = serviceKey(process.env.VIDFETCH_ACCESS_SIGNING_KEY);
    return createAccessIssuer({ key, siteOrigin, gatewayOrigin, admit: async (req, requestNonce, keyHash) => {
      const ip = req.headers.get("x-forwarded-for");
      if (!ip || !isIP(ip)) throw new AccessError("BACKEND_UNAVAILABLE",503);
      const normalized=isIP(ip)===6?new URL(`http://[${ip}]`).hostname:ip;
      const body=JSON.stringify({ identity:createHmac("sha256",key).update(normalized).digest("base64url"),requestNonce,keyHash }), timestamp=String(Date.now()),nonce=randomUUID();
      await (ovh ? internalAdmissionPost : publicJsonPost)(new URL("/auth/admission",gatewayOrigin),body,{"X-VidFetch-Service-Time":timestamp,"X-VidFetch-Service-Nonce":nonce,"X-VidFetch-Service-MAC":serviceMac(key,body,timestamp,nonce)});
    }, verifyChallenge: async (token, hostname) => {
      const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST", headers: { "Content-Type": "application/json" }, redirect: "error", signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: token, idempotency_key: randomUUID() }),
      });
      const result = await response.json() as { success?: boolean; hostname?: string; action?: string };
      return response.ok && result.success === true && result.hostname === hostname && result.action === "vidfetch";
    } })(request);
  } catch { return Response.json({ ok: false, code: "BACKEND_UNAVAILABLE", error: "The secure download service is unavailable." }, { status: 503 }); }
}
