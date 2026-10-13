export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { issueDownloadAccess as POST } from "@/server/download-access";

/** Public widget configuration is loaded on demand; service keys stay server-side. */
export async function GET() {
  const available = process.env.VIDFETCH_CONNECTION_READY === "1" && !!process.env.TURNSTILE_SECRET_KEY && !!(process.env.TURNSTILE_SITE_KEY ?? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  return Response.json({ ok: true, available, siteKey: available ? (process.env.TURNSTILE_SITE_KEY ?? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) : "" }, { headers: { "Cache-Control": "no-store" } });
}
