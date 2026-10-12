"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/context";
import { authorizeDownloads } from "@/lib/api";

type Turnstile = { render(element: HTMLElement, options: { sitekey: string; language: string; action: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void }): string; remove(id: string): void; reset(id: string): void };
declare global { interface Window { turnstile?: Turnstile } }
export function DownloadAccess({ onChange }: { onChange: (ready: boolean) => void }) {
  const { locale, messages: d } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState(d.verifyDescription);
  const resetWidget = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true, widget: string | undefined, siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
    const ready = () => {
      if (!alive || !container.current || !window.turnstile || widget) return;
      widget = window.turnstile.render(container.current, { sitekey: siteKey, language: locale === "pt-BR" ? "pt-br" : locale, action: "vidfetch",
        callback: (token) => { void authorizeDownloads(token).then(() => { if (alive) { setMessage(d.verified); onChange(true); } }).catch(() => { if (alive) { setMessage(d.verifyFailed); onChange(false); } }); },
        "expired-callback": () => { if (alive) { setMessage(d.verifyAgain); onChange(false); } },
        "error-callback": () => { if (alive) { setMessage(d.verifyFailed); onChange(false); } },
      });
      resetWidget.current=()=>{if(widget){onChange(false);window.turnstile?.reset(widget);}};
    };
    const failed=()=>{if(alive){setMessage(d.verifyFailed);onChange(false);}};
    let script: HTMLScriptElement | null = null;
    const controller = new AbortController();
    void fetch("/api/download-access", { cache: "no-store", signal: controller.signal }).then(r => r.json()).then(config => {
      if (!alive) return;
      siteKey = config.available ? config.siteKey : "";
      if (!siteKey) { setMessage(d.backendUnavailable); onChange(false); return; }
      script = document.querySelector<HTMLScriptElement>('script[data-vidfetch-turnstile]');
      if (!script) { script = document.createElement("script"); script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; script.async = true; script.dataset.vidfetchTurnstile = "1"; document.head.append(script); }
      script.addEventListener("load", ready); script.addEventListener("error",failed); ready();
    }).catch(() => { if (alive) failed(); });
    return () => { alive = false; controller.abort(); resetWidget.current=()=>{};script?.removeEventListener("load", ready);script?.removeEventListener("error",failed); if (widget) window.turnstile?.remove(widget); };
  }, [onChange, d, locale]);
  return <div className="mx-auto mt-5 max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-4"><p role="status" className="mb-3 text-sm text-slate-300">{message}</p><div ref={container} /><button type="button" className="mt-2 text-sm text-slate-300 underline" onClick={()=>resetWidget.current()}>{d.verifyAgain}</button></div>;
}
