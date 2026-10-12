import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { createServer as tlsServer } from "node:https";
import { once } from "node:events";
import { createHash, randomBytes, X509Certificate } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { createGateway } from "./server";
import { GatewayLedger } from "./ledger";
import { createAccessIssuer } from "../../src/server/download-access";
import { tlsFixture } from "./tests.test";

test("Chrome cross-site helper performs a native attachment with a first-party secure cookie", { timeout:60000 }, async()=>{
  const tls=await tlsFixture(),key=randomBytes(32),bytes=Buffer.alloc(128000,31);
  let phase="ready";
  const backend=createServer((req,res)=>{
    res.setHeader("Content-Type","application/json");
    if(req.url==="/api/health")res.end(JSON.stringify({ok:true,engine:{isolationProfile:"vidfetch-netns-v1"}}));
    else if(req.method==="POST"){req.resume();req.on("end",()=>{phase="ready";res.writeHead(201);res.end(JSON.stringify({ok:true,token:"12345678-1234-1234-1234-123456789abc",downloadUrl:"/api/download?ticket=internal",filename:"fixture.mp4"}));});}
    else if(req.url?.includes("status="))res.end(JSON.stringify({ok:true,status:phase,bytes:phase==="completed"?bytes.length:0,updated:Date.now()}));
    else {res.setHeader("Content-Type","video/mp4");res.setHeader("Content-Disposition",'attachment; filename="fixture.mp4"');phase="completed";res.end(bytes);}
  });backend.listen(0,"127.0.0.1");await once(backend,"listening");const ba=backend.address();assert(ba&&typeof ba!=="string");
  const edge=tlsServer({key:tls.key,cert:tls.cert}),web=tlsServer({key:tls.key,cert:tls.cert});
  edge.listen(0,"127.0.0.1");web.listen(0,"127.0.0.1");await Promise.all([once(edge,"listening"),once(web,"listening")]);
  const ea=edge.address(),wa=web.address();assert(ea&&wa&&typeof ea!=="string"&&typeof wa!=="string");
  const origin=`https://download.backend.test:${ea.port}`,site=`https://app.frontend.test:${wa.port}`;
  const gateway=createGateway({origin,sites:[site],key,backend:`http://127.0.0.1:${ba.port}`,ledger:new GatewayLedger(resolve(tls.directory,"browser-quota.sqlite"))});
  gateway.server.listen(0,"127.0.0.1");await once(gateway.server,"listening");const ga=gateway.server.address();assert(ga&&typeof ga!=="string");
  edge.on("request",(req,res)=>{const proxy=request(`http://127.0.0.1:${ga.port}${req.url}`,{method:req.method,headers:{...req.headers,Host:new URL(origin).host,"X-Forwarded-Proto":"https","X-Forwarded-For":"1.2.3.4"}},up=>{res.writeHead(up.statusCode??502,up.headers);up.pipe(res);});proxy.on("error",()=>res.destroy());res.on("close",()=>{if(!res.writableFinished)proxy.destroy();});req.pipe(proxy);});
  const js=await build({entryPoints:["src/lib/secure-client.ts"],bundle:true,platform:"browser",format:"iife",globalName:"VidFetch",write:false});
  const issuer=createAccessIssuer({key,siteOrigin:site,gatewayOrigin:origin,verifyChallenge:async token=>token==="original-fixture"});
  web.on("request",(req,res)=>{
    if(req.url==="/client.js"){res.setHeader("Content-Type","text/javascript");res.end(js.outputFiles[0].contents);return;}
    if(req.url==="/api/download-access"){
      const chunks:Buffer[]=[];req.on("data",chunk=>chunks.push(chunk));req.on("end",()=>{void(async()=>{
        const reply=await issuer(new Request(site+req.url,{method:"POST",headers:{Origin:String(req.headers.origin??""),Cookie:String(req.headers.cookie??"")},body:Buffer.concat(chunks).toString("utf8")}));
        res.writeHead(reply.status,Object.fromEntries(reply.headers));res.end(await reply.text());
      })().catch(()=>res.destroy());});return;
    }
    res.setHeader("Content-Type","text/html");res.end(`<!doctype html><button id="authorize">Authorize</button><button id="download" disabled>Download</button><p id="state"></p><script src="/client.js"></script><script>
    const client=new VidFetch.SecureDownloadClient(${JSON.stringify(origin)});const state=document.querySelector('#state');
    document.querySelector('#authorize').onclick=()=>client.authorize('original-fixture').then(()=>{state.textContent='authorized';document.querySelector('#download').disabled=false}).catch(e=>state.textContent=e.message);
    document.querySelector('#download').onclick=()=>{const channel=client.openTransfer();(async()=>{const reply=await client.request('/api/download',{method:'POST',body:JSON.stringify({url:'https://youtu.be/aqz-KE-bpKQ',format_id:'18',type:'video'}),headers:{'Content-Type':'application/json'}});const ready=await reply.json();await channel.start(ready.token);state.textContent='transferring';for(let i=0;i<20;i++){const status=await(await client.request('/api/download?status='+ready.token)).json();if(status.status==='completed'){state.textContent='completed';break}await new Promise(r=>setTimeout(r,100))}})().catch(e=>{channel.close();state.textContent=e.message})};
    </script>`);
  });
  const pin=createHash("sha256").update(new X509Certificate(tls.cert).publicKey.export({type:"spki",format:"der"})).digest("base64");
  const browser=await chromium.launch({headless:true,...(process.platform==="darwin"?{channel:"chrome"}:{}),args:[`--ignore-certificate-errors-spki-list=${pin}`,"--host-resolver-rules=MAP app.frontend.test 127.0.0.1,MAP download.backend.test 127.0.0.1","--no-proxy-server"]});
  try{
    const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage();const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    await page.goto(site);await page.locator("#authorize").click();await page.waitForFunction(()=>Boolean(document.querySelector("#state")?.textContent));
    assert.equal(await page.locator("#state").textContent(),"authorized",`Browser errors: ${errors.join("; ")}`);
    const downloadPromise=page.waitForEvent("popup").then(popup=>popup.waitForEvent("download",{timeout:20000}));await page.locator("#download").click();
    const download=await downloadPromise;const file=resolve(tls.directory,"browser-native.mp4");await download.saveAs(file);assert.deepEqual(await readFile(file),bytes);
    await page.waitForFunction(()=>document.querySelector("#state")?.textContent==="completed");assert.deepEqual(errors,[]);
    const cookies=await context.cookies(site);assert(cookies.some(c=>c.name==="__Host-vidfetch-access"&&c.httpOnly&&c.secure&&c.sameSite==="Strict"));
    assert(!download.url().includes("Bearer"));assert(!download.url().includes("internal"));assert.equal(new URL(download.url()).origin,origin);
    await writeFile(resolve(tls.directory,"browser-results.json"),JSON.stringify({nativeAttachment:true,bytes:bytes.length,crossSiteHelper:true,firstPartySession:true,noBlob:true,publicInternet:false,challenge:"mocked only"})+"\n",{flag:"wx"});
    console.log("PASS Chrome cross-site popup, secure cookie, native attachment, exact bytes and completed status");
  }finally{await browser.close();await gateway.shutdown();for(const s of [edge,web,backend]){s.closeAllConnections();await new Promise<void>(r=>s.close(()=>r()));}}
});
