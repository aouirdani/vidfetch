#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir, freemem } from "node:os";
import { resolve } from "node:path";
import ffmpeg from "ffmpeg-static";

const floorMiB=Number(process.env.VIDFETCH_LOAD_MIN_FREE_MIB??512);
if(!Number.isSafeInteger(floorMiB)||floorMiB<256||floorMiB>8192)throw new Error("VIDFETCH_LOAD_MIN_FREE_MIB must be 256..8192");
const ffmpegCommand=process.env.FFMPEG_PATH??(ffmpeg&&existsSync(ffmpeg)?ffmpeg:"ffmpeg");
const dir=await mkdtemp(resolve(tmpdir(),"vidfetch-load-")),fixture=resolve(dir,"synthetic-camera.mp4");
let active,stopped=false;
const guard=setInterval(()=>{if(freemem()<floorMiB*1024**2){stopped=true;active?.kill("SIGTERM");}},250);
try{
 if(freemem()<floorMiB*1024**2)throw new Error("Free memory is below the configured safety floor; load test not started");
 const generated=spawnSync(ffmpegCommand,["-hide_banner","-loglevel","error","-f","lavfi","-i","testsrc2=size=640x360:rate=24","-f","lavfi","-i","sine=frequency=440:sample_rate=44100","-t","4","-c:v","libx264","-threads","1","-pix_fmt","yuv420p","-c:a","aac","-movflags","+faststart",fixture],{encoding:"utf8",timeout:30000});
 if(generated.error||generated.status!==0)throw new Error("Could not generate local media fixture");
 const bytes=(await stat(fixture)).size;if(bytes<1024)throw new Error("Generated media fixture is unexpectedly small");
 console.log(JSON.stringify({stage:"fixture",source:"locally generated ffmpeg test pattern with sine audio",bytes,memoryFloorMiB:floorMiB,externalNetwork:false}));
 active=spawn(process.execPath,["backend/gateway/run-load.mjs"],{stdio:"inherit",env:{...process.env,VIDFETCH_LOAD_FIXTURE:fixture}});
 const code=await new Promise((resolve,reject)=>{active.once("error",reject);active.once("exit",(status,signal)=>resolve(status??(signal?1:0)));});
 if(stopped)throw new Error("Load test stopped because free RAM crossed the safety floor");
 if(code!==0)process.exitCode=Number(code)||1;
}finally{clearInterval(guard);if(active&&!active.killed)active.kill("SIGTERM");await rm(dir,{recursive:true,force:true});}
