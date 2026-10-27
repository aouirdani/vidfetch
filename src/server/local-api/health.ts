import { getDb } from "@/db";
import { sql } from "drizzle-orm";
import { engineStatus } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({
      ok: true,
      service: "VidFetch",
      engine: engineStatus(),
      timestamp: new Date().toISOString(),
    });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
