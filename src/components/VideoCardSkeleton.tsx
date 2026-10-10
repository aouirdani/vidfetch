/**
 * Mirrors the real card's grid and heights so swapping it in causes no layout shift.
 * Kept in its own module to keep the interactive card in a separate lazy chunk.
 */
export function VideoCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-ink-850/80" role="status" aria-label="Loading video details">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="skeleton aspect-video rounded-none lg:aspect-auto lg:min-h-[360px]" />
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="space-y-2.5">
            <div className="skeleton h-5 w-4/5" />
            <div className="skeleton h-3.5 w-2/5" />
          </div>
          <div className="skeleton h-11 w-48 rounded-xl" />
          <div className="space-y-2">
            {[0, 1, 2, 3].map((index) => <div key={index} className="skeleton h-[60px] w-full rounded-xl" />)}
          </div>
          <div className="mt-auto space-y-3">
            <div className="skeleton h-[52px] w-full rounded-2xl" />
            <div className="skeleton mx-auto h-3 w-56" />
          </div>
        </div>
      </div>
      <span className="sr-only">Finding available video and audio formats…</span>
    </div>
  );
}
