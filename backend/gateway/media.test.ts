import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { createServer as httpsServer } from "node:https";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createWriteStream } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { createBackend } from "../server";
import { engineContext, ytDlpBinary, ffmpegBinary } from "../../src/lib/engine";
import { createGateway } from "./server";
import { GatewayLedger } from "./ledger";
import { createAccessIssuer } from "../../src/server/download-access";
import { SecureDownloadClient } from "../../src/lib/secure-client";
import { tlsFixture, trustedFetch } from "./tests.test";

test("real yt-dlp + ffmpeg video and MP3 through an authenticated HTTPS relay",{timeout:120000},async()=>{
  const directory=await mkdtemp(resolve("backend/artifacts/gateway-media-")),source=resolve(directory,"original.mp4"),tls=await tlsFixture(),secret=randomBytes(32);
  assert.equal(spawnSync(ffmpegBinary(),["-hide_banner","-loglevel","error","-f","lavfi","-i","testsrc2=size=160x90:rate=24","-f","lavfi","-i","sine=frequency=480:sample_rate=44100","-t","2","-c:v","libx264","-c:a","aac","-pix_fmt","yuv420p","-movflags","+faststart",source]).status,0);
  let mediaFile=source;
  const media=createServer((_req,res)=>{createReadStream(mediaFile).pipe(res);});media.listen(0,"127.0.0.1");await once(media,"listening");const mediaAddress=media.address();assert(mediaAddress&&typeof mediaAddress!=="string");
  const raw={id:"aqz-KE-bpKQ",title:"Authorized original fixture",duration:2,extractor:"generic",extractor_key:"Generic",webpage_url:"https://www.youtube.com/watch?v=aqz-KE-bpKQ",formats:[{format_id:"18",url:`http://127.0.0.1:${mediaAddress.port}/original.mp4`,ext:"mp4",vcodec:"h264",acodec:"aac",protocol:"http"}]};
  // Fixtures exist only in test dependencies; production has no SSRF bypass variable.
  const backend=createBackend({engine:{ytDlpBinary,ffmpegBinary,engineContext,dumpJson:async()=>({raw,ytDlpVersion:"real"}),assertPublicUrl:async()=>{},validateMediaDestinations:async()=>{}}});
  backend.server.listen(0,"127.0.0.1");await once(backend.server,"listening");const backendAddress=backend.server.address();assert(backendAddress&&typeof backendAddress!=="string");
  const edge=httpsServer({key:tls.key,cert:tls.cert});edge.listen(0,"127.0.0.1");await once(edge,"listening");const edgeAddress=edge.address();assert(edgeAddress&&typeof edgeAddress!=="string");const origin=`https://127.0.0.1:${edgeAddress.port}`,site="https://app.example.net";
  const gateway=createGateway({origin,sites:[site],key:secret,backend:`http://127.0.0.1:${backendAddress.port}`,ledger:new GatewayLedger(resolve(directory,"quota.sqlite")),requireIsolation:false});
  gateway.server.listen(0,"127.0.0.1");await once(gateway.server,"listening");const gatewayAddress=gateway.server.address();assert(gatewayAddress&&typeof gatewayAddress!=="string");
  edge.on("request",(req,res)=>{const proxy=httpRequest(`http://127.0.0.1:${gatewayAddress.port}${req.url}`,{method:req.method,headers:{...req.headers,Host:new URL(origin).host,"X-Forwarded-Proto":"https","X-Forwarded-For":"1.2.3.4"}},up=>{res.writeHead(up.statusCode??502,up.headers);up.pipe(res);});proxy.on("error",()=>res.destroy());res.on("close",()=>{if(!res.writableFinished)proxy.destroy();});req.pipe(proxy);});
  const transport=trustedFetch(tls.cert);const issuer=createAccessIssuer({key:secret,siteOrigin:site,gatewayOrigin:origin,verifyChallenge:async()=>true});let cookie="";
  const client=new SecureDownloadClient(origin,(async(_url,init)=>{const response=await issuer(new Request(site,{...init,headers:{Origin:site,Cookie:cookie}}));if(response.ok)cookie=response.headers.get("set-cookie")!.split(";")[0];return response;})as typeof fetch,transport);
  const results:unknown[]=[];
  try{
    await client.authorize("test-original-fixture");
    for(const [format,type,ext]of [["18","video","mp4"],["mp3","audio","mp3"]]as const){
      const info=await client.request("/api/fetch-info",{method:"POST",body:JSON.stringify({url:raw.webpage_url}),headers:{"Content-Type":"application/json"}});assert.equal(info.status,200);assert.equal((await info.json()).ok,true);
      const prepared=await client.request("/api/download",{method:"POST",body:JSON.stringify({url:raw.webpage_url,format_id:format,type}),headers:{"Content-Type":"application/json"}});assert.equal(prepared.status,201);const ready=await prepared.json();
      const grant=await client.grant(),body=JSON.stringify({ticket:ready.token}),proof=await client.proof("POST","/auth/transfer",body,grant);
      const session=await transport(origin+"/auth/transfer",{method:"POST",body,headers:{Authorization:`Bearer ${grant}`,"X-VidFetch-Proof":proof,"Content-Type":"application/json"}});assert.equal(session.status,200);const transferCookie=session.headers.get("set-cookie")!.split(";")[0];
      const response=await transport(origin+ready.downloadUrl,{headers:{Cookie:transferCookie,"Sec-Fetch-Site":"same-origin"}});assert.equal(response.status,200);
      const file=resolve(directory,`received.${ext}`);await pipeline(Readable.fromWeb(response.body! as import("node:stream/web").ReadableStream),createWriteStream(file,{flags:"wx"}));
      let status;for(let i=0;i<100;i++){status=await(await client.request(`/api/download?status=${ready.token}`)).json();if(status.status==="completed")break;await delay(20);}
      assert.equal(status.status,"completed");assert.equal(status.bytes,(await stat(file)).size);
      assert.equal((await transport(origin+ready.downloadUrl,{headers:{Cookie:transferCookie,"Sec-Fetch-Site":"same-origin"}})).status,404);
      const probe=spawnSync(process.env.FFPROBE_PATH??"/opt/homebrew/bin/ffprobe",["-v","error","-show_entries","stream=codec_type,codec_name:format=duration,size","-of","json",file],{encoding:"utf8"});assert.equal(probe.status,0,probe.stderr);const properties=JSON.parse(probe.stdout);
      assert(properties.streams.some((s:{codec_type:string})=>s.codec_type==="audio"));if(type==="video")assert(properties.streams.some((s:{codec_type:string})=>s.codec_type==="video"));else assert(properties.streams.every((s:{codec_name:string})=>s.codec_name==="mp3"));
      assert.equal(spawnSync(ffmpegBinary(),["-v","error","-i",file,"-f","null","-"],{stdio:"ignore"}).status,0);
      if(type==="video")assert.equal(createHash("sha256").update(await readFile(file)).digest("hex"),createHash("sha256").update(await readFile(source)).digest("hex"));
      results.push({type,bytes:status.bytes,status:status.status,sha256:createHash("sha256").update(await readFile(file)).digest("hex"),probe:properties});
    }
    // A non-seekable MP4 with its index at the end previously produced only ID3
    // metadata with ffmpeg exit 0. It must never be reported as completed.
    mediaFile=resolve(directory,"non-streamable.mp4");
    assert.equal(spawnSync(ffmpegBinary(),["-v","error","-i",source,"-c","copy",mediaFile]).status,0);
    const invalid=await client.request("/api/download",{method:"POST",body:JSON.stringify({url:raw.webpage_url,format_id:"mp3",type:"audio"}),headers:{"Content-Type":"application/json"}});
    if(invalid.status===201){
      const ready=await invalid.json(),grant=await client.grant(),body=JSON.stringify({ticket:ready.token});
      const access=await transport(origin+"/auth/transfer",{method:"POST",body,headers:{Authorization:`Bearer ${grant}`,"X-VidFetch-Proof":await client.proof("POST","/auth/transfer",body,grant)}});
      if(access.status===200){try{const stream=await transport(origin+ready.downloadUrl,{headers:{Cookie:access.headers.get("set-cookie")!.split(";")[0],"Sec-Fetch-Site":"same-origin"}});await stream.arrayBuffer();}catch{/* expected truncated conversion */}}
      let state;for(let i=0;i<100;i++){state=await(await client.request(`/api/download?status=${ready.token}`)).json();if(["failed","aborted"].includes(state.status))break;await delay(20);}
      assert(["failed","aborted"].includes(state.status),JSON.stringify(state));
    }else assert([502,503].includes(invalid.status));
    results.push({emptyMp3Rejected:true});
    await writeFile(resolve(directory,"results.json"),JSON.stringify({transport:"HTTPS local simulation, trusted test CA",engines:"real yt-dlp and ffmpeg",media:"original generated fixture",tests:results,publicInternetTest:false},null,2)+"\n",{flag:"wx"});
    console.log("PASS real video + MP3 via authenticated local HTTPS; bytes, completion, reuse and full decode verified");
  }finally{await gateway.shutdown();await backend.shutdown();edge.closeAllConnections();media.closeAllConnections();await new Promise<void>(r=>edge.close(()=>r()));await new Promise<void>(r=>media.close(()=>r()));}
});
