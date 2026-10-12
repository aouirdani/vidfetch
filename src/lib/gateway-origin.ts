/** A public HTTPS origin, never a path, IP literal, local host or credentials. */
export function publicGatewayOrigin(value: string | undefined): string | null {
  try {
    const url = new URL(value?.trim() ?? "");
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash
      || !host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") || host.endsWith(".")
      || /(?:^|\.)(?:localhost|local|internal|invalid)$/.test(host) || host.endsWith(".home.arpa")) return null;
    return url.origin;
  } catch { return null; }
}
