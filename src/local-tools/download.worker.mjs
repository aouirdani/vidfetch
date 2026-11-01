import {outputRoot,holdJob,removeJob,sweepJobs,validJob} from './opfs.mjs';
import {STORAGE_POLICY} from './storage-policy.ts';
const prefix='/local-media/download/file/';
const notify=async(id,type)=>{for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))client.postMessage({type,opfsId:id});};
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('message',e=>{
 if(e.origin!==self.location.origin)return;
 if(e.data?.type==='discard'&&validJob(e.data.id))e.waitUntil(removeJob(e.data.id).catch(()=>{}));
 if(e.data?.type==='sweep')e.waitUntil(sweepJobs().catch(()=>{}));
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(url.origin!==self.location.origin||!url.pathname.startsWith(prefix))return;
 // Must be a navigation, not an <a download> fetch (which can bypass service workers).
 const id=url.pathname.slice(prefix.length);if(!validJob(id)||event.request.method!=='GET'){event.respondWith(new Response('',{status:404}));return;}
 let resolveDone;const done=new Promise(resolve=>resolveDone=resolve);event.waitUntil(done);
 event.respondWith((async()=>{
  let release,reader,settled=false;
  const finish=async type=>{if(settled)return;settled=true;try{await reader?.cancel().catch(()=>{});reader?.releaseLock();await release?.();await removeJob(id);await notify(id,type);}finally{resolveDone();}};
  try{
   release=await holdJob(id);await notify(id,'download-started');const dir=await(await outputRoot()).getDirectoryHandle(id);
   const meta=JSON.parse(await(await(await dir.getFileHandle('meta')).getFile()).text());
   if(!['video/mp4','video/webm','audio/mp4','audio/mpeg','image/gif'].includes(meta.mime)||typeof meta.name!=='string'||meta.name.length>200)throw Error('Invalid output metadata');
   const file=await(await dir.getFileHandle('data')).getFile();if(file.size!==meta.size)throw Error('Incomplete output');
   // File.slice().stream() keeps every application read bounded; no whole-file arrayBuffer/blob assembly.
   let offset=0;const body=new ReadableStream({async pull(controller){try{if(offset===file.size){controller.close();await finish('download-consumed');return;}const end=Math.min(file.size,offset+STORAGE_POLICY.downloadChunkBytes);reader=file.slice(offset,end).stream().getReader();for(;;){const {done,value}=await reader.read();if(done)break;controller.enqueue(value);}reader.releaseLock();reader=undefined;offset=end;}catch(error){controller.error(error);await finish('download-error');}},async cancel(){await finish('download-cancelled');}},{highWaterMark:0});
   return new Response(body,{headers:{'Content-Type':meta.mime,'Content-Length':String(file.size),'Content-Disposition':`attachment; filename="vidfetch-output.${meta.name.split('.').at(-1)}"; filename*=UTF-8''${encodeURIComponent(meta.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`,'Cache-Control':'no-store','X-Robots-Tag':'noindex','Referrer-Policy':'no-referrer'}});
  }catch{await finish('download-error');return new Response('',{status:404,headers:{'Cache-Control':'no-store'}});}
 })());
});
