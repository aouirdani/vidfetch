"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { apiUrl } from "@/lib/api";

/**
 * Tiny client island so the rest of the header stays server-rendered.
 * One idle-time request, no polling: the badge is informational only.
 */
export function EngineBadge() {
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");

  useEffect(() => {
    const controller = new AbortController();
    const check = async () => {
      try {
        const response = await fetch(apiUrl("/api/health"), { cache: "no-store", signal: controller.signal });
        const data = (await response.json()) as { ok?: boolean; engine?: { ytDlp?: string | null } };
        setStatus(data.ok && data.engine?.ytDlp ? "online" : "offline");
      } catch {
        if (!controller.signal.aborted) setStatus("offline");
      }
    };
    const idle = typeof window.requestIdleCallback === "function"
      ? window.requestIdleCallback(() => void check(), { timeout: 2500 })
      : window.setTimeout(() => void check(), 1200);
    return () => {
      controller.abort();
      if (typeof window.cancelIdleCallback === "function" && typeof idle === "number") window.cancelIdleCallback(idle);
      else window.clearTimeout(idle as number);
    };
  }, []);

  return (
    <span
      className={clsx("hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium sm:inline-flex",
        status === "online" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/5 text-slate-400")}
      role="status"
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", status === "online" ? "bg-emerald-400" : "bg-slate-500")} aria-hidden />
      {status === "online" ? "Engine online" : status === "checking" ? "Checking engine…" : "Engine unavailable"}
    </span>
  );
}
