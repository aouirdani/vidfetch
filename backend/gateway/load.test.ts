import {test} from "node:test";
import assert from "node:assert/strict";
import {createServer,request} from "node:http";
import {createServer as createTlsServer} from "node:https";
import {once} from "node:events";
import {randomBytes,randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {performance} from "node:perf_hooks";
import {createGateway} from "./server";
import {GatewayLedger} from "./ledger";
import {createAccessIssuer} from "../../src/server/download-access";
import {SecureDownloadClient} from "../../src/lib/secure-client";
import {resolveQueued} from "../../src/lib/queue-client";
import {tlsFixture,trustedFetch} from "./tests.test";

test("progressive synthetic HTTPS load 1/2/4/8, Funnel headers and one engine lease",{timeout:90000},async()=>{
 const tls=await tlsFixture(),secret=randomBytes(32),site="https://app.example.net",ledger=new GatewayLedger(resolve(tls.directory,"load.sqlite"));
 const records=new Map<string,{status:string;bytes:number;updated:number}>();let workers=0,maxWorkers=0,preparations=0,resourceRefused=false;
 const backend=createServer((req,res)=>{
  res.setHeader("Content-Type","application/json");
  if(req.url==="/api/health"){res.end(JSON.stringify({ok:true,engine:{ytDlp:"synthetic",ffmpeg:true,isolationProfile:"vidfetch-netns-v1"}}));return;}
  if(req.url==="/api/fetch-info"){workers++;maxWorkers=Math.max(maxWorkers,workers);req.resume();setTimeout(()=>{workers--;res.end(JSON.stringify({ok:true,info:{title:"Synthetic metadata"}}));},20);return;}
  if(req.method==="POST"){req.resume();req.on("end",()=>{workers++;maxWorkers=Math.max(maxWorkers,workers);preparations++;const token=randomUUID();records.set(token,{status:"ready",bytes:0,updated:Date.now()});res.writeHead(201);res.end(JSON.stringify({ok:true,token,filename:"fixture.bin",downloadUrl:`/api/download?ticket=${token}`}));});return;}
  const url=new URL(req.url!,"http://127.0.0.1"),token=url.searchParams.get("status")??url.searchParams.get("ticket"),entry=token?records.get(token):undefined;
  if(!entry){res.writeHead(404);res.end('{}');return;}
  if(url.searchParams.has("status")){res.end(JSON.stringify({ok:true,...entry}));return;}
  entry.status="streaming";res.setHeader("Content-Type","application/octet-stream");res.setHeader("Content-Disposition",'attachment; filename="fixture.bin"');
  let closed=false;res.once("close",()=>{if(!closed){workers--;closed=true;}});
  for(let i=0;i<4;i++){entry.bytes+=16384;res.write(Buffer.alloc(16384,42));}
  entry.status="completed";entry.updated=Date.now();res.end();
 });backend.listen(0,"127.0.0.1");await once(backend,"listening");const ba=backend.address();assert(ba&&typeof ba!=="string");
 const edge=createTlsServer({key:tls.key,cert:tls.cert});edge.listen(0,"127.0.0.1");await once(edge,"listening");const ea=edge.address();assert(ea&&typeof ea!=="string");const origin=`https://127.0.0.1:${ea.port}`;
 const gateway=createGateway({origin,sites:[site],key:secret,backend:`http://127.0.0.1:${ba.port}`,ledger,proxy:"funnel",bytesPerSecond:262144,admitWork:async()=>{if(resourceRefused)throw new (await import("../../src/server/access-crypto")).AccessError("RESOURCE_GUARD",503);},queue:{maxWaiting:2,waitMs:30000,heartbeatMs:20000,claimMs:10000,estimateMs:1000}});
 gateway.server.listen(0,"127.0.0.1");await once(gateway.server,"listening");const ga=gateway.server.address();assert(ga&&typeof ga!=="string");
 edge.on("request",(req,res)=>{
  const ip=String(req.headers["x-fixture-ip"]??"1.2.3.4"),headers={...req.headers,Host:new URL(origin).host,"X-Forwarded-For":ip,"X-Forwarded-Host":new URL(origin).host,"X-Forwarded-Proto":"https","Tailscale-Funnel-Request":"?1"};
  const proxy=request(`http://127.0.0.1:${ga.port}${req.url}`,{method:req.method,headers},up=>{res.writeHead(up.statusCode??502,up.headers);up.pipe(res);});proxy.on("error",()=>res.destroy());res.once("close",()=>{if(!res.writableFinished)proxy.destroy();});req.pipe(proxy);
 });
 const baseTransport=trustedFetch(tls.cert),issuer=createAccessIssuer({key:secret,siteOrigin:site,gatewayOrigin:origin,verifyChallenge:async()=>true});
 const actor=async(index:number)=>{
  const transport=(async(url,init={})=>{const headers=new Headers(init.headers);headers.set("X-Fixture-IP",`1.2.3.${index+10}`);headers.set("X-Forwarded-For","192.168.1.1");return baseTransport(url,{...init,headers});})as typeof fetch;
  let cookie="";const client=new SecureDownloadClient(origin,(async(_url,init)=>{const reply=await issuer(new Request(site,{...init,headers:{Origin:site,Cookie:cookie}}));if(reply.ok)cookie=reply.headers.get("set-cookie")!.split(";")[0];return reply;})as typeof fetch,transport);
  await client.authorize("fixture");return{client,transport};
 };
 type Actor=Awaited<ReturnType<typeof actor>>;
 const downloadBody=JSON.stringify({url:"https://youtu.be/aqz-KE-bpKQ",format_id:"18",type:"video"});
 const finish=async(a:Actor,ready:{ok?:boolean;token?:string})=>{
  if(!ready.ok||!ready.token)return false;
  const grant=await a.client.grant(),body=JSON.stringify({ticket:ready.token});
  const permission=await a.transport(origin+"/auth/transfer",{method:"POST",body,headers:{Authorization:`Bearer ${grant}`,"X-VidFetch-Proof":await a.client.proof("POST","/auth/transfer",body,grant)}});assert.equal(permission.status,200);
  const cookie=permission.headers.get("set-cookie")!.split(";")[0],response=await a.transport(`${origin}/api/download?ticket=${ready.token}`,{headers:{Cookie:cookie,"Sec-Fetch-Site":"same-origin"}});assert.equal(response.status,200);assert.equal((await response.arrayBuffer()).byteLength,65536);
  const state=await(await a.client.request(`/api/download?status=${ready.token}`)).json();assert.equal(state.status,"completed");assert.equal(state.bytes,65536);return true;
 };
 const results:unknown[]=[],actors:Actor[]=[];
 let maximumRss=process.memoryUsage().rss;const sampler=setInterval(()=>{maximumRss=Math.max(maximumRss,process.memoryUsage().rss);},50);
 try{
  const rejected=await new Promise<number>((resolve,reject)=>{const req=request(`http://127.0.0.1:${ga.port}/api/health`,{headers:{Host:new URL(origin).host,"X-Forwarded-Proto":"https","X-Forwarded-For":"1.2.3.4"}},res=>{res.resume();resolve(res.statusCode!);});req.on("error",reject);req.end();});assert.equal(rejected,403);
  for(let i=0;i<8;i++)actors.push(await actor(i));
  for(const count of [1,2,4,8]){
   const started=performance.now(),cpu=process.resourceUsage(),responses=await Promise.all(actors.slice(0,count).map(a=>a.client.request("/api/download",{method:"POST",body:downloadBody}))),statuses=responses.map(r=>r.status),queued=statuses.filter(s=>s===202).length;
   assert.equal(statuses.filter(s=>s===201).length,1);assert.equal(queued,Math.min(count-1,2));assert.equal(statuses.filter(s=>s===429).length,Math.max(count-3,0));
   const admissionMs=performance.now()-started;
   const finished=await Promise.all(responses.map(async(response,index)=>finish(actors[index],await resolveQueued(response,(p,i)=>actors[index].client.request(p,i)))));
   assert.equal(finished.filter(Boolean).length,Math.min(count,3));assert.equal(workers,0);
   const elapsed=(performance.now()-started)/1000,after=process.resourceUsage();
   results.push({syntheticVisitors:count,statuses,queued,completed:finished.filter(Boolean).length,admissionMs,elapsedSeconds:elapsed,cpuPercentOneCore:(after.userCPUTime+after.systemCPUTime-cpu.userCPUTime-cpu.systemCPUTime)/1e6/elapsed*100});
  }
  const first=await actors[0].client.request("/api/download",{method:"POST",body:downloadBody});const firstReady=await first.json(),before=preparations;
  const metadata=await actors[1].client.request("/api/fetch-info",{method:"POST",body:JSON.stringify({url:"https://youtu.be/aqz-KE-bpKQ"})});assert.equal(metadata.status,202);
  const second=await actors[2].client.request("/api/download",{method:"POST",body:downloadBody});assert.equal(second.status,202);const queued=await second.json();
  assert.equal((await actors[0].client.request(`/api/queue?job=${queued.queueToken}`)).status,404);
  assert.equal((await actors[2].client.request("/api/queue",{method:"POST",body:JSON.stringify({claim:queued.queueToken})})).status,409);
  assert.equal((await actors[2].client.request("/api/queue",{method:"POST",body:JSON.stringify({cancel:queued.queueToken})})).status,200);assert.equal(preparations,before);
  await finish(actors[0],firstReady);const info=await resolveQueued<{ok:boolean}>(metadata,(p,i)=>actors[1].client.request(p,i));assert.equal(info.ok,true);
  resourceRefused=true;const beforeGuard=preparations,guard=await actors[3].client.request("/api/download",{method:"POST",body:downloadBody});assert.equal(guard.status,503);assert.equal((await guard.json()).code,"RESOURCE_GUARD");assert.equal(preparations,beforeGuard);
  assert.equal((await actors[3].client.request("/api/health")).status,503);resourceRefused=false;
  assert.equal(maxWorkers,1);assert.equal(workers,0);assert(maximumRss<256*1024**2);
  await writeFile(resolve(tls.directory,"load-results.json"),JSON.stringify({environment:"Mac local HTTPS, synthetic backend, no Internet load",results,maximumRssBytes:maximumRss,maxSimultaneousSyntheticEngines:maxWorkers,maxWaiting:2,metadataSharesQueue:true,ownership:true,cancelDoesNotStartEngine:true,funnelHeadersSimulated:true,productionCapacityValidated:false},null,2)+'\n',{flag:"wx"});
  console.log(JSON.stringify({syntheticStages:results,maxSimultaneousSyntheticEngines:maxWorkers,maximumRssMiB:maximumRss/1024**2,evidence:resolve(tls.directory,"load-results.json")}));
 }finally{clearInterval(sampler);await gateway.shutdown();for(const server of [edge,backend]){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}}
});
