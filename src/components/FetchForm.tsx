"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, ClipboardPaste, Link2, LoaderCircle, Search, X } from "lucide-react";
import { clsx } from "clsx";
import { PlatformChip } from "./PlatformChip";
import { VideoCardSkeleton } from "./VideoCardSkeleton";
import { downloadsUnavailable, DOWNLOADS_UNAVAILABLE_MESSAGE, postJson, secureGateway, type FetchInfoResponse, type FetchInfoSuccess } from "@/lib/api";
import { DownloadAccess } from "./DownloadAccess";
import { detectPlatform, PLATFORMS, PLATFORM_META, type Platform } from "@/lib/platforms";

// The result card is only needed after a successful extraction.
const VideoCard = dynamic(() => import("./VideoCard").then((module) => module.VideoCard), {
  ssr: false,
  loading: () => <VideoCardSkeleton />,
});

const EXAMPLES = PLATFORMS.filter((id) => PLATFORM_META[id].examples.length > 0)
  .map((id) => ({ id, label: PLATFORM_META[id].name, url: PLATFORM_META[id].examples[0] }));

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
  const canSubmit = detection.ok && !loading;
  // On a platform page, show that platform's link shape rather than a generic one.
  const hint = PLATFORM_META[platform ?? "tiktok"].examples[0] ?? PLATFORM_META.youtube.examples[0];

  useEffect(() => () => requestRef.current?.abort(), []);

  const submit = useCallback(async (raw?: string) => {
    if (downloadsUnavailable) { setError(DOWNLOADS_UNAVAILABLE_MESSAGE); return; }
    const check = detectPlatform(raw ?? value);
    if (!check.ok) {
      setError(check.reason === "empty"
        ? "Paste a video link to get started — YouTube, TikTok, Instagram or X."
        : "That link isn't supported. Copy the address of a single video or Reel, not a profile or photo post.");
      inputRef.current?.focus();
      return;
    }
    if (!authorized) { pending.current = check.url; setVerificationNeeded(true); setError(null); return; }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setValue(check.url);
    setLoading(true); setError(null); setResult(null);setWaiting(null);
    try {
      const payload = await postJson<FetchInfoResponse>("/api/fetch-info", { url: check.url }, controller.signal,notice=>setWaiting(`Waiting in line: position ${notice.position}. Estimated wait ${Math.ceil(notice.estimatedWaitMs/1000)} seconds.`));
      if (controller.signal.aborted) return;
      if (payload.ok) {
        setResult(payload);
        requestAnimationFrame(() => {
          const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          resultsRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "nearest" });
        });
      } else setError(payload.error);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not reach VidFetch. Check your connection and try again.");
    } finally { if (!controller.signal.aborted) {setLoading(false);setWaiting(null);} }
  }, [value, authorized]);

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
      if (!text.trim()) { setError("Your clipboard is empty. Copy a video link first."); return; }
      setValue(text.trim()); setError(null);
      const check = detectPlatform(text);
      if (check.ok) void submit(text);
      else inputRef.current?.focus();
    } catch { setError("Your browser blocked clipboard access. Paste the link into the field instead."); }
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
              placeholder="Paste a video link…" aria-label="Video link" aria-describedby="url-help" aria-invalid={invalid}
              className="h-12 w-full min-w-0 bg-transparent text-[15px] text-white placeholder:text-slate-400 focus:outline-none" />
            {value && (
              <button type="button" onClick={reset} aria-label="Clear link"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white">
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void paste()} disabled={loading}
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm font-medium text-slate-200 transition hover:border-cyan-400/40 hover:text-white disabled:opacity-50 sm:h-11">
              <ClipboardPaste className="h-4 w-4" aria-hidden /> Paste
            </button>
            <button type="submit" disabled={!canSubmit}
              className={clsx("inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl px-7 text-sm font-semibold transition sm:h-11 sm:flex-none",
                canSubmit ? "bg-gradient-to-r from-cyan-400 to-sky-400 text-ink-950 hover:brightness-110 active:scale-[0.98]" : "cursor-not-allowed bg-white/10 text-slate-400")}>
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
              {loading ? "Extracting…" : "Extract"}
            </button>
          </div>
        </div>

        <div className="mt-3 flex min-h-6 flex-wrap items-center justify-center gap-x-3 gap-y-2">
          {value ? <PlatformChip platform={detection.platform} detected={detection.ok} /> : null}
          <p id="url-help" className={clsx("text-xs leading-relaxed", invalid ? "text-amber-300" : "text-slate-400")}>
            {invalid ? <>Links look like <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">{hint}</code></> : "Works with YouTube, TikTok, Instagram Reels and X posts."}
          </p>
        </div>

        {!result && !loading && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className="text-[11px] text-slate-400">Try an example:</span>
            {EXAMPLES.map((example) => (
              <button key={example.id} type="button" disabled={loading} onClick={() => void submit(example.url)}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-40">
                {example.label}
              </button>
            ))}
          </div>
        )}
      </form>

      {verificationNeeded && <DownloadAccess onChange={setAuthorized} />}

      {error && (
        <div role="alert" className="mx-auto mt-5 w-full max-w-3xl animate-rise rounded-2xl border border-red-400/25 bg-red-500/[0.08] p-4">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-300" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-red-100">We couldn&apos;t get this video</p>
              <p className="mt-1 text-sm leading-relaxed text-red-200/85">{error}</p>
              {detection.ok && (
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
                  <button type="button" onClick={() => void submit()} disabled={loading} className="font-semibold text-white underline-offset-4 hover:underline">Try again</button>
                  <a href={detection.url} target="_blank" rel="noopener noreferrer nofollow" className="text-red-200 underline-offset-4 hover:text-white hover:underline">Open the original post</a>
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
