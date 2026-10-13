import {test} from "node:test";
import assert from "node:assert/strict";
import {createServer,request} from "node:http";
import {createServer as createTlsServer} from "node:https";
import {once} from "node:events";
import {randomBytes} from "node:crypto";
import {resolve} from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {createGateway} from "./server";
import {GatewayLedger} from "./ledger";
import {createAccessIssuer} from "../../src/server/download-access";
import {SecureDownloadClient} from "../../src/lib/secure-client";
import {tlsFixture,trustedFetch} from "./tests.test";

test("waiting stays blocked between outer-ticket expiry and source-ticket cleanup",async()=>{
 const tls=await tlsFixture(),key=randomBytes(32),site="https://app.example.net";let held=false,timer:NodeJS.Timeout|undefined;
 const backend=createServer((req,res)=>{
  res.setHeader("Content-Type","application/json");
  if(req.url==="/api/health"){res.end(JSON.stringify({ok:true,engine:{isolationProfile:"vidfetch-netns-v1"}}));return;}
  if(held){res.writeHead(429);res.end(JSON.stringify({ok:false,code:"BUSY"}));return;}
  req.resume();req.once("end",()=>{
   if(req.url==="/api/download"){held=true;timer=setTimeout(()=>{held=false;},200);res.writeHead(201);res.end(JSON.stringify({ok:true,token:"12345678-1234-1234-1234-123456789abc",filename:"fixture.mp4"}));}
   else res.end(JSON.stringify({ok:true,info:{title:"Next request"}}));
  });
 });backend.listen(0,"127.0.0.1");await once(backend,"listening");const ba=backend.address();assert(ba&&typeof ba!=="string");
 const edge=createTlsServer({key:tls.key,cert:tls.cert});edge.listen(0,"127.0.0.1");await once(edge,"listening");const ea=edge.address();assert(ea&&typeof ea!=="string");const origin=`https://127.0.0.1:${ea.port}`;
 const gateway=createGateway({origin,sites:[site],key,backend:`http://127.0.0.1:${ba.port}`,ledger:new GatewayLedger(resolve(tls.directory,"expiry.sqlite")),ticketMs:100,backendTicketMs:200,queue:{waitMs:10000,heartbeatMs:5000,claimMs:2000,estimateMs:1000}});
 gateway.server.listen(0,"127.0.0.1");await once(gateway.server,"listening");const ga=gateway.server.address();assert(ga&&typeof ga!=="string");
 edge.on("request",(req,res)=>{const proxy=request(`http://127.0.0.1:${ga.port}${req.url}`,{method:req.method,headers:{...req.headers,Host:new URL(origin).host,"X-Forwarded-Proto":"https","X-Forwarded-For":String(req.headers["x-fixture-ip"]??"1.2.3.4")}},up=>{res.writeHead(up.statusCode??502,up.headers);up.pipe(res);});proxy.on("error",()=>res.destroy());req.pipe(proxy);});
 const transport=trustedFetch(tls.cert),issuer=createAccessIssuer({key,siteOrigin:site,gatewayOrigin:origin,verifyChallenge:async()=>true});
 const actor=async(ip:string)=>{const client=new SecureDownloadClient(origin,(async(_u,init)=>issuer(new Request(site,{...init,headers:{Origin:site}})))as typeof fetch,(async(u,init={})=>{const h=new Headers(init.headers);h.set("X-Fixture-IP",ip);return transport(u,{...init,headers:h});})as typeof fetch);await client.authorize("fixture");return client;};
 try{
  const a=await actor("1.2.3.4"),b=await actor("2.3.4.5");
  assert.equal((await a.request("/api/download",{method:"POST",body:JSON.stringify({url:"https://youtu.be/aqz-KE-bpKQ",type:"video",format_id:"18"})})).status,201);
  const waiting=await b.request("/api/fetch-info",{method:"POST",body:JSON.stringify({url:"https://youtu.be/aqz-KE-bpKQ"})});assert.equal(waiting.status,202);const row=await waiting.json();
  await delay(150);assert.equal((await(await b.request(`/api/queue?job=${row.queueToken}`)).json()).status,"waiting");
  assert.equal((await b.request("/api/queue",{method:"POST",body:JSON.stringify({claim:row.queueToken})})).status,409);
  await delay(1150);assert.equal((await(await b.request(`/api/queue?job=${row.queueToken}`)).json()).status,"available");
  assert.equal((await b.request("/api/queue",{method:"POST",body:JSON.stringify({claim:row.queueToken})})).status,200);
 }finally{clearTimeout(timer);await gateway.shutdown();for(const server of [edge,backend]){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}}
});
