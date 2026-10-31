"use client";
import {useEffect,useRef,useState} from 'react';
import type {Locale} from '@/i18n/config';
import type messages from '@/local-tools/messages.json';
export type LocalMessages=(typeof messages)['en'];
import {LOCAL_LIMITS,PRESETS,type LocalToolId} from '@/local-tools/limits';
type Info={duration:number;width:number;height:number;audioCodec:string|null};
export function LocalMediaTool({locale,tool,messages:d}:{locale:Locale;tool:LocalToolId;messages:LocalMessages}) {
 const worker=useRef<Worker|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),urls=useRef<string[]>([]),fileInput=useRef<HTMLInputElement>(null),preview=useRef<HTMLVideoElement>(null);
 const [limit,setLimit]=useState<number>(LOCAL_LIMITS.mobileBytes),[file,setFile]=useState<File|null>(null),[info,setInfo]=useState<Info|null>(null),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState(''),[inputURL,setInputURL]=useState(''),[output,setOutput]=useState<{url:string;name:string;duration:number;bytes:number}|null>(null),[noPreview,setNoPreview]=useState(false);
 const [audioFormat,setAudioFormat]=useState('mp3'),[bitrate,setBitrate]=useState('192'),[preset,setPreset]=useState<keyof typeof PRESETS>('balanced'),[maxHeight,setMaxHeight]=useState('720'),[start,setStart]=useState('0'),[end,setEnd]=useState('1'),[mode,setMode]=useState('copy'),[width,setWidth]=useState('320'),[fps,setFps]=useState('10');
 const clearTimer=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;};
 const stop=()=>{clearTimer();worker.current?.terminate();worker.current=null;};
 const release=()=>{stop();urls.current.forEach(url=>URL.revokeObjectURL(url));urls.current=[];};
 useEffect(()=>{setLimit(matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/.test(navigator.userAgent) || ((navigator as Navigator&{deviceMemory?:number}).deviceMemory??8)<4?LOCAL_LIMITS.mobileBytes:LOCAL_LIMITS.desktopBytes);return ()=>{worker.current?.terminate();if(timer.current)clearTimeout(timer.current);urls.current.forEach(url=>URL.revokeObjectURL(url));};},[]);
 const showError=(code:string)=>setError(d.errors[code as keyof typeof d.errors]??d.errors.FORMAT);
 const watch=()=>{clearTimer();timer.current=setTimeout(()=>{release();setBusy(false);setInfo(null);showError('TIMEOUT');},LOCAL_LIMITS.timeoutMs);};
 const reset=(clearPicker=true)=>{release();setFile(null);setInfo(null);setOutput(null);setInputURL('');setError('');setBusy(false);setProgress(0);if(clearPicker&&fileInput.current)fileInput.current.value='';};
 const choose=(chosen:File|undefined)=>{
  reset(false);if(!chosen)return;
  if(!chosen.size||chosen.size>limit){showError('SIZE');return;}
  if(!/\.(mp4|mov|webm)$/i.test(chosen.name)){showError('FORMAT');return;}
  if(typeof Worker==='undefined'){showError('FORMAT');return;}
  setFile(chosen);setNoPreview(false);const url=URL.createObjectURL(chosen);urls.current.push(url);setInputURL(url);setBusy(true);
  const w=new Worker('/local-media/generated/engine.js',{type:'module'});worker.current=w;watch();
  w.onerror=()=>{release();setBusy(false);setInfo(null);setInputURL('');showError('FORMAT');};
  w.onmessage=event=>{
   if(worker.current!==w)return;
   const data=event.data;
   if(data.type==='ready'){clearTimer();setInfo(data);setStart('0');setEnd(String(Math.min(data.duration,tool==='gif'?3:data.duration)));setBusy(false);}
   else if(data.type==='progress')setProgress(Math.max(0,Math.min(1,data.value)));
   else if(data.type==='error'){release();setBusy(false);setInfo(null);setInputURL('');showError(data.code);}
   else if(data.type==='result'){
    clearTimer();const blob=new Blob([data.bytes],{type:data.mime}),result=URL.createObjectURL(blob);urls.current.push(result);
    const stem=chosen.name.replace(/\.[^.]*$/,'').normalize('NFKD').replace(/[^\p{L}\p{N}_-]+/gu,'-').slice(0,70)||'video';
    setOutput({url:result,name:`${stem}-local.${data.ext}`,duration:data.duration,bytes:blob.size});setBusy(false);setProgress(1);stop();
   }
  };
  w.postMessage({type:'probe',file:chosen,limit});
 };
 const convert=()=>{if(!info||!worker.current)return;setError('');setBusy(true);setProgress(0);watch();worker.current.postMessage({type:'run',options:{tool,audioFormat,bitrate,preset,maxHeight,start,end,mode,width,fps}});};
 const select=(label:string,value:string,onChange:(v:string)=>void,options:[string,string][])=> <label className="grid gap-2 text-sm">{label}<select aria-label={label} className="rounded-lg border border-white/15 bg-ink-950 p-3" value={value} onChange={e=>onChange(e.target.value)} disabled={busy}>{options.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>;
 return <section aria-label={d.choose} className="mt-6 rounded-2xl border border-cyan-300/25 bg-cyan-400/[0.03] p-5 sm:p-7" data-local-tool={tool}>
  <p className="mb-3 text-sm text-cyan-100">{d.privacy}</p>
  <label className="grid gap-3 font-semibold">{d.choose}<input ref={fileInput} type="file" accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" onChange={e=>choose(e.target.files?.[0])} disabled={busy} className="w-full rounded-lg border border-white/15 p-3 text-sm"/></label>
  <p className="mt-3 text-xs leading-relaxed text-slate-400">{d.limits.replace('{size}',String(limit/1024**2))} {d.support}</p>
  {file&&<p className="mt-4 break-words text-sm"><bdi>{file.name}</bdi> · {(file.size/1024**2).toFixed(2)} MiB</p>}
  {inputURL&&<div className="mt-5"><video ref={preview} src={inputURL} controls playsInline preload="metadata" width={640} height={360} aria-label={d.preview} className="max-h-52 w-full rounded-lg bg-black" onError={()=>setNoPreview(true)} onTimeUpdate={()=>{if((tool==='trim'||tool==='gif')&&preview.current&&preview.current.currentTime>Number(end))preview.current.pause();}}/>{noPreview&&<p className="mt-2 text-sm text-slate-400">{d.noPreview}</p>}</div>}
  {info&&!output&&<div className="mt-5 grid gap-4 sm:grid-cols-2">
   {tool==='audio'&&<>{select(d.audioFormat,audioFormat,setAudioFormat,[['mp3','MP3'],['m4a','M4A · AAC']])}{audioFormat==='mp3'&&select(d.bitrate,bitrate,setBitrate,[['128','128 kbps'],['192','192 kbps'],['320','320 kbps']])}</>}
   {tool==='compress'&&select(d.preset,preset,v=>setPreset(v as keyof typeof PRESETS),[['light',d.light],['balanced',d.balanced],['strong',d.strong]])}
   {(tool==='compress'||(tool==='trim'&&mode==='precise'))&&select(d.maxHeight,maxHeight,setMaxHeight,[['0',d.original],['360','360p'],['480','480p'],['720','720p'],['1080','1080p']])}
   {(tool==='trim'||tool==='gif')&&<>{[d.start,d.end].map((label,i)=><label key={label} className="grid gap-2 text-sm">{label}<input dir="ltr" type="number" min="0" max={info.duration} step="0.1" value={i?end:start} onChange={e=>{if(i)setEnd(e.target.value);else{setStart(e.target.value);if(preview.current)preview.current.currentTime=Number(e.target.value);}}} className="rounded-lg border border-white/15 bg-ink-950 p-3" disabled={busy}/></label>)}</>}
   {tool==='trim'&&select(d.mode,mode,setMode,[['copy',d.copy],['precise',d.precise]])}
   {tool==='gif'&&<>{select(d.width,width,setWidth,[['160','160'],['320','320'],['480','480'],['640','640']])}{select(d.fps,fps,setFps,[['5','5'],['10','10'],['15','15']])}</>}
  </div>}
  {info&&tool==='compress'&&!output&&<p className="mt-4 text-sm text-slate-400">{d.estimate.replace('{size}',((PRESETS[preset]+(info.audioCodec?128000:0))*info.duration/8/1024**2).toFixed(1))}</p>}
  {busy&&<div role="status" className="mt-5"><p>{info?d.progress:d.preparing}</p><progress aria-label={d.progress} max={1} value={progress} className="mt-2 w-full"/></div>}
  {error&&<p role="alert" className="mt-4 text-sm text-amber-200">{error}</p>}
  <div className="mt-5 flex flex-wrap gap-3">
   {info&&!output&&!busy&&<button onClick={convert} className="rounded-xl bg-cyan-300 px-5 py-3 font-semibold text-ink-950">{d.convert}</button>}
   {busy&&<button onClick={()=>{reset();showError('CANCELLED');}} className="rounded-xl border border-white/20 px-5 py-3">{d.cancel}</button>}
   {output&&<a href={output.url} download={output.name} className="rounded-xl bg-cyan-300 px-5 py-3 font-semibold text-ink-950">{d.result} · <bdi dir="ltr">{(output.bytes/1024**2).toFixed(2)} MiB · {output.duration.toFixed(2)} s</bdi></a>}
   {!busy&&(file||error)&&<button onClick={()=>reset()} className="rounded-xl border border-white/20 px-5 py-3">{d.again}</button>}
  </div>
 </section>;
}
