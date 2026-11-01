"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import type {Locale} from '@/i18n/config';
import type messages from '@/local-tools/messages.json';
import {prepareDownloadService,discardOutput} from '@/local-tools/download-client';
import {LOCAL_LIMITS,PRESETS,toolLimits,type DeviceClass,type LocalToolId} from '@/local-tools/limits';
export type LocalMessages=(typeof messages)['en'];
type Info={duration:number;width:number;height:number;audioCodec:string|null};
type Plan={ext:string;mime:string;estimatedBytes:number;bufferBytes:number;storage:'file'|'opfs'|'memory';capacity:number;blocked:boolean;suggestion:Partial<Record<'preset'|'end'|'bitrate'|'width'|'fps',string>>|null};
type SaveHandle={name:string};
type PickerWindow=Window&{showSaveFilePicker?:(options:{suggestedName:string;types:{description:string;accept:Record<string,string[]>}[];excludeAcceptAllOption:boolean})=>Promise<SaveHandle>};
export function LocalMediaTool({locale,tool,messages:d}:{locale:Locale;tool:LocalToolId;messages:LocalMessages}){
 const service=useRef<ServiceWorker|null>(null),job=useRef<string|null>(null);
 const worker=useRef<Worker|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),urls=useRef<string[]>([]),fileInput=useRef<HTMLInputElement>(null),preview=useRef<HTMLVideoElement>(null),planVersion=useRef(0);
 const [device,setDevice]=useState<DeviceClass>('mobile'),[diskAvailable,setDiskAvailable]=useState(false),[saveMode,setSaveMode]=useState('auto'),[file,setFile]=useState<File|null>(null),[info,setInfo]=useState<Info|null>(null),[plan,setPlan]=useState<Plan|null>(null),[busy,setBusy]=useState(false),[planning,setPlanning]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState(''),[notice,setNotice]=useState(''),[inputURL,setInputURL]=useState(''),[output,setOutput]=useState<{url?:string;name:string;duration:number;bytes:number;mime:string;saved:boolean;opfs?:boolean;downloadState?:'started'|'consumed'|'failed'}|null>(null),[noPreview,setNoPreview]=useState(false);
 const [audioFormat,setAudioFormat]=useState('mp3'),[bitrate,setBitrate]=useState('192'),[preset,setPreset]=useState<keyof typeof PRESETS>('balanced'),[maxHeight,setMaxHeight]=useState('720'),[start,setStart]=useState('0'),[end,setEnd]=useState('1'),[mode,setMode]=useState('copy'),[width,setWidth]=useState('320'),[fps,setFps]=useState('10');
 const limits=toolLimits(tool,device),options={tool,audioFormat,bitrate,preset,maxHeight,start,end,mode,width,fps,storage:saveMode==='buffer'?'memory':'auto',filePickerAvailable:diskAvailable};
 const clearTimer=useCallback(()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;},[]);
 const stop=useCallback(()=>{clearTimer();worker.current?.terminate();worker.current=null;},[clearTimer]);
 const release=()=>{stop();discardOutput(service.current,job.current);job.current=null;urls.current.forEach(url=>URL.revokeObjectURL(url));urls.current=[];};
 const showError=useCallback((code:string)=>setError(d.errors[code as keyof typeof d.errors]??d.errors.FORMAT),[d]);
 const reset=(clearPicker=true)=>{release();planVersion.current++;setFile(null);setInfo(null);setPlan(null);setPlanning(false);setOutput(null);setInputURL('');setError('');setNotice('');setBusy(false);setProgress(0);if(clearPicker&&fileInput.current)fileInput.current.value='';};
 const watch=(ms:number)=>{clearTimer();timer.current=setTimeout(()=>{const expired=worker.current;expired?.postMessage({type:'cancel'});worker.current=null;setTimeout(()=>expired?.terminate(),1000);discardOutput(service.current,job.current);job.current=null;urls.current.forEach(url=>URL.revokeObjectURL(url));urls.current=[];setBusy(false);setInfo(null);setPlan(null);setInputURL('');showError('TIMEOUT');},ms);};
 useEffect(()=>{setDevice(matchMedia('(pointer: coarse)').matches||/Android|iPhone|iPad/.test(navigator.userAgent)||((navigator as Navigator&{deviceMemory?:number}).deviceMemory??8)<4?'mobile':'desktop');setDiskAvailable(typeof(window as PickerWindow).showSaveFilePicker==='function');return()=>{worker.current?.postMessage({type:'cancel'});const old=worker.current;setTimeout(()=>old?.terminate(),1000);if(timer.current)clearTimeout(timer.current);discardOutput(service.current,job.current);urls.current.forEach(url=>URL.revokeObjectURL(url));};},[]);
 useEffect(()=>{const listener=(event:MessageEvent)=>{if(event.origin!==location.origin||!(event.source instanceof ServiceWorker)||new URL(event.source.scriptURL).pathname!=='/local-media/download/sw.js'||!job.current||event.data?.opfsId!==job.current)return;const type=event.data.type;if(type==='download-started'){stop();setOutput(previous=>previous?{...previous,downloadState:'started'}:null);}else if(['download-consumed','download-cancelled','download-error'].includes(type)){job.current=null;stop();setOutput(previous=>previous?{...previous,url:undefined,downloadState:type==='download-consumed'?'consumed':'failed'}:null);if(type==='download-consumed')setNotice(d.downloadSent);else showError(type==='download-cancelled'?'CANCELLED':'STORAGE');}};navigator.serviceWorker?.addEventListener('message',listener);const abandon=()=>{worker.current?.postMessage({type:'cancel'});stop();discardOutput(service.current,job.current);job.current=null;urls.current.forEach(url=>URL.revokeObjectURL(url));urls.current=[];setInfo(null);setFile(null);setOutput(null);setPlan(null);setPlanning(false);setBusy(false);setInputURL('');if(fileInput.current)fileInput.current.value='';};window.addEventListener('pagehide',abandon);return()=>{navigator.serviceWorker?.removeEventListener('message',listener);window.removeEventListener('pagehide',abandon);};},[d.downloadSent,showError,stop]);
 useEffect(()=>{
  if(!info||output||busy||!worker.current)return;
  const id=++planVersion.current;setPlanning(true);setPlan(null);
  worker.current.postMessage({type:'plan',id,options:{tool,audioFormat,bitrate,preset,maxHeight,start,end,mode,width,fps,storage:saveMode==='buffer'?'memory':'auto',filePickerAvailable:diskAvailable}});
 },[info,output,busy,tool,audioFormat,bitrate,preset,maxHeight,start,end,mode,width,fps,saveMode,diskAvailable]);
 const choose=(chosen:File|undefined)=>{
  reset(false);if(!chosen)return;
  if(!chosen.size||chosen.size>limits.inputBytes){showError('SIZE');return;}
  if(!/\.(mp4|mov|webm)$/i.test(chosen.name)||typeof Worker==='undefined'){showError('FORMAT');return;}
  setFile(chosen);setNoPreview(false);const url=URL.createObjectURL(chosen);urls.current.push(url);setInputURL(url);setBusy(true);
  const w=new Worker('/local-media/generated/engine.js?v='+process.env.NEXT_PUBLIC_LOCAL_MEDIA_REVISION,{type:'module'});worker.current=w;watch(LOCAL_LIMITS.probeTimeoutMs);
  w.onerror=()=>{if(worker.current!==w)return;release();setBusy(false);setInfo(null);setPlan(null);setInputURL('');showError('FORMAT');};
  w.onmessage=({data})=>{
   if(worker.current!==w)return;
   if(data.type==='ready'){clearTimer();setInfo(data);setStart('0');setEnd(String(Math.min(data.duration,tool==='gif'?3:tool==='trim'?30:data.duration)));setBusy(false);}
   else if(data.type==='plan'&&data.id===planVersion.current){setPlan(data);setPlanning(false);}
   else if(data.type==='plan-error'&&data.id===planVersion.current){setPlan(null);setPlanning(false);showError(data.code);}
   else if(data.type==='progress')setProgress(Math.max(0,Math.min(1,data.value)));
   else if(data.type==='capacity-error'){clearTimer();setPlan(data.plan);setBusy(false);setPlanning(false);}
   else if(data.type==='error'){clearTimer();setBusy(false);showError(data.code);if(data.phase==='probe'){release();setInfo(null);setPlan(null);setInputURL('');}}
   else if(data.type==='result'){
    clearTimer();let result:string|undefined;
    if(data.opfsId){result='/local-media/download/file/'+data.opfsId;}else if(!data.saved){const blob=new Blob([data.bytes],{type:data.mime});result=URL.createObjectURL(blob);urls.current.push(result);}
    setOutput({url:result,name:data.saved?data.name??chosen.name:cleanName(chosen.name,data.ext),duration:data.duration,bytes:data.size,mime:data.mime,saved:!!data.saved,opfs:!!data.opfsId});setBusy(false);setProgress(1);if(!data.opfsId)stop();
   }
  };
  void prepareDownloadService().then(downloadService=>{if(worker.current!==w)return;service.current=downloadService;w.postMessage({type:'probe',file:chosen,tool,device,downloadAvailable:!!downloadService});});
 };
 function cleanName(name:string,ext:string){const stem=name.replace(/\.[^.]*$/,'').normalize('NFKD').replace(/[^\p{L}\p{N}_-]+/gu,'-').slice(0,70)||'video';return `${stem}-local.${ext}`;}
 const convert=async()=>{
  if(!info||!file||!plan||plan.blocked||!worker.current)return;const activeWorker=worker.current;setError('');setNotice('');setBusy(true);setProgress(0);
  let fileHandle:SaveHandle|undefined;
  try{
   const picker=(window as PickerWindow).showSaveFilePicker;
   if(saveMode==='auto'&&picker){
    try{fileHandle=await picker.call(window,{suggestedName:cleanName(file.name,plan.ext),types:[{description:plan.ext.toUpperCase(),accept:{[plan.mime]:['.'+plan.ext]}}],excludeAcceptAllOption:true});}
    catch(e){if(e instanceof DOMException&&e.name==='AbortError'){setBusy(false);showError('CANCELLED');return;}if(e instanceof DOMException&&['NotSupportedError','SecurityError'].includes(e.name))setNotice(d.saveUnavailable);else throw e;}
   }
   if(worker.current!==activeWorker)return;
   if(fileHandle&&(fileHandle.name.toLowerCase()===file.name.toLowerCase()||!fileHandle.name.toLowerCase().endsWith('.'+plan.ext))){setBusy(false);showError('SAVE');return;}
   const id='job-'+crypto.randomUUID();job.current=id;watch(limits.timeoutMs);activeWorker.postMessage({type:'run',options:{...options,filePickerAvailable:false},fileHandle,opfsId:id,name:cleanName(file.name,plan.ext)});
  }catch{setBusy(false);showError('SAVE');}
 };
 const cancel=()=>{const old=worker.current;old?.postMessage({type:'cancel'});worker.current=null;setTimeout(()=>old?.terminate(),1000);reset();showError('CANCELLED');};
 const select=(label:string,value:string,onChange:(v:string)=>void,items:[string,string][])=> <label className="grid gap-2 text-sm">{label}<select aria-label={label} className="rounded-lg border border-white/15 bg-ink-950 p-3" value={value} onChange={e=>{setError('');onChange(e.target.value);}} disabled={busy}>{items.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>;
 const limitText=(tool==='gif'?d.gifLimits:d.limits).replace('{size}',String(limits.inputBytes/1024**2)).replace('{minutes}',String(limits.duration/60)).replace('{buffer}',String(limits.bufferBytes/1024**2)).replace('{timeout}',String(limits.timeoutMs/60000));
 return <section aria-label={d.choose} className="mt-6 rounded-2xl border border-cyan-300/25 bg-cyan-400/[0.03] p-5 sm:p-7" data-local-tool={tool}>
  <p className="mb-3 text-sm text-cyan-100">{d.privacy}</p>
  <label className="grid gap-3 font-semibold">{d.choose}<input ref={fileInput} type="file" accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" onChange={e=>choose(e.target.files?.[0])} disabled={busy} className="w-full rounded-lg border border-white/15 p-3 text-sm"/></label>
  <p className="mt-3 text-xs leading-relaxed text-slate-400">{limitText} {d.support}</p>
  {file&&<p className="mt-4 break-words text-sm"><bdi>{file.name}</bdi> · <bdi dir="ltr">{(file.size/1024**2).toFixed(2)} MiB</bdi></p>}
  {inputURL&&<div className="mt-5"><video ref={preview} src={inputURL} controls playsInline preload="metadata" width={640} height={360} aria-label={d.preview} className="max-h-52 w-full rounded-lg bg-black" onError={()=>setNoPreview(true)} onTimeUpdate={()=>{if((tool==='trim'||tool==='gif')&&preview.current&&preview.current.currentTime>Number(end))preview.current.pause();}}/>{noPreview&&<p className="mt-2 text-sm text-slate-400">{d.noPreview}</p>}</div>}
  {info&&!output&&<div className="mt-5 grid gap-4 sm:grid-cols-2">
   {tool==='audio'&&<>{select(d.audioFormat,audioFormat,setAudioFormat,[['mp3','MP3'],['m4a','M4A · AAC']])}{audioFormat==='mp3'&&select(d.bitrate,bitrate,setBitrate,[['128','128 kbps'],['192','192 kbps'],['320','320 kbps']])}</>}
   {tool==='compress'&&select(d.preset,preset,v=>setPreset(v as keyof typeof PRESETS),[['light',d.light],['balanced',d.balanced],['strong',d.strong]])}
   {(tool==='compress'||(tool==='trim'&&mode==='precise'))&&select(d.maxHeight,maxHeight,setMaxHeight,[['0',d.original],['360','360p'],['480','480p'],['720','720p'],['1080','1080p']])}
   {(tool==='trim'||tool==='gif')&&<>{[d.start,d.end].map((label,i)=><label key={label} className="grid gap-2 text-sm">{label}<input dir="ltr" type="number" min="0" max={info.duration} step="0.1" value={i?end:start} onChange={e=>{setError('');if(i)setEnd(e.target.value);else{setStart(e.target.value);if(preview.current)preview.current.currentTime=Number(e.target.value);}}} className="rounded-lg border border-white/15 bg-ink-950 p-3" disabled={busy}/></label>)}</>}
   {tool==='trim'&&select(d.mode,mode,setMode,[['copy',d.copy],['precise',d.precise]])}
   {tool==='gif'&&<>{select(d.width,width,setWidth,[['160','160'],['320','320'],['480','480'],['640','640']])}{select(d.fps,fps,setFps,[['5','5'],['10','10'],['15','15']])}</>}
   {diskAvailable&&select(d.saveMode,saveMode,setSaveMode,[['auto',d.directSave],['buffer',d.memorySave]])}
  </div>}
  {plan&&tool==='compress'&&!output&&<p className="mt-4 text-sm text-slate-400">{d.estimate.replace('{size}',(plan.estimatedBytes/1024**2).toFixed(1))}</p>}
  {plan&&<p className="mt-3 text-sm text-slate-400"><bdi dir="ltr">{plan.ext.toUpperCase()}</bdi>{plan.ext==='webm'&&<span className="ms-2 text-amber-200">{d.webmWarning}</span>}</p>}
  {plan&&!output&&<div className="mt-4 text-sm"><p>{(plan.storage==='opfs'?d.storageOPFS:plan.storage==='file'?d.storageDirect:d.storageMemory).replace('{capacity}',(plan.capacity/1024**2).toFixed(1))}</p>{plan.blocked&&<div role="alert" className="mt-3 text-amber-200"><p>{d.capacityExceeded.replace('{size}',(plan.estimatedBytes/1024**2).toFixed(1)).replace('{capacity}',(plan.capacity/1024**2).toFixed(1))}</p><p className="mt-2">{tool==='compress'?d.suggestCompress:tool==='trim'?d.suggestTrim:tool==='gif'?d.suggestGif:d.suggestAudio}</p>{plan.suggestion&&<button onClick={()=>{const suggestion=plan.suggestion!;setError('');if(suggestion.preset)setPreset(suggestion.preset as keyof typeof PRESETS);if(suggestion.end)setEnd(suggestion.end);if(suggestion.bitrate)setBitrate(suggestion.bitrate);if(suggestion.width)setWidth(suggestion.width);if(suggestion.fps)setFps(suggestion.fps);}} className="mt-3 rounded-lg border border-amber-200/50 px-4 py-2">{d.applySuggestion}</button>}</div>}</div>}
  {notice&&<p role="status" className="mt-3 text-sm text-amber-200">{notice}</p>}
  {busy&&<div role="status" className="mt-5"><p>{info?d.progress:d.preparing}</p><progress aria-label={d.progress} max={1} value={progress} className="mt-2 w-full"/></div>}
  {error&&<p role="alert" className="mt-4 text-sm text-amber-200">{error}</p>}
  <div className="mt-5 flex flex-wrap gap-3">
   {info&&!output&&!busy&&<button disabled={!plan||planning||plan.blocked} onClick={()=>void convert()} className="rounded-xl bg-cyan-300 px-5 py-3 font-semibold text-ink-950 disabled:opacity-50">{d.convert}</button>}
   {busy&&<button onClick={cancel} className="rounded-xl border border-white/20 px-5 py-3">{d.cancel}</button>}
   {output&&<p data-local-result data-format={output.mime} data-size={output.bytes} data-saved={output.saved} className="text-cyan-200">{output.saved?d.savedFile.replace('{name}',output.name):output.opfs?(output.downloadState?(output.downloadState==='consumed'?d.downloadSent:output.downloadState==='failed'?d.errors.STORAGE:d.downloadPending):<a data-local-download href={output.url} target="vidfetch-local-download">{d.result}</a>):<a data-local-download href={output.url} download={output.name}>{d.result}</a>} · <bdi dir="ltr">{(output.bytes/1024**2).toFixed(2)} MiB · {output.duration.toFixed(2)} s</bdi></p>}
   {!busy&&(file||error)&&<button onClick={()=>reset()} className="rounded-xl border border-white/20 px-5 py-3">{d.again}</button>}
  </div>
  <iframe hidden name="vidfetch-local-download" title={d.result}/>
 </section>;
}
