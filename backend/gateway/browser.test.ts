import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { createServer as tlsServer } from "node:https";
import { once } from "node:events";
import { createHash, randomBytes, X509Certificate } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium, firefox, _android } from "playwright";
import { spawnSync } from "node:child_process";
import { createGateway } from "./server";
import { GatewayLedger } from "./ledger";
import { createAccessIssuer } from "../../src/server/download-access";
import { tlsFixture } from "./tests.test";
import { nativeFirefox } from "./native-firefox-test";

for (const mode of ["popup","direct"] as const) test(`native ${mode} MP4 and MP3 attachment, scoped cookie, exact bytes and status`, { timeout:120000 }, async()=>{
  const tls=await tlsFixture(),key=randomBytes(32);
  const video=resolve(tls.directory,"original.mp4"), audio=resolve(tls.directory,"original.mp3");
  const ffmpeg=process.env.FFMPEG_PATH??"ffmpeg";
  assert.equal(spawnSync(ffmpeg,["-v","error","-f","lavfi","-i","testsrc2=size=160x90:rate=24","-f","lavfi","-i","sine=frequency=480:sample_rate=44100","-t","2","-c:v","libx264","-c:a","aac","-pix_fmt","yuv420p","-movflags","+faststart",video]).status,0);
  assert.equal(spawnSync(ffmpeg,["-v","error","-i",video,"-vn","-c:a","libmp3lame",audio]).status,0);
  const files={video:await readFile(video),audio:await readFile(audio)};
  let bytes=files.video,ext="mp4";
  let phase="ready";
  const backend=createServer((req,res)=>{
    res.setHeader("Content-Type","application/json");
    if(req.url==="/api/health")res.end(JSON.stringify({ok:true,engine:{isolationProfile:"vidfetch-netns-v1"}}));
    else if(req.method==="POST"){let body="";req.on("data",chunk=>body+=chunk);req.on("end",()=>{const type=JSON.parse(body).type;bytes=type==="audio"?files.audio:files.video;ext=type==="audio"?"mp3":"mp4";phase="ready";res.writeHead(201);res.end(JSON.stringify({ok:true,token:"12345678-1234-1234-1234-123456789abc",filename:`fixture.${ext}`}));});}
    else if(req.url?.includes("status="))res.end(JSON.stringify({ok:true,status:phase,bytes:phase==="completed"?bytes.length:0,updated:Date.now()}));
    else {res.setHeader("Content-Type",ext==="mp3"?"audio/mpeg":"video/mp4");res.setHeader("Content-Disposition",`attachment; filename="fixture.${ext}"`);phase="completed";res.end(bytes);}
  });backend.listen(0,"127.0.0.1");await once(backend,"listening");const ba=backend.address();assert(ba&&typeof ba!=="string");
  const edge=tlsServer({key:tls.key,cert:tls.cert}),web=tlsServer({key:tls.key,cert:tls.cert});
  edge.listen(0,"127.0.0.1");web.listen(0,"127.0.0.1");await Promise.all([once(edge,"listening"),once(web,"listening")]);
  const ea=edge.address(),wa=web.address();assert(ea&&wa&&typeof ea!=="string"&&typeof wa!=="string");
  const origin=`https://download.backend.test:${ea.port}`,site=`https://127.0.0.1:${wa.port}`;
  const gateway=createGateway({origin,sites:[site],key,backend:`http://127.0.0.1:${ba.port}`,ledger:new GatewayLedger(resolve(tls.directory,"browser-quota.sqlite"))});
  gateway.server.listen(0,"127.0.0.1");await once(gateway.server,"listening");const ga=gateway.server.address();assert(ga&&typeof ga!=="string");
  edge.on("request",(req,res)=>{const proxy=request(`http://127.0.0.1:${ga.port}${req.url}`,{method:req.method,headers:{...req.headers,Host:new URL(origin).host,"X-Forwarded-Proto":"https","X-Forwarded-For":"1.2.3.4"}},up=>{res.writeHead(up.statusCode??502,up.headers);up.pipe(res);});proxy.on("error",()=>res.destroy());res.on("close",()=>{if(!res.writableFinished)proxy.destroy();});req.pipe(proxy);});
  const js=await build({entryPoints:["src/lib/secure-client.ts"],bundle:true,platform:"browser",format:"iife",globalName:"VidFetch",write:false});
  const issuer=createAccessIssuer({key,siteOrigin:site,gatewayOrigin:origin,verifyChallenge:async token=>token==="original-fixture"});
  web.on("request",(req,res)=>{
    if(req.url?.startsWith("/api/transfer/")){
      const proxy=request(`http://127.0.0.1:${ga.port}${req.url}`,{method:req.method,headers:{...req.headers,Host:new URL(site).host,"X-Forwarded-Proto":"https","X-Forwarded-For":"1.2.3.4"}},up=>{res.writeHead(up.statusCode??502,up.headers);up.pipe(res)});
      proxy.on("error",()=>res.destroy());res.on("close",()=>{if(!res.writableFinished)proxy.destroy()});req.pipe(proxy);return;
    }
    if(req.url==="/client.js"){res.setHeader("Content-Type","text/javascript");res.end(js.outputFiles[0].contents);return;}
    if(req.url==="/api/download-access"){
      const chunks:Buffer[]=[];req.on("data",chunk=>chunks.push(chunk));req.on("end",()=>{void(async()=>{
        const reply=await issuer(new Request(site+req.url,{method:"POST",headers:{Origin:String(req.headers.origin??""),Cookie:String(req.headers.cookie??"")},body:Buffer.concat(chunks).toString("utf8")}));
        res.writeHead(reply.status,Object.fromEntries(reply.headers));res.end(await reply.text());
      })().catch(()=>res.destroy());});return;
    }
    res.setHeader("Content-Type","text/html");res.end(`<!doctype html><button id="authorize">Authorize</button><select id="type"><option value="video">MP4</option><option value="audio">MP3</option></select><button id="download" disabled>Download</button><p id="state"></p><script src="/client.js"></script><script>
    const client=new VidFetch.SecureDownloadClient(${JSON.stringify(origin)},undefined,undefined,${mode==="direct"?JSON.stringify(site):"undefined"});const state=document.querySelector('#state');
    document.querySelector('#authorize').onclick=()=>client.authorize('original-fixture').then(()=>{state.textContent='authorized';document.querySelector('#download').disabled=false}).catch(e=>state.textContent=e.message);
    document.querySelector('#download').onclick=()=>{const channel=${mode==='popup'?"client.openTransfer()":"null"};state.textContent='preparing';(async()=>{const type=document.querySelector('#type').value;const reply=await client.request('/api/download',{method:'POST',body:JSON.stringify({url:'https://www.tiktok.com/@example/video/1234567890123456789',format_id:type==='audio'?'mp3':'18',type}),headers:{'Content-Type':'application/json'}});if(!reply.ok)throw Error('prepare '+reply.status);const ready=await reply.json();if(channel)await channel.start(ready.token);else client.startTransfer(ready.token,ready.filename);state.textContent='transferring';for(let i=0;i<30;i++){const status=await(await client.request('/api/download?status='+ready.token)).json();if(status.status==='completed'){state.textContent='completed';break}await new Promise(r=>setTimeout(r,100))}})().catch(e=>{state.textContent=e.message})};
    </script>`);
  });
  const pin=createHash("sha256").update(new X509Certificate(tls.cert).publicKey.export({type:"spki",format:"der"})).digest("base64");
  const name=process.env.TRANSFER_BROWSER??"chrome";
  let browser:import("playwright").Browser|undefined,device:import("playwright").AndroidDevice|undefined;
  let context:import("playwright").BrowserContext|undefined;
  try {
  if(name === "firefox-native") {
    const result = await nativeFirefox(site,tls.directory,files);
    await writeFile(resolve(tls.directory,"firefox-native-results.json"),JSON.stringify(result)+"\n",{flag:"wx"});
    return;
  }
  if(name==="android"){
    device=(await _android.devices()).find(d=>d.serial()===(process.env.ANDROID_SERIAL??"emulator-5554"));assert(device,"The requested Android test device is unavailable");
    const adb=process.env.ADB??"/Users/aymaneouirdani/Library/Android/sdk/platform-tools/adb";
    assert.equal(spawnSync(adb,["-s",device.serial(),"reverse",`tcp:${wa.port}`,`tcp:${wa.port}`]).status,0);
    const launchTimeout=setTimeout(()=>void device?.close(),30000);
    try { context=await device.launchBrowser({acceptDownloads:true,args:[`--ignore-certificate-errors-spki-list=${pin}`,"--host-resolver-rules=MAP app.frontend.test 127.0.0.1,MAP download.backend.test 127.0.0.1","--no-proxy-server"]}); } finally {clearTimeout(launchTimeout);}
  }else{
    browser=name==="firefox"?await firefox.launch({headless:true}):await chromium.launch({headless:true,...(process.platform==="darwin"?{channel:"chrome"}:{}),args:[`--ignore-certificate-errors-spki-list=${pin}`,"--host-resolver-rules=MAP app.frontend.test 127.0.0.1,MAP download.backend.test 127.0.0.1","--no-proxy-server"]});
    context=await browser.newContext({acceptDownloads:true,...(name==="firefox"?{ignoreHTTPSErrors:true}: {})});
  }
    const page=await context.newPage();const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    let popups=0;page.on("popup",()=>popups++);
    await page.goto(site);await page.locator("#authorize").click();await page.waitForFunction(()=>Boolean(document.querySelector("#state")?.textContent));
    assert.equal(await page.locator("#state").textContent(),"authorized",`Browser errors: ${errors.join("; ")}`);
    const results=[];
    for(const type of ["video","audio"] as const){
      await page.locator("#type").selectOption(type);
      const started=performance.now();
      let popup:import("playwright").Page|undefined;
      const downloadPromise=mode==="direct"?page.waitForEvent("download",{timeout:20000}):page.waitForEvent("popup").then(p=>{popup=p;return p.waitForEvent("download",{timeout:20000});});
      await page.locator("#download").click();
      const download=await downloadPromise,shownMs=performance.now()-started;
      const ext=type==="video"?"mp4":"mp3",file=resolve(tls.directory,`${name}-native.${ext}`);
      await download.saveAs(file);assert.deepEqual(await readFile(file),files[type]);
      await page.waitForFunction(()=>document.querySelector("#state")?.textContent==="completed");
      assert.equal(page.url(),site+"/");assert.equal(context.pages().length,mode==="direct"?1:2);if(mode==="direct")assert.equal(popups,0);
      assert.equal(new URL(download.url()).origin,mode==="direct"?site:origin);assert(!download.url().includes("internal"));
      assert.equal(await page.evaluate(()=>document.cookie),"");
      results.push({type,bytes:files[type].length,shownMs,nativeAttachment:true,noPopup:mode==="direct",status:"completed"});
      await popup?.close();
    }
    assert.deepEqual(errors,[]);
    const cookies=await context.cookies(site);assert(cookies.some(c=>c.name==="__Host-vidfetch-access"&&c.httpOnly&&c.secure&&c.sameSite==="Strict"));
    await writeFile(resolve(tls.directory,`${name}-${mode}-results.json`),JSON.stringify({browser:name,mode,results,publicInternet:false,challenge:"test fixture only"})+"\n",{flag:"wx"});
    console.log(`PASS ${name}: ${mode} native MP4 + MP3, exact bytes, hidden cookies, completed status`,JSON.stringify(results));
  }finally{await context?.close();await browser?.close();await device?.close();await gateway.shutdown();for(const s of [edge,web,backend]){s.closeAllConnections();await new Promise<void>(r=>s.close(()=>r()));}}
});
