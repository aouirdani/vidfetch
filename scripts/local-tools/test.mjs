import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium,webkit} from 'playwright';
const messages=JSON.parse(await readFile('src/local-tools/messages.json','utf8'));
const dir=await mkdtemp(join(tmpdir(),'vidfetch-local-test-'));
const ffmpeg=process.env.FFMPEG_PATH||'ffmpeg',ffprobe=process.env.FFPROBE_PATH||'ffprobe';
function fixture(name,codec,audio){const path=join(dir,name);execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x180:rate=15','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','2','-c:v',codec,'-pix_fmt','yuv420p','-c:a',audio,...(name.endsWith('.mov')?['-metadata:s:v:0','rotate=90']:[]),'-y',path]);return path;}
const files=[fixture('recording.mp4','libx264','aac'),fixture('iphone-style.mov','libx264','aac'),fixture('recording.webm','libvpx','libopus')];
const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
const base=`http://127.0.0.1:${port}`,server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{stdio:'ignore',env:{...process.env,VIDFETCH_TARGET:'ovh'}});
let browser;
const results=[];
try{
 for(let n=0;;n++){try{if((await fetch(base)).ok)break;}catch{}if(n>150)throw Error('Server startup');await new Promise(r=>setTimeout(r,100));}
 const wasmResponse=await fetch(base+'/local-media/generated/lame.wasm');assert.equal(wasmResponse.headers.get('content-type'),'application/wasm');assert.equal(wasmResponse.headers.get('cross-origin-embedder-policy'),null);assert.equal(wasmResponse.headers.get('cross-origin-opener-policy'),null);
 const browserType=process.env.LOCAL_BROWSER==='webkit'?webkit:chromium;browser=await browserType.launch({headless:true,...(browserType===chromium&&process.platform==='darwin'?{channel:'chrome'}:{})});
 const context=await browser.newContext({acceptDownloads:true});let bad=[],mediaRequests=[];
 context.on('request',r=>{const u=new URL(r.url());if(['http:','https:'].includes(u.protocol)){
  if(u.origin!==base||r.method()!=='GET'||(r.postDataBuffer()?.length??0)>0)bad.push({origin:u.origin,path:u.pathname,method:r.method()});
  if(u.pathname.startsWith('/local-media/'))mediaRequests.push(u.pathname);
 }});
 const page=await context.newPage();page.on('pageerror',e=>console.error('BROWSER',e.message));page.on('console',m=>{if(m.type()==='error')console.error('CONSOLE',m.text());});
 const cases=[['audio','/video-to-mp3'],['compress','/compress-video'],['trim','/trim-video'],['gif','/video-to-gif']];
 async function prepare(path,file){await page.goto(base+path);await page.locator('input[type=file]').setInputFiles(file);await page.getByRole('button',{name:messages.en.convert,exact:true}).waitFor({timeout:60000});assert.equal(await page.locator('input[type=file]').evaluate(el=>el.files.length),1);}
 async function convert(name,expected){const started=Date.now();console.log('RUN',name);await page.getByRole('button',{name:messages.en.convert,exact:true}).click();const link=page.locator('a[download]');await Promise.race([link.waitFor({timeout:180000}),page.locator('[data-local-tool] [role=alert]').waitFor({timeout:180000}).then(async()=>{throw Error('Conversion: '+await page.locator('[data-local-tool] [role=alert]').textContent());})]);const download=page.waitForEvent('download');await link.click();const file=await download;const out=join(dir,`${results.length}-${file.suggestedFilename()}`);await file.saveAs(out);const probe=JSON.parse(execFileSync(ffprobe,['-v','error','-show_format','-show_streams','-of','json',out],{encoding:'utf8'}));const duration=Number(probe.format.duration);assert.ok(duration>0&&duration<3.2,name);assert.ok(probe.streams.some(s=>s.codec_type===expected),name);if(expected==='audio')assert.ok(probe.streams.every(s=>s.codec_type!=='video'));results.push({name,bytes:(await readFile(out)).length,duration,ms:Date.now()-started,codecs:probe.streams.map(s=>s.codec_name),audioBitrate:Number(probe.streams.find(s=>s.codec_type==='audio')?.bit_rate)||null});}
 await page.goto(base+'/video-to-mp3');await page.locator('input[type=file]').waitFor();await page.waitForTimeout(300);assert.equal(mediaRequests.length,0,'engine must stay lazy');
 for(const source of files)for(const [tool,path]of cases){await prepare(path,source);if(tool==='trim')await page.getByLabel(messages.en.end,{exact:true}).fill('1');if(tool==='gif')await page.getByLabel(messages.en.end,{exact:true}).fill('1');await convert(`${source.split('/').at(-1)} ${tool}`,tool==='audio'?'audio':'video');}
 for(const rate of ['128','320']){await prepare('/video-to-mp3',files[0]);await page.getByLabel(messages.en.bitrate).selectOption(rate);await convert(`MP3 ${rate}`,'audio');assert.ok(Math.abs(results.at(-1).audioBitrate-Number(rate)*1000)<4000);}
 await prepare('/video-to-gif',files[0]);await page.getByLabel(messages.en.end,{exact:true}).fill('1');await page.getByLabel(messages.en.fps).selectOption('15');await convert('GIF 15 fps exact timing','video');assert.ok(Math.abs(results.at(-1).duration-1)<.02);
 await prepare('/video-to-mp3',files[1]);await page.getByLabel(messages.en.audioFormat).selectOption('m4a');await convert('AAC copy M4A','audio');
 await prepare('/video-to-mp3',files[2]);await page.getByLabel(messages.en.audioFormat).selectOption('m4a');await page.getByRole('button',{name:messages.en.convert,exact:true}).click();await page.locator('[data-local-tool] [role=alert]').filter({hasText:messages.en.errors.AAC}).waitFor();
 await prepare('/trim-video',files[0]);await page.getByLabel(messages.en.mode).selectOption('precise');await page.getByLabel(messages.en.start,{exact:true}).fill('0.3');await page.getByLabel(messages.en.end,{exact:true}).fill('1.2');await convert('precise trim','video');assert.ok(Math.abs(results.at(-1).duration-.9)<.15);
 for(const preset of ['light','strong']){await prepare('/compress-video',files[0]);await page.getByLabel(messages.en.preset).selectOption(preset);await convert(`compress ${preset}`,'video');}
 // Admit real files at each byte cap and refuse one byte over; mobile is Chromium emulation, not physical hardware.
 const atCap=async(size,name)=>{const source=await readFile(files[0]),buffer=Buffer.alloc(size);source.copy(buffer);const padding=size-source.length;buffer.writeUInt32BE(padding,source.length);buffer.write('free',source.length+4);const path=join(dir,name);await writeFile(path,buffer);return path;};
 const desktopCap=await atCap(32*1024**2,'desktop-cap.mp4');await prepare('/video-to-mp3',desktopCap);await convert('desktop 32 MiB admission','audio');
 await page.goto(base+'/video-to-mp3');await page.locator('input[type=file]').setInputFiles({name:'over-desktop.mp4',mimeType:'video/mp4',buffer:Buffer.alloc(32*1024**2+1)});await page.locator('[data-local-tool] [role=alert]').filter({hasText:messages.en.errors.SIZE}).waitFor();

 // Refusal happens before any worker request; locale error labels must be local on all 32 pages.
 const roots=['','fr','es','pt','id','de','it','ar'];const slugs=[['video-to-mp3','compress-video','trim-video','video-to-gif'],['convertir-video-en-mp3','compresser-video','couper-video','video-en-gif'],['convertir-video-a-mp3','comprimir-video','cortar-video','video-a-gif'],['converter-video-para-mp3','comprimir-video','cortar-video','video-para-gif'],['konversi-video-ke-mp3','kompres-video','potong-video','video-ke-gif'],['video-in-mp3-umwandeln','video-komprimieren','video-schneiden','video-in-gif'],['convertire-video-in-mp3','comprimere-video','tagliare-video','video-in-gif'],['tahwil-video-ila-mp3','daght-video','qass-video','video-ila-gif']];
 for(const[i,locale]of Object.keys(messages).entries())for(const slug of slugs[i]){await page.goto(base+'/'+[roots[i],slug].filter(Boolean).join('/'));const before=mediaRequests.length;await page.locator('input[type=file]').setInputFiles({name:'empty.mp4',mimeType:'video/mp4',buffer:Buffer.alloc(0)});await page.locator('[data-local-tool] [role=alert]').filter({hasText:messages[locale].errors.SIZE}).waitFor();assert.equal(mediaRequests.length,before);}
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});const mp=await mobile.newPage();await mp.goto(base+'/video-to-mp3');await mp.locator('input[type=file]').setInputFiles({name:'too-large.mp4',mimeType:'video/mp4',buffer:Buffer.alloc(8*1024**2+1)});await mp.locator('[data-local-tool] [role=alert]').filter({hasText:messages.en.errors.SIZE}).waitFor();const mobileCap=await atCap(8*1024**2,'mobile-cap.mp4');await mp.locator('input[type=file]').setInputFiles(mobileCap);await mp.getByRole('button',{name:messages.en.convert,exact:true}).waitFor();await mp.getByRole('button',{name:messages.en.convert,exact:true}).click();await mp.locator('a[download]').waitFor({timeout:180000});await mobile.close();
 await prepare('/video-to-gif',files[0]);await page.getByRole('button',{name:messages.en.convert,exact:true}).click();await page.getByRole('button',{name:messages.en.cancel,exact:true}).click();await page.locator('[data-local-tool] [role=alert]').filter({hasText:messages.en.errors.CANCELLED}).waitFor();assert.equal(await page.locator('a[download]').count(),0);
 assert.deepEqual(bad,[],'no third party, POST or request body during conversion');
 await writeFile(process.env.LOCAL_TEST_REPORT||join(tmpdir(),'vidfetch-local-tools-results.json'),JSON.stringify({browser:await browser.version(),results,localizedPages:32,privacy:{violations:bad,requests:[...new Set(mediaRequests)]},limits:{mobileMiB:8,desktopMiB:32},physicalMobileTested:false},null,2));
 console.log(`LOCAL TOOLS PASS: ${results.length} outputs checked by ffprobe; 32 localized errors; lazy loading, size refusal, cancellation, no network upload or third-party contact.`);
}finally{await browser?.close();server.kill('SIGTERM');await rm(dir,{recursive:true,force:true});}
