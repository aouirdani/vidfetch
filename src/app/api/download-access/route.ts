export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { issueDownloadAccess as POST } from "@/server/download-access";
import { publicMediaConfiguration } from "@/server/media-config";

/** Public widget configuration is loaded on demand; service keys stay server-side. */
export async function GET() {
  return Response.json(publicMediaConfiguration(), { headers: { "Cache-Control": "no-store" } });
}
