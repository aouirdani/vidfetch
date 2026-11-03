"use client";

import { useEffect, useRef, useState } from "react";

/** CSS-only decorative stack. The cards are present in server HTML; the observer only pauses its idle motion off-screen. */
export function HeroScene() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || !("IntersectionObserver" in window)) {
      setVisible(true);
      setEntered(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      const inView = entry.isIntersecting;
      setVisible(inView);
      if (inView) setEntered(true);
    }, { threshold: 0.15 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`hero-scene${visible ? " is-visible" : ""}${entered ? " has-entered" : ""}`} aria-hidden="true">
      <div className="hero-scene-float">
        <div className="hero-card hero-card-back"><div className="hero-card-wave" /></div>
        <div className="hero-card hero-card-mid"><div className="hero-card-lines" /></div>
        <div className="hero-card hero-card-front">
          <div className="hero-card-circle" />
          <div className="hero-card-block" />
          <span className="hero-card-play"><svg viewBox="0 0 16 16"><path d="M5 3v10l8-5z" fill="currentColor" /></svg></span>
          <span className="hero-card-caption">TikTok</span>
        </div>
        <div className="hero-token hero-token-video"><span className="hero-token-icon"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" /></svg></span><span><strong>MP4</strong><small>720p video</small></span></div>
        <div className="hero-token hero-token-audio"><span className="hero-token-icon"><svg viewBox="0 0 24 24"><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></svg></span><span><strong>MP3</strong><small>192 kbps</small></span></div>
      </div>
    </div>
  );
}
