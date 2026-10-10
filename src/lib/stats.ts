import { db } from "@/db";
import { downloads, fetches } from "@/db/schema";
import { engineStatus } from "@/lib/engine";
import type { StatsPayload } from "@/lib/api";
import { sql } from "drizzle-orm";

/**
 * Aggregate counters for the public dashboard. No per-transfer rows are read
 * or returned, so video titles never reach the public API surface.
 */
export async function getStats(): Promise<StatsPayload> {
  const [fetchTotals, downloadTotals, platformFetchRows, platformDownloadRows] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(fetches),
    db.select({
      total: sql<number>`count(*)::int`,
      bytes: sql<number>`coalesce(sum(${downloads.bytesStreamed}), 0)::bigint`,
    }).from(downloads),
    db.select({ platform: fetches.platform, total: sql<number>`count(*)::int` }).from(fetches).groupBy(fetches.platform),
    db.select({ platform: downloads.platform, total: sql<number>`count(*)::int` }).from(downloads).groupBy(downloads.platform),
  ]);

  const downloadByPlatform = new Map(platformDownloadRows.map((row) => [row.platform, Number(row.total)]));
  const platformMap = new Map<string, { platform: string; fetches: number; downloads: number }>();

  for (const row of platformFetchRows) {
    platformMap.set(row.platform, { platform: row.platform, fetches: Number(row.total), downloads: downloadByPlatform.get(row.platform) ?? 0 });
  }
  for (const [platform, total] of downloadByPlatform) {
    if (!platformMap.has(platform)) platformMap.set(platform, { platform, fetches: 0, downloads: Number(total) });
  }

  return {
    totals: {
      fetches: Number(fetchTotals[0]?.total ?? 0),
      downloads: Number(downloadTotals[0]?.total ?? 0),
      bytesStreamed: Number(downloadTotals[0]?.bytes ?? 0),
    },
    platforms: [...platformMap.values()].sort((a, b) => b.fetches + b.downloads - (a.fetches + a.downloads)),
    engine: engineStatus(),
  };
}

export function emptyStats(): StatsPayload {
  return { totals: { fetches: 0, downloads: 0, bytesStreamed: 0 }, platforms: [], engine: engineStatus() };
}
