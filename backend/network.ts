import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { EngineError } from "../src/lib/engine";
import { cancellable } from "./async";

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99)))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113));
  }
  // Only global unicast, excluding documentation and transition ranges.
  if (isIP(address) !== 6 || !/^[23][0-9a-f]{3}:/i.test(address)) return false;
  const [first, second] = address.toLowerCase().split(":");
  return !(first === "2001" && (parseInt(second || "0", 16) < 0x200 || second === "db8"))
    && !["2002", "3ffe", "3fff"].includes(first);
}

export async function assertPublicUrl(value: string, signal: AbortSignal, seen = new Set<string>()): Promise<void> {
  let url: URL;
  try { url = new URL(value); } catch { throw new EngineError("INVALID_URL", "The source returned an invalid media URL.", 400); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) {
    throw new EngineError("INVALID_URL", "Only public HTTP media URLs on standard ports are allowed.", 400);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (seen.has(host)) return;
  if (seen.size >= 32) throw new EngineError("ENGINE_ERROR", "The source returned too many media hosts.", 502);
  let addresses: Array<{ address: string }>;
  try { addresses = isIP(host) ? [{ address: host }] : await cancellable(lookup(host, { all: true }), signal); }
  catch {
    signal.throwIfAborted();
    throw new EngineError("ENGINE_ERROR", "The media host could not be resolved.", 503);
  }
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new EngineError("INVALID_URL", "Local, private and reserved network destinations are forbidden.", 400);
  }
  seen.add(host);
}

/** Check URLs that yt-dlp can use in the selected raw metadata, including fragments. */
export async function validateMediaDestinations(raw: Record<string, unknown>, signal: AbortSignal): Promise<void> {
  const seen = new Set<string>();
  let count = 0;
  const visit = async (value: unknown, base?: string, depth = 0): Promise<void> => {
    signal.throwIfAborted();
    if (depth > 12 || ++count > 30000) throw new EngineError("ENGINE_ERROR", "Media metadata is too complex.", 502);
    if (Array.isArray(value)) { for (const item of value) await visit(item, base, depth + 1); return; }
    if (!value || typeof value !== "object") return;
    const entry = value as Record<string, unknown>;
    const nextBase = typeof entry.fragment_base_url === "string" ? entry.fragment_base_url : typeof entry.url === "string" ? entry.url : base;
    for (const [key, item] of Object.entries(entry)) {
      if (["url", "manifest_url", "fragment_base_url"].includes(key) && typeof item === "string") {
        let destination: string;
        try { destination = new URL(item, nextBase).href; }
        catch { throw new EngineError("INVALID_URL", "The source returned an invalid media destination.", 400); }
        await assertPublicUrl(destination, signal, seen);
      } else if (item && typeof item === "object") await visit(item, nextBase, depth + 1);
    }
  };
  await visit(raw);
}
