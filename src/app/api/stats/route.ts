import { getStats, emptyStats } from "@/lib/stats";
import type { StatsPayload } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload: StatsPayload = await getStats();
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[vidfetch] stats failed", error);
    return Response.json(emptyStats(), { status: 200 });
  }
}
