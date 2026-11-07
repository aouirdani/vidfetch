/** Observation only: no enforcing CSP is added to the application or its local media workers. */
export function applicationSecurityHeaders(apiOrigin?: string | null) {
  const connect = ["'self'", "blob:", "https://challenges.cloudflare.com"];
  if (apiOrigin) connect.push(new URL(apiOrigin).origin);
  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${[...new Set(connect)].join(" ")}`,
    "frame-src 'self' https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "media-src 'self' blob: data: https:",
    "manifest-src 'self'",
    "form-action 'self'",
  ].join("; ");
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Strict-Transport-Security", value: "max-age=31536000" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Content-Security-Policy-Report-Only", value: policy },
  ];
}
