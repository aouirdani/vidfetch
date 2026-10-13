import { AccessError } from "./access-crypto";
import { randomUUID } from "node:crypto";

/** Fixed endpoint, bounded reply, no redirects and no token/secret logging. */
export async function verifyTurnstile(token: string, hostname: string, secret: string, send: typeof fetch = fetch): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await send("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/json" }, redirect: "error", signal: controller.signal,
      body: JSON.stringify({ secret, response: token, idempotency_key: randomUUID() }),
    });
    if (!response.ok || !response.body) throw new AccessError("BACKEND_UNAVAILABLE", 503);
    reader = response.body.getReader();
    let bytes = 0, text = ""; const decoder = new TextDecoder();
    while (true) {
      const item = await reader.read(); if (item.done) break;
      bytes += item.value.length; if (bytes > 16384) throw new AccessError("BACKEND_UNAVAILABLE", 503);
      text += decoder.decode(item.value, { stream: true });
    }
    const result = JSON.parse(text + decoder.decode());
    return result?.success === true && result.hostname === hostname && result.action === "vidfetch";
  } catch { throw new AccessError("BACKEND_UNAVAILABLE", 503); }
  finally { clearTimeout(timer); await reader?.cancel().catch(() => {}); }
}
