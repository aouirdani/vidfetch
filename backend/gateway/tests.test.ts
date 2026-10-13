import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { createServer as createHttpsServer, request as httpsRequest } from "node:https";
import { once } from "node:events";
import { randomBytes,randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { createGateway } from "./server";
import { GatewayLedger } from "./ledger";
import { createAccessIssuer } from "../../src/server/download-access";
import { SecureDownloadClient } from "../../src/lib/secure-client";
import { serviceMac } from "../../src/server/access-crypto";

export function trustedFetch(ca: Buffer): typeof fetch {
  return (async(input,init={})=>new Promise<Response>((resolve,reject)=>{
    const url=new URL(String(input));const req=httpsRequest(url,{method:init.method??"GET",ca,headers:Object.fromEntries(new Headers(init.headers).entries()),signal:init.signal??undefined},res=>{
      const headers=new Headers();for(const [k,v]of Object.entries(res.headers))if(v)headers.set(k,Array.isArray(v)?v.join(", "):v);
      resolve(new Response(Readable.toWeb(res) as unknown as BodyInit,{status:res.statusCode,headers}));
    });req.on("error",reject);req.end(typeof init.body==="string"?init.body:undefined);
  })) as typeof fetch;
}
export async function tlsFixture() {
  const directory=await mkdtemp(resolve("backend/artifacts/secure-tls-"));
  const key=resolve(directory,"key.pem"),cert=resolve(directory,"cert.pem");
  const result=spawnSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-keyout",key,"-out",cert,"-days","1","-subj","/CN=localhost","-addext","subjectAltName=DNS:localhost,IP:127.0.0.1,DNS:app.frontend.test,DNS:download.backend.test"],{stdio:"ignore"});
  assert.equal(result.status,0);return{directory,key:await readFile(key),cert:await readFile(cert)};
}
test("HTTPS gateway: authentication, ownership, replay, tickets, expiry, disconnect and outages",async()=>{
  const tls=await tlsFixture(), secret=randomBytes(32), site="https://app.example.net";
  let phase="ready",byteCount=0,cancelled=false,fail=false,isolated=true,backendRequests=0;
  const backend=createServer((req,res)=>{
    backendRequests++;res.setHeader("Content-Type","application/json");
    if(fail){res.writeHead(503);res.end('{"ok":false,"code":"ENGINE_MISSING"}');return;}
    if(req.url==="/api/health"){res.end(JSON.stringify({ok:true,engine:{ytDlp:"fixture",ffmpeg:true,...(isolated?{isolationProfile:"vidfetch-netns-v1"}:{})}}));return;}
    if(req.method==="POST"){req.resume();req.on("end",()=>{phase="ready";res.writeHead(201);res.end(JSON.stringify({ok:true,token:"12345678-1234-1234-1234-123456789abc",filename:"fixture.mp4",downloadUrl:"/api/download?ticket=internal"}));});return;}
    if(req.url?.includes("status=")){res.end(JSON.stringify({ok:true,status:phase,bytes:byteCount,error:null,updated:Date.now()}));return;}
    phase="streaming";res.setHeader("Content-Type","video/mp4");res.setHeader("Content-Disposition",'attachment; filename="fixture.mp4"');
    const timer=setInterval(()=>{byteCount+=65536;res.write(Buffer.alloc(65536,17));},20);res.on("close",()=>{clearInterval(timer);cancelled=true;phase="aborted";});
  });backend.listen(0,"127.0.0.1");await once(backend,"listening");
  const address=backend.address();assert(address&&typeof address!=="string");
  const edge=createHttpsServer({key:tls.key,cert:tls.cert});edge.listen(0,"127.0.0.1");await once(edge,"listening");const edgeAddress=edge.address();assert(edgeAddress&&typeof edgeAddress!=="string");
  const origin=`https://127.0.0.1:${edgeAddress.port}`;
  const app=createGateway({origin,sites:[site],key:secret,backend:`http://127.0.0.1:${address.port}`,ledger:new GatewayLedger(resolve(tls.directory,"quota.sqlite")),ticketMs:200,retentionMs:1000,operationMs:3000});
  app.server.listen(0,"127.0.0.1");await once(app.server,"listening");const gatewayAddress=app.server.address();assert(gatewayAddress&&typeof gatewayAddress!=="string");
  edge.on("request",(req,res)=>{
    const proxied=httpRequest(`http://127.0.0.1:${gatewayAddress.port}${req.url}`,{method:req.method,headers:{...req.headers,Host:new URL(origin).host,"X-Forwarded-Proto":"https","X-Forwarded-For":"1.2.3.4"}},upstream=>{res.writeHead(upstream.statusCode??502,upstream.headers);upstream.pipe(res);});
    proxied.on("error",()=>{if(!res.headersSent)res.writeHead(502);res.end();});res.on("close",()=>{if(!res.writableFinished)proxied.destroy();});req.pipe(proxied);
  });
  const transport=trustedFetch(tls.cert);
  const actor=()=>{
    let cookie="";const issuer=createAccessIssuer({key:secret,siteOrigin:site,gatewayOrigin:origin,verifyChallenge:async token=>token==="authorized-fixture"});
    return new SecureDownloadClient(origin,(async(_url,init)=>{
      const reply=await issuer(new Request(site+"/api/download-access",{...init,headers:{Origin:site,Cookie:cookie}}));if(reply.ok)cookie=reply.headers.get("set-cookie")!.split(";")[0];return reply;
    })as typeof fetch,transport);
  };
  const a=actor(),b=actor();
  try{
    assert.equal((await transport(origin+"/api/health")).status,401);assert.equal(backendRequests,0);
    const admissionBody=JSON.stringify({identity:randomBytes(32).toString("base64url"),keyHash:randomBytes(32).toString("base64url"),requestNonce:randomUUID()}),timestamp=String(Date.now()),nonce=randomUUID();
    assert.equal((await transport(origin+"/auth/admission",{method:"POST",body:admissionBody})).status,401);
    const serviceHeaders={"X-VidFetch-Service-Time":timestamp,"X-VidFetch-Service-Nonce":nonce,"X-VidFetch-Service-MAC":serviceMac(secret,admissionBody,timestamp,nonce)};
    assert.equal((await transport(origin+"/auth/admission",{method:"POST",body:admissionBody,headers:serviceHeaders})).status,200);
    assert.equal((await transport(origin+"/auth/admission",{method:"POST",body:admissionBody,headers:serviceHeaders})).status,401);
    await a.authorize("authorized-fixture");await b.authorize("authorized-fixture");
    assert.equal((await a.request("/api/health")).status,200);
    isolated=false;const insecure=await a.request("/api/health");assert.equal(insecure.status,503);assert.equal((await insecure.json()).code,"SECURITY_NOT_READY");isolated=true;
    const grant=await a.grant(),proof=await a.proof("GET","/api/health","",grant),headers={Authorization:`Bearer ${grant}`,"X-VidFetch-Proof":proof};
    assert.equal((await transport(origin+"/api/health",{headers})).status,200);assert.equal((await transport(origin+"/api/health",{headers})).status,401);
    const post=(client:SecureDownloadClient,url="https://youtu.be/aqz-KE-bpKQ")=>client.request("/api/download",{method:"POST",body:JSON.stringify({url,format_id:"18",type:"video"}),headers:{"Content-Type":"application/json"}});
    assert.equal((await post(a,"http://192.168.1.112")).status,400);
    const ready=await(await post(a)).json() as {token:string;downloadUrl:string};assert.match(ready.token,/^[A-Za-z0-9_-]{43}$/);assert.ok(!ready.downloadUrl.includes("12345678"));
    assert.equal((await post(b)).status,429);assert.equal((await b.request(`/api/download?status=${ready.token}`)).status,404);
    const getTransfer=async(client:SecureDownloadClient,ticket=ready.token)=>{
      const transferBody=JSON.stringify({ticket});
      const token=await client.grant(),p=await client.proof("POST","/auth/transfer",transferBody,token);
      return transport(origin+"/auth/transfer",{method:"POST",body:transferBody,headers:{Authorization:`Bearer ${token}`,"X-VidFetch-Proof":p,"Content-Type":"application/json"}});
    };
    assert.equal((await getTransfer(b)).status,404);
    const authorized=await getTransfer(a);assert.equal(authorized.status,200);const cookie=authorized.headers.get("set-cookie")!.split(";")[0];
    assert.equal((await transport(origin+ready.downloadUrl)).status,404);
    const stream=await transport(origin+ready.downloadUrl,{headers:{Cookie:cookie,"Sec-Fetch-Site":"same-origin"}});assert.equal(stream.status,200);
    const reader=stream.body!.getReader();assert.ok((await reader.read()).value!.length);await reader.cancel();
    for(let i=0;i<50&&!cancelled;i++)await delay(20);assert.equal(cancelled,true);
    assert.equal((await transport(origin+ready.downloadUrl,{headers:{Cookie:cookie,"Sec-Fetch-Site":"same-origin"}})).status,404);
    const status=await(await a.request(`/api/download?status=${ready.token}`)).json();assert.equal(status.status,"aborted");
    const expires=await(await post(a)).json();await delay(240);assert.equal((await getTransfer(a,expires.token)).status,404);
    const expiredStatus=await(await a.request(`/api/download?status=${expires.token}`)).json();assert.equal(expiredStatus.status,"expired");
    await delay(1050);assert.equal((await a.request(`/api/download?status=${expires.token}`)).status,404);
    fail=true;assert.equal((await a.request("/api/health")).status,503);
    await writeFile(resolve(tls.directory,"results.json"),JSON.stringify({https:true,trustedCertificate:true,authentication:true,ownership:true,replayDenied:true,privateUrlDenied:true,singleConcurrency:true,singleUse:true,expired:true,retention:true,disconnected:true,backendUnavailable:true})+"\n",{flag:"wx"});
  }finally{await app.shutdown();edge.closeAllConnections();backend.closeAllConnections();await new Promise<void>(r=>edge.close(()=>r()));await new Promise<void>(r=>backend.close(()=>r()));}
});

test("deployment diagnostics require service authentication and drain refuses new work", async () => {
  const secret = randomBytes(32), origin = "https://vidfetch.app";
  const folder = await mkdtemp(resolve("backend/artifacts/drain-test-"));
  const ledger = new GatewayLedger(resolve(folder, "quota.sqlite"));
  let draining = true;
  const gateway = createGateway({ origin, sites: [origin], key: secret, backend: "http://127.0.0.1:18788", ledger, isDraining: () => draining });
  gateway.server.listen(0, "127.0.0.1"); await once(gateway.server, "listening");
  const address = gateway.server.address(); assert(address && typeof address !== "string");
  const request = (path: string, method = "GET", extra = {}): Promise<Response> => new Promise((resolve, reject) => {
    const req = httpRequest(`http://127.0.0.1:${address.port}${path}`, { method, headers: { Host: "vidfetch.app", "X-Forwarded-Proto": "https", "X-Forwarded-For": "203.0.113.101", ...extra } }, res => {
      const chunks: Buffer[] = []; res.on("data", chunk => chunks.push(chunk)); res.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode })));
    }); req.on("error", reject); req.end();
  });
  try {
    assert.equal((await request("/auth/deployment")).status, 401);
    const timestamp = String(Date.now()), nonce = randomUUID();
    const headers = { "X-VidFetch-Service-Time": timestamp, "X-VidFetch-Service-Nonce": nonce, "X-VidFetch-Service-MAC": serviceMac(secret, "", timestamp, nonce) };
    assert.deepEqual(await (await request("/auth/deployment", "GET", headers)).json(), { ok: true, draining: true, active: false, waiting: 0 });
    assert.equal((await request("/auth/deployment", "GET", headers)).status, 401);
    assert.equal((await request("/api/fetch-info", "POST")).status, 503);
    draining = false;
    assert.equal((await request("/api/fetch-info", "POST")).status, 400);
  } finally { await gateway.shutdown(); }
});
