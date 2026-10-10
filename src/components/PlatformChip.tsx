"use client";

import { clsx } from "clsx";
import { PlatformIcon } from "./PlatformIcon";
import { PLATFORM_META, type Platform } from "@/lib/platforms";

export function PlatformChip({
  platform,
  detected,
}: {
  platform: Platform | null;
  detected?: boolean;
}) {
  if (!platform) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
        Paste a link to get started
      </span>
    );
  }

  const meta = PLATFORM_META[platform];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-300",
        detected
          ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100 shadow-[0_0_22px_-8px_rgba(139,92,246,0.9)]"
          : "border-white/10 bg-white/5 text-slate-300",
      )}
    >
      <span
        className={clsx(
          "flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br text-white",
          meta.accent,
        )}
      >
        <PlatformIcon platform={platform} className="h-3 w-3" />
      </span>
      {meta.name}
      {detected && <span className="text-cyan-300">detected</span>}
    </span>
  );
}
