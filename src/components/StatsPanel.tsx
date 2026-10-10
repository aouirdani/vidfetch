"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, HardDriveDownload, RotateCw, Server, Zap } from "lucide-react";
import { clsx } from "clsx";
import { getJson, type StatsPayload } from "@/lib/api";
import { formatBytes } from "@/lib/media";
import { PLATFORM_META, type Platform } from "@/lib/platforms";
import { PlatformIcon } from "@/components/PlatformIcon";

const PLATFORM_ORDER: Platform[] = ["youtube", "tiktok", "instagram", "twitter"];
const isPlatform = (value: string): value is Platform => (PLATFORM_ORDER as string[]).includes(value);
const EMPTY: StatsPayload = { totals: { fetches: 0, downloads: 0, bytesStreamed: 0 }, platforms: [], engine: { ytDlp: null, ffmpeg: false } };

export function StatsPanel() {
  const [stats, setStats] = useState<StatsPayload>(EMPTY);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const payload = await getJson<StatsPayload>("/api/stats");
      if (payload?.totals) { setStats(payload); setLoaded(true); }
    } catch { /* keep the previous snapshot */ } finally { setRefreshing(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Refresh after a transfer and only while the tab is visible.
  useEffect(() => {
    const onTransfer = () => void refresh();
    window.addEventListener("vidfetch:transfer", onTransfer);
    let timer: ReturnType<typeof setInterval> | undefined;
    const schedule = () => {
      clearInterval(timer);
      if (document.visibilityState === "visible") timer = setInterval(() => void refresh(), 60_000);
    };
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", schedule);
      window.removeEventListener("vidfetch:transfer", onTransfer);
    };
  }, [refresh]);

  const cards = [
    { label: "Links analyzed", value: stats.totals.fetches.toLocaleString("en-US"), icon: Activity },
    { label: "Downloads started", value: stats.totals.downloads.toLocaleString("en-US"), icon: HardDriveDownload },
    { label: "Data transferred", value: formatBytes(stats.totals.bytesStreamed) ?? "0 B", icon: Zap },
    { label: "Engine", value: stats.engine.ytDlp ? `yt-dlp ${stats.engine.ytDlp}` : "Checking…", icon: Server },
  ];
  const busiest = Math.max(1, ...stats.platforms.map((row) => row.fetches + row.downloads));
  const ranked = PLATFORM_ORDER.map((platform) => stats.platforms.find((row) => row.platform === platform)
    ?? { platform, fetches: 0, downloads: 0 });

  return (
    <div className="mt-8">
      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="min-w-0 rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <card.icon className="h-4 w-4 shrink-0 text-violet-300" aria-hidden />
              <dt className="truncate text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{card.label}</dt>
            </div>
            <dd className={clsx("mt-2.5 truncate text-xl font-semibold tabular-nums text-white sm:text-2xl", !loaded && "animate-pulse text-slate-600")}>
              {loaded ? card.value : "—"}
            </dd>
          </div>
        ))}
      </dl>

      <section className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-5 sm:p-6" aria-labelledby="platform-split">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="platform-split" className="text-sm font-semibold text-white">Activity by platform</h3>
          <button type="button" onClick={() => void refresh()} disabled={refreshing}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-medium text-slate-300 transition hover:border-violet-400/40 hover:text-white disabled:opacity-60">
            <RotateCw className={clsx("h-3.5 w-3.5", refreshing && "animate-spin")} aria-hidden />
            Refresh
          </button>
        </div>
        <ul className="mt-5 space-y-4">
          {ranked.map((row) => {
            const platform = isPlatform(row.platform) ? row.platform : null;
            const meta = platform ? PLATFORM_META[platform] : null;
            const total = row.fetches + row.downloads;
            return (
              <li key={row.platform} className="flex items-center gap-3">
                <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white", meta?.accent ?? "from-slate-600 to-slate-700")}>
                  {platform ? <PlatformIcon platform={platform} className="h-4 w-4" /> : <Activity className="h-4 w-4" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium text-white">{meta?.name ?? row.platform}</span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-400">
                      <span className="text-white">{row.downloads}</span> downloads
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/8">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500 transition-[width] duration-700"
                      style={{ width: total > 0 ? `${Math.max(4, (total / busiest) * 100)}%` : "0%" }} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-5 border-t border-white/5 pt-4 text-xs leading-relaxed text-slate-400">
          Aggregate counters only. VidFetch does not publish the titles or links of individual downloads.
        </p>
      </section>
    </div>
  );
}
