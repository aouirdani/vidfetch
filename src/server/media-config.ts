import { publicGatewayOrigin } from "../lib/gateway-origin";
import { serviceKey } from "./access-crypto";

/** Runtime configuration: one immutable frontend, no service secrets in its JS. */
export function mediaConfiguration(env: Record<string, string | undefined> = process.env) {
  const siteOrigin = publicGatewayOrigin(env.NEXT_PUBLIC_SITE_URL);
  const gatewayOrigin = publicGatewayOrigin(env.VIDFETCH_TARGET === "ovh" ? env.VIDFETCH_MEDIA_ORIGIN : env.NEXT_PUBLIC_API_ORIGIN);
  const siteKey = env.TURNSTILE_SITE_KEY ?? env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!["ovh", "secure-gateway"].includes(env.VIDFETCH_TARGET ?? "") || env.VIDFETCH_CONNECTION_READY !== "1"
    || !siteOrigin || !gatewayOrigin || !siteKey || !env.TURNSTILE_SECRET_KEY) return null;
  try { return { siteOrigin, gatewayOrigin, siteKey, key: serviceKey(env.VIDFETCH_ACCESS_SIGNING_KEY) }; }
  catch { return null; }
}

export function publicMediaConfiguration(env: Record<string, string | undefined> = process.env) {
  const config = mediaConfiguration(env);
  return { ok: true, available: !!config, siteKey: config?.siteKey ?? "", gatewayOrigin: config?.gatewayOrigin ?? "" };
}
