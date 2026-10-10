"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const StatsPanel = dynamic(() => import("./StatsPanel").then((module) => module.StatsPanel), {
  ssr: false,
  loading: () => <StatsSkeleton />,
});

function StatsSkeleton() {
  return (
    <div className="mt-6 space-y-4" aria-hidden>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => <div key={index} className="skeleton h-[104px] rounded-2xl" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="skeleton h-56 rounded-2xl" /><div className="skeleton h-56 rounded-2xl" />
      </div>
    </div>
  );
}

/**
 * Below-the-fold statistics: the chunk and its network request are deferred
 * until the panel is close to the viewport, keeping it off the critical path.
 */
export function ActivityPanel() {
  const [visible, setVisible] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = anchor.current;
    if (!node || visible) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "300px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return <div ref={anchor}>{visible ? <StatsPanel /> : <StatsSkeleton />}</div>;
}
