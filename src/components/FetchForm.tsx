"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardPaste, Download, Link2, LoaderCircle } from "lucide-react";
import { VideoCardSkeleton } from "./VideoCardSkeleton";
import { downloadsUnavailable, postJson, secureGateway, type FetchInfoResponse, type FetchInfoSuccess } from "@/lib/api";
import { useI18n } from "@/i18n/context";
import { interpolate } from "@/i18n/config";
import { errorMessage } from "@/i18n/errors";
import { DownloadAccess } from "./DownloadAccess";
import { detectPlatform, type Platform } from "@/lib/platforms";
import { TIKTOK_LINK_SHAPES, type FormCopy, type InputCopy } from "@/lib/form-copy";

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

export function FetchForm({ formCopy, inputCopy, permission }: { compact?: boolean; platform?: Platform; formCopy: FormCopy; inputCopy: InputCopy; permission: string }) {
  const { messages: d } = useI18n();
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
  const message = error ?? waiting ?? (value.trim()
    ? detection.ok && detection.platform === "tiktok" ? inputCopy.recognized : formCopy.supportedHint
    : null);
  const messageState = error ? "error" : waiting ? "waiting" : !value.trim() ? "idle" : detection.ok && detection.platform === "tiktok" ? "recognized" : "invalid";

  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    const expired = () => { setAuthorized(false); setVerificationNeeded(true); };
    window.addEventListener("vidfetch-access-required", expired);
    return () => window.removeEventListener("vidfetch-access-required", expired);
  }, []);

  const submit = useCallback(async (raw?: string) => {
    const check = detectPlatform(raw ?? value);
    if (!check.ok) {
      setError(check.reason === "empty"
        ? inputCopy.empty
        : formCopy.supportedHint);
      inputRef.current?.focus();
      return;
    }
    if (check.platform === "youtube") { setValue(check.url); setError(formCopy.supportedHint); setResult(null); return; }
    if (downloadsUnavailable) { setError(d.backendUnavailable); return; }
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
  }, [value, authorized, d, formCopy, inputCopy]);

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
      inputRef.current?.focus();
    } catch { setError(d.clipboardBlocked); }
  }

  return (
    <>

      <form noValidate onSubmit={(event) => { event.preventDefault(); if (!loading) void submit(); }}
        data-ready={result ? "true" : "false"} className="fetch-form">
        <label htmlFor="vidfetch-url" className="sr-only">{d.videoLink}</label>
        <div className="fetch-control" data-input-control>
          <span className="fetch-plinth" aria-hidden="true" />
          <div className="fetch-surface">
            <span className="fetch-badge fetch-badge-video" aria-hidden="true">{inputCopy.videoBadge}</span>
            <span className="fetch-badge fetch-badge-audio" aria-hidden="true">{inputCopy.audioBadge}</span>
            <div className="fetch-shell">
              <div className="fetch-entry">
                <Link2 aria-hidden="true" />
                <input id="vidfetch-url" ref={inputRef} value={value} onChange={(event) => { setValue(event.target.value); if (error) setError(null); }}
                  type="url" inputMode="url" autoComplete="off" spellCheck={false} maxLength={4096} enterKeyHint="go"
                  placeholder={inputCopy.placeholder} aria-label={d.videoLink} dir="ltr" aria-describedby="url-help" aria-invalid={invalid || youtube} />
              </div>
              <button type="button" className="fetch-paste" onClick={() => void paste()} disabled={loading} aria-label={d.paste}>
                <ClipboardPaste aria-hidden="true" /><span>{d.paste}</span>
              </button>
              <button type="submit" className="fetch-submit" disabled={loading} aria-busy={loading}>
                {loading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
                <span>{loading ? d.extracting : d.download}</span>
              </button>
            </div>
          </div>
        </div>
        <div id="url-help" className="fetch-help" role="status" aria-live="polite" aria-atomic="true" data-state={messageState}>
          {message ?? <>{inputCopy.idle}{" "}{TIKTOK_LINK_SHAPES.slice(0, 2).map((shape, i) => <span key={shape}>{i > 0 && ", "}<bdi dir="ltr">{shape}</bdi></span>)}</>}
        </div>
        <ul className="fetch-trust">{inputCopy.trust.map(text => <li key={text}><Check aria-hidden="true" />{text}</li>)}</ul>
        <p className="fetch-permission">{permission}</p>
      </form>

      {verificationNeeded && !youtube && <DownloadAccess onChange={setAuthorized} />}
      {error && detection.ok && !youtube && <div className="fetch-recovery">
        <button type="button" onClick={() => void submit()} disabled={loading}>{d.retry}</button>
        <a href={detection.url} target="_blank" rel="noopener noreferrer nofollow">{d.original}</a>
      </div>}

      <div ref={resultsRef} className="fetch-results mx-auto mt-8 w-full max-w-5xl scroll-mt-24" aria-live="polite" aria-busy={loading}>
        {loading && <VideoCardSkeleton />}
        {!loading && result && (
          <VideoCard key={`${result.info.platform}:${result.info.platformVideoId}`} info={result.info} engine={result.engine} onReset={reset} />
        )}
      </div>
    </>
  );
}
