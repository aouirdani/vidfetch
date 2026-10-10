import { AudioLines, Check, Download, Film, Play } from "lucide-react";
import { PlatformIcon } from "./PlatformIcon";
import { PLATFORM_META, type Platform } from "@/lib/platforms";

/**
 * A static, clearly-labelled illustration of a finished extraction.
 *
 * Shown before the first search so people can see what they will get. It is
 * deliberately inert: no real metadata, no fake creator names or view counts,
 * and marked `aria-hidden` so assistive tech skips straight to the live form.
 */
const QUALITIES = [
  { label: "1080p", meta: "MP4 · H.264", icon: Film, active: true },
  { label: "720p", meta: "MP4 · H.264", icon: Film, active: false },
  { label: "MP3", meta: "192 kbps audio", icon: AudioLines, active: false },
];

export function SamplePreview({ platform = "tiktok" }: { platform?: Platform }) {
  const meta = PLATFORM_META[platform];

  return (
    <figure className="mx-auto mt-10 w-full max-w-3xl">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-ink-850/60">
        <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Example result</span>
          <span className="ml-auto flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full bg-gradient-to-br ${meta.accent} text-white`}>
              <PlatformIcon platform={platform} className="h-2 w-2" />
            </span>
            {meta.name}
          </span>
        </div>

        <div className="grid gap-5 p-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:p-5">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-gradient-to-br from-cyan-600/30 via-ink-800 to-sky-600/20 sm:aspect-[3/4]">
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
                <Play className="h-4 w-4 translate-x-px fill-white text-white" aria-hidden />
              </span>
            </span>
            <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">0:42</span>
          </div>

          <div className="min-w-0">
            <div className="space-y-2">
              <div className="h-3 w-4/5 rounded-full bg-white/12" />
              <div className="h-3 w-2/5 rounded-full bg-white/8" />
            </div>

            <ul className="mt-4 space-y-2">
              {QUALITIES.map((quality) => (
                <li key={quality.label}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${quality.active ? "border-cyan-400/50 bg-cyan-500/[0.12]" : "border-white/8 bg-white/[0.02]"}`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${quality.active ? "bg-cyan-400 text-ink-950" : "bg-white/5 text-slate-400"}`}>
                    <quality.icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-white">{quality.label}</span>
                    <span className="block text-[10px] text-slate-400">{quality.meta}</span>
                  </span>
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${quality.active ? "border-cyan-400 bg-cyan-400 text-ink-950" : "border-white/15 text-transparent"}`}>
                    <Check className="h-2.5 w-2.5" aria-hidden />
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-sky-400 py-2.5 text-xs font-semibold text-ink-950">
              <Download className="h-3.5 w-3.5" aria-hidden />Download 1080p
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-slate-400">
        After you paste a link you pick the quality — the formats listed are the ones that video actually offers.
      </figcaption>
    </figure>
  );
}
