import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium,webkit,devices} from 'playwright';

const messages=JSON.parse(await readFile('src/local-tools/messages.json','utf8')).en;
const dir=await mkdtemp(join(tmpdir(),'vidfetch-device-profiles-'));
const source=join(dir,'synthetic-camera.mp4');
execFileSync(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=1280x720:rate=30','-f','lavfi','-i','sine=sample_rate=48000','-t','5','-c:v','libx264','-preset','ultrafast','-threads','2','-b:v','4000k','-pix_fmt','yuv420p','-c:a','aac','-y',source]);
const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{stdio:'ignore',env:{...process.env,VIDFETCH_TARGET:'ovh'}});
const report={source:'locally generated H.264/AAC, 1280×720, 5 s; no third-party media',profiles:[],privacyViolations:[]};

async function runProfile({name,type,device,throttle}){
  const userData=join(dir,name);
  const context=await type.launchPersistentContext(userData,{...device,headless:true,acceptDownloads:true,locale:'en-US'});
  const page=await context.newPage();
  await context.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true}));
  const cdp=type===chromium?await context.newCDPSession(page):null;
  if(throttle){
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:200000,uploadThroughput:100000,connectionType:'cellular4g'});
  }
  const violations=[];
  context.on('request',request=>{const url=new URL(request.url());if(['http:','https:'].includes(url.protocol)&&(url.origin!==base||request.method()!=='GET'||(request.postDataBuffer()?.length??0)>0))violations.push({origin:url.origin,method:request.method(),bodyBytes:request.postDataBuffer()?.length??0});});
  page.on('pageerror',error=>violations.push({pageError:error.message}));
  const elapsed=[];
  try{
    for(const [tool,path] of [['audio','/video-to-mp3'],['compress','/compress-video'],['trim','/trim-video'],['gif','/video-to-gif']]){
      await page.goto(base+path);await page.locator('input[type=file]').setInputFiles(source);
      await page.getByRole('button',{name:messages.convert,exact:true}).waitFor({timeout:60000});
      await page.waitForFunction(()=>!document.querySelector('[data-local-tool] button')?.disabled,undefined,{timeout:30000});
      if(tool==='trim')await page.getByLabel(messages.end,{exact:true}).fill('2');
      if(tool==='gif')await page.getByLabel(messages.end,{exact:true}).fill('2');
      const start=Date.now();await page.getByRole('button',{name:messages.convert,exact:true}).click();
      const result=page.locator('[data-local-download]');
      await Promise.race([result.waitFor({timeout:90000}),page.locator('[data-local-tool] [role=alert]').waitFor({timeout:90000}).then(async()=>{throw new Error(`${name}/${tool}: ${await page.locator('[data-local-tool] [role=alert]').textContent()}`);})]);
      const downloading=page.waitForEvent('download');await result.click();const download=await downloading;const output=join(dir,`${name}-${tool}-${download.suggestedFilename()}`);await download.saveAs(output);
      const probe=JSON.parse(execFileSync(process.env.FFPROBE_PATH||'ffprobe',['-v','error','-show_format','-show_streams','-of','json',output],{encoding:'utf8'}));
      assert.ok(probe.streams.some(stream=>stream.codec_type===(tool==='audio'?'audio':'video')),`${name}/${tool} output stream`);
      if(tool==='audio')assert.ok(probe.streams.every(stream=>stream.codec_type==='audio'));
      elapsed.push({tool,ms:Date.now()-start,bytes:probe.format.size,seconds:Number(probe.format.duration),codecs:probe.streams.map(stream=>stream.codec_name)});
    }
    assert.deepEqual(violations,[]);
    report.profiles.push({name,engine:type.name(),engineVersion:context.browser()?.version(),device:{width:device.viewport.width,height:device.viewport.height,scale:device.deviceScaleFactor,mobile:device.isMobile,touch:device.hasTouch},cpuThrottle:throttle?'CDP 4×':'Not available through Playwright WebKit protocol',networkThrottle:throttle?'40 ms / 1.6 Mbit/s down':'localhost only; no network throttling API in WebKit',outputs:elapsed,privacyViolations:violations});
  }finally{await context.close();}
}

try{
  for(let attempt=0;;attempt++){try{if((await fetch(base)).ok)break;}catch{}if(attempt>150)throw Error('Next.js startup timed out');await new Promise(r=>setTimeout(r,100));}
  await runProfile({name:'pixel-7-chromium',type:chromium,device:devices['Pixel 7'],throttle:true});
  await runProfile({name:'iphone-15-webkit',type:webkit,device:devices['iPhone 15'],throttle:false});
  await writeFile('docs/LOCAL-TOOLS-DEVICE-EMULATION.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{server.kill('SIGTERM');await rm(dir,{recursive:true,force:true});}
