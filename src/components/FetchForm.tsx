"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, ClipboardPaste, Link2, LoaderCircle, Search, X } from "lucide-react";
import { clsx } from "clsx";
import { PlatformChip } from "./PlatformChip";
import { VideoCardSkeleton } from "./VideoCardSkeleton";
import { downloadsUnavailable, postJson, secureGateway, type FetchInfoResponse, type FetchInfoSuccess } from "@/lib/api";
import { useI18n } from "@/i18n/context";
import { interpolate } from "@/i18n/config";
import { errorMessage } from "@/i18n/errors";
import { DownloadAccess } from "./DownloadAccess";
import { detectPlatform, PLATFORM_META, type Platform } from "@/lib/platforms";
import { YOUTUBE_NOTICE } from "@/lib/youtube-notice";
import { FORM_COPY, TIKTOK_LINK_SHAPES } from "@/lib/form-copy";

// The result card is only needed after a successful extraction.
const VideoCard = dynamic(() => import("./VideoCard").then((module) => module.VideoCard), {
  ssr: false,
  loading: () => <VideoCardSkeleton />,
});

/**
 * Reads a shared link from the address bar on first paint.
 *
 * Supports `?url=` and the `?text=` field that Android's share sheet sends
 * through the manifest share target, where the URL is often wrapped in a
 * caption. Parsed client-side so it still works in the static export.
 */
function sharedLink(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  for (const key of ["url", "u", "text", "link"]) {
    const value = params.get(key);
    if (value && detectPlatform(value).ok) return value;
  }
  return null;
}

export function FetchForm({ compact = false, platform }: { compact?: boolean; platform?: Platform }) {
  const { messages: d, locale } = useI18n();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FetchInfoSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(!secureGateway);
  const [verificationNeeded, setVerificationNeeded] = useState(false);
  const pending = useRef<string | null>(null);
  const [waiting,setWaiting]=useState<string|null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const detection = useMemo(() => detectPlatform(value), [value]);
  const invalid = value.trim().length > 0 && !detection.ok;
  // A YouTube link is answered at once, in the page: no verification, no request to the server.
  const youtube = detection.ok && detection.platform === "youtube";
  const canSubmit = detection.ok && !youtube && !loading;
  // On a platform page, show that platform's link shape rather than a generic one.
  const hint = PLATFORM_META[platform ?? "tiktok"].examples[0] ?? PLATFORM_META.tiktok.examples[0];
  // TikTok is the platform validated on our hosting: the TikTok pages speak only of TikTok links. A language without
  // reviewed form copy keeps the published dictionary line.
  const form = FORM_COPY[locale], supported = (platform === "tiktok" ? form?.tiktokHint : form?.supportedHint) ?? d.supportedHint;

  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    const expired = () => { setAuthorized(false); setVerificationNeeded(true); };
    window.addEventListener("vidfetch-access-required", expired);
    return () => window.removeEventListener("vidfetch-access-required", expired);
  }, []);

  const submit = useCallback(async (raw?: string) => {
    if (downloadsUnavailable) { setError(d.backendUnavailable); return; }
    const check = detectPlatform(raw ?? value);
    if (!check.ok) {
      setError(check.reason === "empty"
        ? d.emptyLink
        : d.invalidLink);
      inputRef.current?.focus();
      return;
    }
    if (check.platform === "youtube") { setValue(check.url); setError(null); setResult(null); return; }
    if (!authorized) { pending.current = check.url; setVerificationNeeded(true); setError(null); return; }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setValue(check.url);
    setLoading(true); setError(null); setResult(null);setWaiting(null);
    try {
      const payload = await postJson<FetchInfoResponse>("/api/fetch-info", { url: check.url }, controller.signal,notice=>setWaiting(interpolate(d.waiting, { position: notice.position, seconds: Math.ceil(notice.estimatedWaitMs/1000) })));
      if (controller.signal.aborted) return;
      if (payload.ok) {
        setResult(payload);
        requestAnimationFrame(() => {
          const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          resultsRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "nearest" });
        });
      } else setError(errorMessage(payload.code, d));
    } catch {
      if (!controller.signal.aborted) setError(d.networkError);
    } finally { if (!controller.signal.aborted) {setLoading(false);setWaiting(null);} }
  }, [value, authorized, d]);

  useEffect(() => {
    if (authorized && pending.current) {
      const url = pending.current; pending.current = null;
      const timer = setTimeout(() => { setVerificationNeeded(false); void submit(url); }, 0);
      return () => clearTimeout(timer);
    }
  }, [authorized, submit]);

  // Auto-run a link arriving from a share sheet, bookmark or shared URL.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const shared = sharedLink();
    if (!shared) return;
    const timer = window.setTimeout(() => {
      setValue(shared);
      if (!downloadsUnavailable && !secureGateway) void submit(shared);
      // Clear the query so a refresh doesn't silently re-run the extraction.
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }, 0);
    return () => { window.clearTimeout(timer); started.current = false; };
  }, [submit]);

  function reset() {
    requestRef.current?.abort();
    pending.current = null; setVerificationNeeded(false);
    setValue(""); setResult(null); setError(null); setLoading(false);setWaiting(null);
    inputRef.current?.focus();
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) { setError(d.clipboardEmpty); return; }
      setValue(text.trim()); setError(null);
      const check = detectPlatform(text);
      if (check.ok) void submit(text);
      else inputRef.current?.focus();
    } catch { setError(d.clipboardBlocked); }
  }

  return (
    <>

      {waiting&&<p role="status" className="mx-auto mt-4 max-w-3xl text-sm text-slate-300">{waiting}</p>}
      <form onSubmit={(event) => { event.preventDefault(); if (!loading) void submit(); }}
        className={clsx("mx-auto w-full max-w-3xl", compact ? "mt-7" : "mt-8")}>
        <div className={clsx("flex flex-col gap-2 rounded-2xl p-2 ring-1 transition-colors duration-200 sm:flex-row sm:items-center",
          "glass-strong shadow-[0_24px_70px_-40px_rgba(34,211,238,0.2)]",
          invalid ? "ring-amber-400/40" : detection.ok ? "ring-cyan-400/50" : "ring-white/10 focus-within:ring-cyan-400/50")}>
          <div className="flex flex-1 items-center gap-2.5 px-2">
            <Link2 className={clsx("h-5 w-5 shrink-0 transition-colors", detection.ok ? "text-cyan-300" : "text-slate-400")} aria-hidden />
            <input ref={inputRef} value={value} onChange={(event) => { setValue(event.target.value); if (error) setError(null); }}
              type="url" inputMode="url" autoComplete="off" spellCheck={false} maxLength={4096} enterKeyHint="go"
              placeholder={d.placeholder} aria-label={d.videoLink} dir="ltr" aria-describedby="url-help" aria-invalid={invalid}
              className="h-12 w-full min-w-0 bg-transparent text-[15px] text-white placeholder:text-slate-400 focus:outline-none" />
            {value && (
              <button type="button" onClick={reset} aria-label={d.clear}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white">
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void paste()} disabled={loading}
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm font-medium text-slate-200 transition hover:border-cyan-400/40 hover:text-white disabled:opacity-50 sm:h-11">
              <ClipboardPaste className="h-4 w-4" aria-hidden /> {d.paste}
            </button>
            <button type="submit" disabled={!canSubmit}
              className={clsx("inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl px-7 text-sm font-semibold transition sm:h-11 sm:flex-none",
                canSubmit ? "bg-gradient-to-r from-cyan-400 to-sky-400 text-ink-950 hover:brightness-110 active:scale-[0.98]" : "cursor-not-allowed bg-white/10 text-slate-400")}>
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
              {loading ? d.extracting : d.extract}
            </button>
          </div>
        </div>

        <div className="mt-3 flex min-h-6 flex-wrap items-center justify-center gap-x-3 gap-y-2">
          {value ? <PlatformChip platform={detection.platform} detected={detection.ok} /> : null}
          <p id="url-help" className={clsx("text-xs leading-relaxed", invalid ? "text-amber-300" : "text-slate-400")}>
            {invalid ? <>{d.linkExample} <code dir="ltr" className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">{hint}</code></> : supported}
          </p>
        </div>

        {/* Link shapes as plain text: no example button, so the page never starts a download of someone else's video. */}
        {!result && !loading && (
          <p className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400">
            <span>{d.linkExample}</span>
            {TIKTOK_LINK_SHAPES.map((shape) => <code key={shape} dir="ltr" className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-slate-300">{shape}</code>)}
          </p>
        )}
      </form>

      {youtube && (
        <div role="status" className="mx-auto mt-5 w-full max-w-3xl rounded-2xl border border-amber-400/30 bg-amber-500/[0.07] p-4">
          <p className="text-sm font-semibold text-amber-100">{YOUTUBE_NOTICE[locale].title}</p>
          <p className="mt-1 text-sm leading-relaxed text-amber-100/85">{YOUTUBE_NOTICE[locale].text}</p>
        </div>
      )}

      {verificationNeeded && !youtube && <DownloadAccess onChange={setAuthorized} />}

      {error && (
        <div role="alert" className="mx-auto mt-5 w-full max-w-3xl animate-rise rounded-2xl border border-red-400/25 bg-red-500/[0.08] p-4">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-300" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-red-100">{d.fetchFailed}</p>
              <p className="mt-1 text-sm leading-relaxed text-red-200/85">{error}</p>
              {detection.ok && (
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
                  <button type="button" onClick={() => void submit()} disabled={loading} className="font-semibold text-white underline-offset-4 hover:underline">{d.retry}</button>
                  <a href={detection.url} target="_blank" rel="noopener noreferrer nofollow" className="text-red-200 underline-offset-4 hover:text-white hover:underline">{d.original}</a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div ref={resultsRef} className="mx-auto mt-8 w-full max-w-5xl scroll-mt-24" aria-live="polite" aria-busy={loading}>
        {loading && <VideoCardSkeleton />}
        {!loading && result && (
          <VideoCard key={`${result.info.platform}:${result.info.platformVideoId}`} info={result.info} engine={result.engine} onReset={reset} />
        )}
      </div>
    </>
  );
}
