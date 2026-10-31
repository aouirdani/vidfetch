import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,readFile,writeFile,rm,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium,webkit} from 'playwright';
const messages=JSON.parse(await readFile('src/local-tools/messages.json','utf8'));
const dir=await mkdtemp(join(tmpdir(),'vidfetch-local-test-'));
const ffmpeg=process.env.FFMPEG_PATH||'ffmpeg',ffprobe=process.env.FFPROBE_PATH||'ffprobe';
function fixture(name,codec,audio){const path=join(dir,name);execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x180:rate=15','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','2','-c:v',codec,'-pix_fmt','yuv420p','-c:a',audio,...(name.endsWith('.mov')?['-metadata:s:v:0','rotate=90']:[]),'-y',path]);return path;}
const fourK=join(dir,'camera-4k.mp4');execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=3840x2160:rate=15','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2','-c:v','libx264','-preset','ultrafast','-threads','2','-pix_fmt','yuv420p','-c:a','aac','-y',fourK]);
const files=[fixture('recording.mp4','libx264','aac'),fixture('iphone-style.mov','libx264','aac'),fixture('recording.webm','libvpx','libopus')];
const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
const base=`http://127.0.0.1:${port}`,server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{stdio:'ignore',env:{...process.env,VIDFETCH_TARGET:'ovh'}});
let browser;
const results=[];
try{
 for(let n=0;;n++){try{if((await fetch(base)).ok)break;}catch{}if(n>150)throw Error('Server startup');await new Promise(r=>setTimeout(r,100));}
 const wasmResponse=await fetch(base+'/local-media/generated/lame.wasm');assert.equal(wasmResponse.headers.get('content-type'),'application/wasm');assert.equal(wasmResponse.headers.get('cross-origin-embedder-policy'),null);assert.equal(wasmResponse.headers.get('cross-origin-opener-policy'),null);
 const browserType=process.env.LOCAL_BROWSER==='webkit'?webkit:chromium;browser=await browserType.launch({headless:true,...(browserType===chromium&&process.platform==='darwin'?{channel:'chrome'}:{})});
 const context=await browser.newContext({acceptDownloads:true});await context.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true}));let bad=[],mediaRequests=[];
 const inspectRequest=r=>{const u=new URL(r.url());if(['http:','https:'].includes(u.protocol)){
  if(u.origin!==base||r.method()!=='GET'||(r.postDataBuffer()?.length??0)>0)bad.push({origin:u.origin,path:u.pathname,method:r.method()});
  if(u.pathname.startsWith('/local-media/'))mediaRequests.push(u.pathname);
 }};context.on('request',inspectRequest);
 const page=await context.newPage();page.on('pageerror',e=>console.error('BROWSER',e.message));page.on('console',m=>{if(m.type()==='error')console.error('CONSOLE',m.text());});
 const cases=[['audio','/video-to-mp3'],['compress','/compress-video'],['trim','/trim-video'],['gif','/video-to-gif']];
 async function prepare(path,file){await page.goto(base+path);await page.locator('input[type=file]').setInputFiles(file);await page.getByRole('button',{name:messages.en.convert,exact:true}).waitFor({timeout:60000});await page.waitForFunction(()=>!document.querySelector('[data-local-tool] button')?.disabled);assert.equal(await page.locator('input[type=file]').evaluate(el=>el.files.length),1);}
 async function convert(name,expected){const started=Date.now();console.log('RUN',name);await page.getByRole('button',{name:messages.en.convert,exact:true}).click();const link=page.locator('a[download]');await Promise.race([link.waitFor({timeout:180000}),page.locator('[data-local-tool] [role=alert]').waitFor({timeout:180000}).then(async()=>{throw Error('Conversion: '+await page.locator('[data-local-tool] [role=alert]').textContent());})]);const download=page.waitForEvent('download');await link.click();const file=await download;const out=join(dir,`${results.length}-${file.suggestedFilename()}`);await file.saveAs(out);const probe=JSON.parse(execFileSync(ffprobe,['-v','error','-show_format','-show_streams','-of','json',out],{encoding:'utf8'}));const duration=Number(probe.format.duration);assert.ok(duration>0&&duration<3.2,name);assert.ok(probe.streams.some(s=>s.codec_type===expected),name);if(expected==='audio')assert.ok(probe.streams.every(s=>s.codec_type!=='video'));results.push({name,bytes:(await readFile(out)).length,duration,ms:Date.now()-started,codecs:probe.streams.map(s=>s.codec_name),audioBitrate:Number(probe.streams.find(s=>s.codec_type==='audio')?.bit_rate)||null,width:probe.streams.find(s=>s.codec_type==='video')?.width,height:probe.streams.find(s=>s.codec_type==='video')?.height});return probe;}
 await page.goto(base+'/video-to-mp3');await page.locator('input[type=file]').waitFor();await page.waitForTimeout(300);assert.equal(mediaRequests.length,0,'engine must stay lazy');
 for(const source of files)for(const [tool,path]of cases){await prepare(path,source);if(tool==='trim')await page.getByLabel(messages.en.end,{exact:true}).fill('1');if(tool==='gif')await page.getByLabel(messages.en.end,{exact:true}).fill('1');await convert(`${source.split('/').at(-1)} ${tool}`,tool==='audio'?'audio':'video');}
 for(const rate of ['128','320']){await prepare('/video-to-mp3',files[0]);await page.getByLabel(messages.en.bitrate).selectOption(rate);await convert(`MP3 ${rate}`,'audio');assert.ok(Math.abs(results.at(-1).audioBitrate-Number(rate)*1000)<4000);}
 await prepare('/video-to-gif',files[0]);await page.getByLabel(messages.en.end,{exact:true}).fill('1');await page.getByLabel(messages.en.fps).selectOption('15');await convert('GIF 15 fps exact timing','video');assert.ok(Math.abs(results.at(-1).duration-1)<.02);
 await prepare('/video-to-mp3',files[1]);await page.getByLabel(messages.en.audioFormat).selectOption('m4a');await convert('AAC copy M4A','audio');
 await prepare('/video-to-mp3',files[2]);await page.getByLabel(messages.en.audioFormat).selectOption('m4a');await page.locator('[data-local-tool] [role=alert]').filter({hasText:messages.en.errors.AAC}).waitFor();
 await prepare('/trim-video',files[0]);await page.getByLabel(messages.en.mode).selectOption('precise');await page.getByLabel(messages.en.start,{exact:true}).fill('0.3');await page.getByLabel(messages.en.end,{exact:true}).fill('1.2');await convert('precise trim','video');assert.ok(Math.abs(results.at(-1).duration-.9)<.15);
 for(const preset of ['light','strong']){await prepare('/compress-video',files[0]);await page.getByLabel(messages.en.preset).selectOption(preset);await convert(`compress ${preset}`,'video');}
 // Native codec preference and honest WebM fallback, including a real 4K decode/downscale.
 await prepare('/compress-video',fourK);await page.getByLabel(messages.en.maxHeight).selectOption('0');await convert('4K downscale MP4 preference','video');
 assert.ok(results.at(-1).width<=1920&&results.at(-1).height<=1080);
 const nativeMP4=await page.evaluate(async()=>{
  const v=await VideoEncoder.isConfigSupported({codec:'avc1.420033',width:1920,height:1080,bitrate:1000000,framerate:30});
  const a=await AudioEncoder.isConfigSupported({codec:'mp4a.40.2',numberOfChannels:1,sampleRate:44100,bitrate:128000});return v.supported&&a.supported;
 });
 if(nativeMP4)assert.deepEqual(results.at(-1).codecs,['h264','aac']);
 const engineBody=await(await fetch(base+'/local-media/generated/engine.js')).text();
 await page.route('**/local-media/generated/engine.js',route=>route.fulfill({contentType:'application/javascript',body:`const originalAudioSupport=AudioEncoder.isConfigSupported.bind(AudioEncoder);AudioEncoder.isConfigSupported=async c=>c.codec.startsWith('mp4a')?{supported:false,config:c}:originalAudioSupport(c);\n`+engineBody}));
 await prepare('/compress-video',files[0]);await page.getByText(messages.en.webmWarning,{exact:true}).waitFor();await convert('AAC unavailable WebM fallback','video');assert.deepEqual(results.at(-1).codecs,['vp8','opus']);await page.unroute('**/local-media/generated/engine.js');
 // A real FileSystemFileHandle from OPFS substitutes only for the native picker UI in automation.
 if(browserType===chromium){
  const disk=await browser.newContext({acceptDownloads:true});disk.on('request',inspectRequest);
  await disk.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{configurable:true,value:async options=>{
   if(window.__pickerMode==='abort')throw new DOMException('cancel','AbortError');
   if(window.__pickerMode==='unsupported')throw new DOMException('unavailable','NotSupportedError');
   const root=await navigator.storage.getDirectory();window.__savedHandle=await root.getFileHandle(options.suggestedName,{create:true});if(window.__pickerMode==='seed'){const stream=await window.__savedHandle.createWritable();await stream.write(new Uint8Array([1,2,3]));await stream.close();}return window.__savedHandle;
  }}));
  const dp=await disk.newPage();
  async function diskPrepare(path){await dp.goto(base+path);await dp.locator('input[type=file]').setInputFiles(files[0]);await dp.getByRole('button',{name:messages.en.convert,exact:true}).waitFor();await dp.waitForFunction(()=>!document.querySelector('[data-local-tool] button')?.disabled);}
  for(const path of ['/video-to-mp3','/trim-video','/compress-video']){
   await diskPrepare(path);await dp.getByRole('button',{name:messages.en.convert,exact:true}).click();await dp.locator('[data-local-result][data-saved=true]').waitFor({timeout:60000});assert.equal(await dp.locator('a[download]').count(),0);
   const bytes=await dp.evaluate(async()=>Array.from(new Uint8Array(await(await window.__savedHandle.getFile()).arrayBuffer()))),out=join(dir,'stream-'+path.slice(1));await writeFile(out,Buffer.from(bytes));const probe=JSON.parse(execFileSync(ffprobe,['-v','error','-show_format','-show_streams','-of','json',out],{encoding:'utf8'}));assert.ok(Number(probe.format.duration)>1.8);results.push({name:'direct StreamTarget '+path,bytes:bytes.length,duration:Number(probe.format.duration),codecs:probe.streams.map(s=>s.codec_name)});
  }
  await diskPrepare('/video-to-mp3');await dp.evaluate(()=>window.__pickerMode='abort');await dp.getByRole('button',{name:messages.en.convert,exact:true}).click();await dp.getByRole('alert').filter({hasText:messages.en.errors.CANCELLED}).waitFor();assert.equal(await dp.locator('[data-local-result]').count(),0);
  await diskPrepare('/video-to-mp3');await dp.evaluate(()=>window.__pickerMode='unsupported');await dp.getByRole('button',{name:messages.en.convert,exact:true}).click();await dp.getByText(messages.en.saveUnavailable,{exact:true}).waitFor();await dp.locator('a[download]').waitFor();
  await dp.route('**/local-media/generated/engine.js',route=>route.fulfill({contentType:'application/javascript',body:`const createNativeWritable=FileSystemFileHandle.prototype.createWritable;FileSystemFileHandle.prototype.createWritable=async function(...args){const stream=await createNativeWritable.apply(this,args);return {write:async chunk=>{await new Promise(r=>setTimeout(r,500));return stream.write(chunk);},close:()=>stream.close(),abort:reason=>stream.abort(reason)};};\n`+engineBody}));
  await diskPrepare('/compress-video');await dp.evaluate(()=>window.__pickerMode='seed');await dp.getByRole('button',{name:messages.en.convert,exact:true}).click();await dp.getByRole('button',{name:messages.en.cancel,exact:true}).click();await dp.getByRole('alert').filter({hasText:messages.en.errors.CANCELLED}).waitFor();await dp.waitForTimeout(1500);assert.deepEqual(await dp.evaluate(async()=>Array.from(new Uint8Array(await(await window.__savedHandle.getFile()).arrayBuffer()))),[1,2,3],'aborting a direct write preserves the previous destination');assert.equal(await dp.locator('[data-local-result]').count(),0);
  await dp.unroute('**/local-media/generated/engine.js');
  await dp.route('**/local-media/generated/engine.js',route=>route.fulfill({contentType:'application/javascript',body:`FileSystemFileHandle.prototype.createWritable=async()=>{throw new DOMException('permission denied','NotAllowedError');};\n`+engineBody}));
  await diskPrepare('/video-to-mp3');await dp.getByRole('button',{name:messages.en.convert,exact:true}).click();await dp.getByRole('alert').filter({hasText:messages.en.errors.SAVE}).waitFor();assert.equal(await dp.locator('[data-local-result]').count(),0);
  await disk.close();
 }
 // Admit real files at each byte cap and refuse one byte over; mobile is Chromium emulation, not physical hardware.
 const atCap=async(size,name)=>{const source=await readFile(files[0]),path=join(dir,name),handle=await open(path,'w');try{await handle.write(source);const header=Buffer.alloc(8);header.writeUInt32BE(size-source.length);header.write('free',4);await handle.write(header,0,8,source.length);await handle.truncate(size);}finally{await handle.close();}return path;};
 const desktopCap=await atCap(1024*1024**2,'desktop-cap.mp4');await prepare('/video-to-mp3',desktopCap);await convert('desktop 1 GiB admission','audio');
 await page.goto(base+'/video-to-mp3');await page.locator('input[type=file]').setInputFiles(await atCap(1024*1024**2+1,'over-desktop.mp4'));await page.locator('[data-local-tool] [role=alert]').filter({hasText:messages.en.errors.SIZE}).waitFor();
 // Refusal happens before any worker request; locale error labels must be local on all 32 pages.
 const roots=['','fr','es','pt','id','de','it','ar'];const slugs=[['video-to-mp3','compress-video','trim-video','video-to-gif'],['convertir-video-en-mp3','compresser-video','couper-video','video-en-gif'],['convertir-video-a-mp3','comprimir-video','cortar-video','video-a-gif'],['converter-video-para-mp3','comprimir-video','cortar-video','video-para-gif'],['konversi-video-ke-mp3','kompres-video','potong-video','video-ke-gif'],['video-in-mp3-umwandeln','video-komprimieren','video-schneiden','video-in-gif'],['convertire-video-in-mp3','comprimere-video','tagliare-video','video-in-gif'],['tahwil-video-ila-mp3','daght-video','qass-video','video-ila-gif']];
 for(const[i,locale]of Object.keys(messages).entries())for(const slug of slugs[i]){await page.goto(base+'/'+[roots[i],slug].filter(Boolean).join('/'));const before=mediaRequests.length;await page.locator('input[type=file]').setInputFiles({name:'empty.mp4',mimeType:'video/mp4',buffer:Buffer.alloc(0)});await page.locator('[data-local-tool] [role=alert]').filter({hasText:messages[locale].errors.SIZE}).waitFor();assert.equal(mediaRequests.length,before);}
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});await mobile.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true}));const mp=await mobile.newPage();await mp.goto(base+'/video-to-mp3');await mp.locator('input[type=file]').setInputFiles(await atCap(200*1024**2+1,'over-mobile.mp4'));await mp.locator('[data-local-tool] [role=alert]').filter({hasText:messages.en.errors.SIZE}).waitFor();const mobileCap=await atCap(200*1024**2,'mobile-cap.mp4');await mp.locator('input[type=file]').setInputFiles(mobileCap);await mp.getByRole('button',{name:messages.en.convert,exact:true}).waitFor();await mp.waitForFunction(()=>!document.querySelector('[data-local-tool] button')?.disabled);await mp.getByRole('button',{name:messages.en.convert,exact:true}).click();await mp.locator('a[download]').waitFor({timeout:180000});await mobile.close();
 await prepare('/video-to-gif',files[0]);await page.getByRole('button',{name:messages.en.convert,exact:true}).click();await page.getByRole('button',{name:messages.en.cancel,exact:true}).click();await page.locator('[data-local-tool] [role=alert]').filter({hasText:messages.en.errors.CANCELLED}).waitFor();assert.equal(await page.locator('a[download]').count(),0);
 assert.deepEqual(bad,[],'no third party, POST or request body during conversion');
 await writeFile(process.env.LOCAL_TEST_REPORT||join(tmpdir(),'vidfetch-local-tools-results.json'),JSON.stringify({browser:await browser.version(),results,localizedPages:32,privacy:{violations:bad,requests:[...new Set(mediaRequests)]},limits:{mobileMiB:200,desktopAudioTrimMiB:1024},physicalMobileTested:false},null,2));
 console.log(`LOCAL TOOLS PASS: ${results.length} outputs checked by ffprobe; 32 localized errors; lazy loading, size refusal, cancellation, no network upload or third-party contact.`);
}finally{await browser?.close();server.kill('SIGTERM');await rm(dir,{recursive:true,force:true});}
