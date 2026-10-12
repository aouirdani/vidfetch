export type BrowserKey = { kty: "EC"; crv: "P-256"; x: string; y: string };
export type AccessClaims = {
  iss: "vidfetch-access"; aud: string; sub: string; iat: number; exp: number;
  key: BrowserKey; purpose: "api" | "session";
};
export type RequestProof = { iat: number; jti: string; method: string; path: string; bodyHash: string; tokenHash: string };
