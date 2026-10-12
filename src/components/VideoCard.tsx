"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AudioLines, Check, CircleAlert, CircleCheck, Clock, Download, ExternalLink, Eye, Film, LoaderCircle, RotateCw, Sparkles, User } from "lucide-react";
import { clsx } from "clsx";
import { PlatformIcon } from "./PlatformIcon";
import { PLATFORM_META } from "@/lib/platforms";
import { formatBytes, prettyCodec, type MediaFormat, type MediaInfo } from "@/lib/media";
import { apiFetch, apiUrl, openSecureTransfer, postJson, type DownloadResponse, type DownloadStatusResponse, type EngineStatus } from "@/lib/api";

import { DownloadClientError } from "@/lib/secure-client";
import { useI18n } from "@/i18n/context";
import { interpolate, LANGUAGES } from "@/i18n/config";
import { errorMessage } from "@/i18n/errors";
import type { Messages } from "@/i18n/dictionaries";
import { localizedFormatLabel } from "@/i18n/formats";

function formatLabel(f: MediaFormat, d: Messages) {
  return localizedFormatLabel(f, d);
}

type Props = { info: MediaInfo; engine: EngineStatus; onReset: () => void };
type Notice = { text: string; tone: "info" | "success" | "error" };
type Stage = "idle" | "preparing" | "streaming";


function FormatRow({ format, active, hasSeparateAudio, onSelect, onKeyDown, innerRef }: {
  format: MediaFormat; active: boolean; hasSeparateAudio: boolean;
  onSelect: () => void; onKeyDown: (event: React.KeyboardEvent) => void;
  innerRef: (node: HTMLButtonElement | null) => void;
}) {
  const { messages: d } = useI18n();
  const codec = prettyCodec(format.kind === "audio" ? format.acodec : format.vcodec);
  const details = [format.ext.toUpperCase(), codec, format.filesizeLabel && `≈ ${format.filesizeLabel}`].filter(Boolean);
  return (
    <button ref={innerRef} type="button" onClick={onSelect} onKeyDown={onKeyDown} role="radio" aria-checked={active} tabIndex={active ? 0 : -1}
      className={clsx("group flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-start transition-colors duration-150 min-h-[60px]",
        active ? "border-cyan-400/60 bg-cyan-500/[0.12]" : "border-white/8 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]")}>
      <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
        active ? "bg-cyan-400 text-ink-950" : "bg-white/5 text-slate-400 group-hover:text-slate-200")}>
        {format.kind === "audio" ? <AudioLines className="h-4 w-4" aria-hidden /> : <Film className="h-4 w-4" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-white"><bdi dir="ltr">{formatLabel(format, d)}</bdi></span>
          {format.recommended && (
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-200">
              <Sparkles className="h-2.5 w-2.5" aria-hidden />{d.best}
            </span>
          )}
        </span>
        <span className="mt-1 block truncate text-[11px] text-slate-400">
          <bdi dir="ltr">{details.join(" · ")}</bdi>
          {format.kind === "video" && !format.hasAudio && (
            <span className="text-amber-300/90"> · {hasSeparateAudio ? d.mergedAudio : d.noAudio}</span>
          )}
        </span>
      </span>
      <span className={clsx("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
        active ? "border-cyan-400 bg-cyan-400 text-ink-950" : "border-white/20 text-transparent")}>
        <Check className="h-3 w-3" aria-hidden />
      </span>
    </button>
  );
}

export function VideoCard({ info, engine, onReset }: Props) {
  const { locale, messages: d } = useI18n();
  const initialTab = info.videoFormats.length ? "video" : "audio";
  const [tab, setTab] = useState<"video" | "audio">(initialTab);
  const [selected, setSelected] = useState<string | null>((initialTab === "video" ? info.videoFormats : info.audioFormats)[0]?.id ?? null);
  const [stage, setStage] = useState<Stage>("idle");
  const [bytes, setBytes] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  const frameRef = useRef<HTMLIFrameElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mounted = useRef(true);
  const frameName = `vidfetch-${useId().replace(/:/g, "")}`;

  const formats = tab === "video" ? info.videoFormats : info.audioFormats;
  const activeFormat = useMemo(() => formats.find((f) => f.id === selected) ?? formats[0] ?? null, [formats, selected]);
  const meta = PLATFORM_META[info.platform];
  const views = info.viewCount == null ? null : new Intl.NumberFormat(locale, { notation: "compact" }).format(info.viewCount);
  const hasSeparateAudio = info.formats.some((f) => f.kind === "audio");
  const busy = stage !== "idle";

  useEffect(() => {
    mounted.current = true;
    // Move focus to the result so keyboard and screen-reader users land on it.
    headingRef.current?.focus({ preventScroll: true });
    return () => { mounted.current = false; requestRef.current?.abort(); if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  /** Roving focus so the quality list behaves like a native radio group. */
  const onOptionKeyDown = useCallback((event: React.KeyboardEvent, index: number) => {
    const keys = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const last = formats.length - 1;
    const next = event.key === "Home" ? 0 : event.key === "End" ? last
      : event.key === "ArrowDown" || event.key === (LANGUAGES[locale].dir === "rtl" ? "ArrowLeft" : "ArrowRight") ? (index === last ? 0 : index + 1)
      : index === 0 ? last : index - 1;
    setSelected(formats[next]?.id ?? null);
    optionRefs.current[next]?.focus();
  }, [formats, locale]);

  function switchTab(next: "video" | "audio") {
    if (busy) return;
    setTab(next);
    setSelected((next === "video" ? info.videoFormats : info.audioFormats)[0]?.id ?? null);
  }

  async function launchDownload() {
    if (!activeFormat || busy) return;
    setStage("preparing"); setNotice(null); setBytes(0);
    if (timerRef.current) clearTimeout(timerRef.current);
    const controller = new AbortController();
    requestRef.current = controller;
    let channel: ReturnType<typeof openSecureTransfer>;
    try {
      channel = openSecureTransfer(locale);
      const ready = await postJson<DownloadResponse>("/api/download", { url: info.url, format_id: activeFormat.id, type: activeFormat.kind }, controller.signal,notice=>{
        if(channel&&!channel.isOpen()){controller.abort();return;}
        if(mounted.current)setNotice({tone:"info",text:interpolate(d.waiting, { position: notice.position, seconds: Math.ceil(notice.estimatedWaitMs/1000) }) + " " + d.keepOpen});
      });
      if (!mounted.current) { channel?.close(); return; }
      if (!ready.ok) throw new Error(errorMessage(ready.code, d));
      if (channel) await channel.start(ready.token);
      else {
        const anchor = document.createElement("a");
        // The backend returns a relative ticket URL; resolve it against the API origin.
        anchor.href = apiUrl(ready.downloadUrl);
        anchor.download = ready.filename;
        anchor.target = frameName;
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
      }
      if (!mounted.current) return;
      setStage("streaming");
      setNotice({ tone: "info", text: d.keepOpen });
      let retries = 0;
      const poll = async () => {
        if (!mounted.current) return;
        try {
          const response = await apiFetch(`/api/download?status=${encodeURIComponent(ready.token)}`, { cache: "no-store", signal: controller.signal });
          const status = await response.json() as DownloadStatusResponse;
          if (!mounted.current) return;
          if (!status.ok) throw new Error(errorMessage(status.code, d));
          setBytes(status.bytes);
          if (status.status === "completed") {
            setStage("idle");
            setNotice({ tone: "success", text: interpolate(d.saved, { size: formatBytes(status.bytes) ?? d.yourFile }) });
            return;
          }
          if (["failed", "aborted", "expired"].includes(status.status)) {
            setStage("idle");
            setNotice({ tone: "error", text: d.transferStopped });
            return;
          }
          retries = 0;
        } catch (error) {
          if (!mounted.current) return;
          retries++;
          if (retries >= 3) {
            setStage("idle");
            setNotice({ tone: "info", text: d.statusStopped });
            return;
          }
          console.warn("[vidfetch] transfer status", error);
        }
        timerRef.current = setTimeout(() => void poll(), 1500);
      };
      timerRef.current = setTimeout(() => void poll(), 800);
    } catch (error) {
      channel?.close();
      if (!mounted.current) return;
      setStage("idle");
      if(controller.signal.aborted){setNotice({tone:"info",text:d.waitingCancelled});return;}
      setNotice({ tone: "error", text: error instanceof DownloadClientError ? errorMessage(error.code, d) : error instanceof Error && Object.values(d).includes(error.message) ? error.message : d.operationFailed });
    }
  }

  return (
    <section className="animate-rise overflow-hidden rounded-3xl border border-white/10 bg-ink-850/80 shadow-[0_40px_120px_-60px_rgba(139,92,246,0.9)]" aria-label={d.extractedVideo}>
      <iframe ref={frameRef} name={frameName} title={d.downloadChannel} className="hidden" aria-hidden="true" tabIndex={-1} onLoad={() => {
        try {
          const document = frameRef.current?.contentDocument;
          if (document?.contentType === "application/json") {
            const response = JSON.parse(document.body.textContent ?? "{}") as { error?: string; code?: string };
            if (response.error) {
              setNotice({ tone: "error", text: errorMessage(response.code, d) });
              setStage("idle");
              if (timerRef.current) clearTimeout(timerRef.current);
            }
          }
        } catch { /* a native attachment exposes no document to the frame */ }
      }} />

      <div className="grid gap-0 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="relative aspect-video overflow-hidden bg-ink-800 lg:aspect-auto">
          {info.thumbnail && !thumbnailFailed ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={info.thumbnail} alt="" width={1280} height={720} className="absolute inset-0 h-full w-full object-cover"
              referrerPolicy="no-referrer" decoding="async" fetchPriority="high" onError={() => setThumbnailFailed(true)} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-cyan-600/25 to-sky-600/20">
              <Film className="h-10 w-10 text-cyan-200/70" aria-hidden />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/20 to-ink-950/30" />
          <span className="absolute start-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white ring-1 ring-white/15">
            <span className={clsx("flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br", meta.accent)}>
              <PlatformIcon platform={info.platform} className="h-2.5 w-2.5" />
            </span>
            {meta.name}
          </span>
          <span className="absolute bottom-3 end-3 rounded-md bg-black/80 px-2 py-1 text-[11px] font-semibold tabular-nums text-white">
            {info.durationLabel}
          </span>
          <a href={info.url} target="_blank" rel="noopener noreferrer nofollow"
            className="absolute bottom-3 start-3 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] text-white/80 transition hover:text-white">
            {d.original} <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </div>

        <div className="flex min-w-0 flex-col gap-5 p-5 sm:p-6">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 ref={headingRef} tabIndex={-1} dir="auto" className="text-balance text-base font-semibold leading-snug text-white outline-none sm:text-lg">
                {info.title}
              </h2>
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                {info.uploader && <span className="inline-flex max-w-[16rem] items-center gap-1.5 truncate"><User className="h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden />{info.uploader}</span>}
                <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-cyan-300" aria-hidden />{info.durationLabel}</span>
                {views && <span className="inline-flex items-center gap-1.5"><Eye className="h-3.5 w-3.5 text-cyan-300" aria-hidden />{views} {d.views}</span>}
              </p>
            </div>
            <button type="button" onClick={onReset} disabled={busy} title={d.another} aria-label={d.another}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:border-cyan-400/40 hover:text-white disabled:opacity-40">
              <RotateCw className="h-4 w-4" aria-hidden />
            </button>
          </header>

          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-1" role="tablist" aria-label={d.downloadType}>
                {(["video", "audio"] as const).map((value) => {
                  const count = (value === "video" ? info.videoFormats : info.audioFormats).length;
                  return (
                    <button key={value} type="button" role="tab" aria-selected={tab === value} disabled={!count || busy} onClick={() => switchTab(value)}
                      className={clsx("inline-flex min-h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
                        tab === value ? "bg-gradient-to-r from-cyan-400 to-sky-400 text-ink-950" : "text-slate-300 hover:text-white")}>
                      {value === "video" ? <Film className="h-3.5 w-3.5" aria-hidden /> : <AudioLines className="h-3.5 w-3.5" aria-hidden />}
                      {value === "video" ? d.video : d.audio}
                      <span className="text-[11px] opacity-70">{count}</span>
                    </button>
                  );
                })}
              </div>
              <p className="hidden text-[11px] text-slate-400 sm:block">{engine.ffmpeg ? d.mp3Available : d.originalFormats}</p>
            </div>

            <div className="mt-3 grid max-h-[272px] gap-2 overflow-y-auto pe-0.5 no-scrollbar" role="radiogroup" aria-label={d.quality}>
              {formats.length ? formats.map((format, index) => (
                <FormatRow key={`${format.kind}-${format.id}`} format={format} active={activeFormat?.id === format.id} hasSeparateAudio={hasSeparateAudio}
                  innerRef={(node) => { optionRefs.current[index] = node; }}
                  onSelect={() => { if (!busy) setSelected(format.id); }}
                  onKeyDown={(event) => onOptionKeyDown(event, index)} />
              )) : (
                <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                  {d.noFormats}
                </p>
              )}
            </div>
          </div>

          <div className="mt-auto space-y-3 pt-1">
            {stage === "streaming" && (
              <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/[0.08] px-3.5 py-3">
                <div className="flex items-center justify-between text-xs font-medium text-cyan-100">
                  <span>{d.downloading}</span>
                  <span className="tabular-nums" dir="ltr">{formatBytes(bytes) ?? d.starting}</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={d.progress} aria-valuetext={formatBytes(bytes) ?? d.starting}>
                  <div className="h-full w-1/3 animate-indeterminate rounded-full bg-gradient-to-r from-cyan-400 to-sky-400" />
                </div>
              </div>
            )}

            <p aria-live="polite" className="sr-only">{notice?.text ?? ""}</p>
            {notice && stage !== "streaming" && (
              <p className={clsx("flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed",
                notice.tone === "error" ? "border-red-400/25 bg-red-500/10 text-red-100"
                  : notice.tone === "success" ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                  : "border-cyan-400/25 bg-cyan-500/10 text-cyan-100")}>
                {notice.tone === "success" ? <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  : <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
                {notice.text}
              </p>
            )}

            <button type="button" onClick={() => void launchDownload()} disabled={busy || !activeFormat}
              className="group inline-flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-cyan-400 via-cyan-400 to-sky-400 px-6 text-sm font-semibold text-ink-950 shadow-[0_18px_45px_-20px_rgba(139,92,246,1)] transition hover:brightness-110 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70">
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4 transition-transform group-hover:translate-y-0.5" aria-hidden />}
              {stage === "preparing" ? d.preparing : stage === "streaming" ? d.downloading : <>{d.download}{activeFormat && <> <bdi dir="ltr">{formatLabel(activeFormat, d)}</bdi></>}</>}
            </button>
            <p className="text-center text-[11px] text-slate-400">
              {d.transferFooter}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
