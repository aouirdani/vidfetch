import { NextRequest, NextResponse } from "next/server";
/** Canonical URL spelling only; no geo, cookie or automatic language negotiation. */
export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone(), path = url.pathname;
  if (/^\/(?:fr|es|pt|id|de|it|ar)$/.test(path)) { url.pathname += "/"; return NextResponse.redirect(url, 308); }
  if (path !== "/" && path.endsWith("/") && !/^\/(?:fr|es|pt|id|de|it|ar)\/$/.test(path)) { url.pathname = path.replace(/\/+$/, ""); return NextResponse.redirect(url, 308); }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!api|auth|download-helper|_next|sitemap.xml|robots.txt|manifest.webmanifest).*)"] };
