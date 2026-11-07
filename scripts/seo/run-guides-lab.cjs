const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const sharp=require('sharp');
const root=process.env.VIDFETCH_LAB_DIR||path.join(require('node:os').tmpdir(),'vidfetch-guides-lab-'+Date.now());
const assets=path.join(root,'screenshots');
const base='https://vidfetch.app';
for(const dir of [root,assets,path.join(root,'inputs'),path.join(root,'outputs')])fs.mkdirSync(dir,{recursive:true});
const ffmpeg=process.env.FFMPEG_PATH||'ffmpeg',ffprobe=process.env.FFPROBE_PATH||'ffprobe';
const m=JSON.parse(fs.readFileSync(path.join(process.cwd(),'src/local-tools/messages.json'))).en;
const probe=p=>JSON.parse(execFileSync(ffprobe,['-v','error','-show_format','-show_streams','-of','json',p],{encoding:'utf8'}));
function generate(name,{width=640,height=360,fps=30,rate=48000,channels=2,silent=false,codec='libx264',offset=0}={}){
 const out=path.join(root,'inputs',name);
 if(fs.existsSync(out))return out;
 const args=['-hide_banner','-loglevel','error','-f','lavfi','-i',`testsrc2=size=${width}x${height}:rate=${fps}`];
 if(!silent)args.push(...(offset?['-itsoffset',String(offset)]:[]),'-f','lavfi','-i',`sine=frequency=440:sample_rate=${rate}`);
 args.push('-t','6','-c:v',codec,'-pix_fmt','yuv420p');
 if(codec==='libx264')args.push('-preset','veryfast','-b:v','6000k','-minrate','6000k','-maxrate','6000k','-bufsize','12000k','-x264-params','nal-hrd=cbr','-g',String(fps*2),'-keyint_min',String(fps*2),'-sc_threshold','0');
 if(!silent)args.push('-c:a','aac','-b:a','192k','-ac',String(channels));
 args.push('-y',out);execFileSync(ffmpeg,args);return out;
}
const files={motion:generate('own-motion.mp4'),portrait:generate('phone-portrait.mp4',{width:360,height:640}),screen:generate('simulated-screen-recording.mp4'),mono:generate('mono-recording.mp4',{channels:1}),rate441:generate('recording-44100.mp4',{rate:44100}),rate480:generate('recording-48000.mp4'),fps60:generate('motion-60fps.mp4',{fps:60}),silent:generate('silent-video.mp4',{silent:true}),unsupported:generate('mpeg4-part2.mp4',{codec:'mpeg4'}),offset:generate('known-audio-offset.mp4',{offset:.4}),square:generate('square-video.mp4',{width:480,height:480}),fourfive:generate('four-five-video.mp4',{width:480,height:600})};
files.mov=path.join(root,'inputs','same-tracks.mov');if(!fs.existsSync(files.mov))execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-i',files.motion,'-c','copy','-y',files.mov]);
files.corrupt=path.join(root,'inputs','truncated.mp4');fs.writeFileSync(files.corrupt,fs.readFileSync(files.motion).subarray(0,512));
files.bars=path.join(root,'inputs','encoded-black-bars.mp4');if(!fs.existsSync(files.bars))execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=480x360:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','6','-vf','pad=640:360:80:0:black','-c:v','libx264','-preset','veryfast','-crf','12','-c:a','aac','-y',files.bars]);
const cases=[
 {id:'G18',key:'mobile-trim',tool:'trim',file:'portrait',mobile:true,options:{mode:'precise',start:'0.5',end:'3.5'}},
 {id:'G10',key:'mobile-compress',tool:'compress',file:'portrait',mobile:true,options:{preset:'strong',maxHeight:'480'}},
 {id:'G01',key:'mobile-audio',tool:'audio',file:'portrait',mobile:true,options:{bitrate:'192'}},
 {id:'G11',key:'mov-to-mp4',tool:'compress',file:'mov',options:{preset:'balanced',maxHeight:'720'}},
 {id:'G07',key:'discord-copy',tool:'compress',file:'motion',options:{preset:'strong',maxHeight:'360'}},
 {id:'G02',key:'screen-to-mp3',tool:'audio',file:'screen',options:{bitrate:'192'}},
 {id:'G19',key:'keyframe-copy',tool:'trim',file:'motion',options:{mode:'copy',start:'0.3',end:'2.7'}},
 {id:'G19',key:'keyframe-precise',tool:'trim',file:'motion',options:{mode:'precise',start:'0.3',end:'2.7'}},
 {id:'G12',key:'create-gif',tool:'gif',file:'motion',options:{start:'1',end:'3',width:'320',fps:'10'}},
 {id:'G20',key:'compression-light',tool:'compress',file:'motion',options:{preset:'light',maxHeight:'360'}},
 {id:'G20',key:'compression-strong',tool:'compress',file:'motion',options:{preset:'strong',maxHeight:'360'}},
 {id:'G14',key:'gif-five-fps',tool:'gif',file:'motion',options:{start:'1',end:'3',width:'320',fps:'5'}},
 {id:'G14',key:'gif-fifteen-fps',tool:'gif',file:'motion',options:{start:'1',end:'3',width:'320',fps:'15'}},
 {id:'G05',key:'mono-output',tool:'audio',file:'mono',options:{bitrate:'192'}},
 {id:'G05',key:'stereo-output',tool:'audio',file:'motion',options:{bitrate:'192'}},
 {id:'G30',key:'mov-container-copy',tool:'trim',file:'mov',options:{mode:'copy',start:'0',end:'6'}},
 {id:'G03',key:'mp3-128',tool:'audio',file:'motion',options:{bitrate:'128'}},
 {id:'G03',key:'mp3-192',tool:'audio',file:'motion',options:{bitrate:'192'}},
 {id:'G03',key:'mp3-320',tool:'audio',file:'motion',options:{bitrate:'320'}},
 {id:'G13',key:'gif-quality-160',tool:'gif',file:'motion',options:{start:'1',end:'3',width:'160',fps:'10'}},
 {id:'G13',key:'gif-quality-640',tool:'gif',file:'motion',options:{start:'1',end:'3',width:'640',fps:'10'}},
 {id:'G29',key:'bars-remain',tool:'compress',file:'bars',options:{preset:'balanced',maxHeight:'360'}},
 {id:'G08',key:'email-copy',tool:'compress',file:'motion',options:{preset:'balanced',maxHeight:'480'}},
 {id:'G16',key:'thirty-fps-output',tool:'compress',file:'motion',options:{preset:'balanced',maxHeight:'360'}},
 {id:'G16',key:'sixty-fps-output',tool:'compress',file:'fps60',options:{preset:'balanced',maxHeight:'360'}},
 {id:'G09',key:'whatsapp-copy',tool:'compress',file:'motion',options:{preset:'strong',maxHeight:'480'}},
 {id:'G06',key:'bitrate-reference',tool:'audio',file:'motion',options:{bitrate:'192'}},
 {id:'G22',key:'codec-refusal',tool:'compress',file:'unsupported',expectError:true},
 {id:'G23',key:'no-track-refusal',tool:'audio',file:'silent',expectError:true},
 {id:'G24',key:'offset-precise-trim',tool:'trim',file:'offset',options:{mode:'precise',start:'0',end:'4'}},
 {id:'G15',key:'reduce-360',tool:'compress',file:'portrait',options:{preset:'balanced',maxHeight:'360'}},
 {id:'G21',key:'metadata-aac-copy',tool:'audio',file:'motion',options:{audioFormat:'m4a'}},
 {id:'G17',key:'ratio-portrait',tool:'compress',file:'portrait',options:{preset:'balanced',maxHeight:'720'}},
 {id:'G17',key:'ratio-square',tool:'compress',file:'square',options:{preset:'balanced',maxHeight:'720'}},
 {id:'G17',key:'ratio-four-five',tool:'compress',file:'fourfive',options:{preset:'balanced',maxHeight:'720'},screenshot:false},
 {id:'G26',key:'truncated-refusal',tool:'trim',file:'corrupt',expectError:true},
 {id:'G04',key:'sample-44100',tool:'audio',file:'rate441',options:{bitrate:'192'}},
 {id:'G04',key:'sample-48000',tool:'audio',file:'rate480',options:{bitrate:'192'}},
 {id:'G25',key:'split-part-one',tool:'trim',file:'motion',options:{mode:'precise',start:'0',end:'3'}},
 {id:'G25',key:'split-part-two',tool:'trim',file:'motion',options:{mode:'precise',start:'3',end:'6'}},
];
const paths={audio:'/video-to-mp3',compress:'/compress-video',trim:'/trim-video',gif:'/video-to-gif'};
const report={startedAt:new Date().toISOString(),base,browser:null,physicalPhoneTested:false,siteScreenshotsOnly:true,inputs:{},results:[]};
for(const [name,p]of Object.entries(files)){try{report.inputs[name]={file:path.basename(p),bytes:fs.statSync(p).size,probe:probe(p)};}catch{report.inputs[name]={file:path.basename(p),bytes:fs.statSync(p).size,intentionallyTruncated:true};}}
function persist(){fs.writeFileSync(path.join(root,'results.json'),JSON.stringify(report,null,2));}
(async()=>{
 const browser=await chromium.launch({headless:true});report.browser=await browser.version();
 try{
  const health=await fetch(base+'/api/health').then(r=>r.json());report.releaseAtStart=health.release;
  for(const job of cases.filter(job=>!process.env.VIDFETCH_LAB_IDS||process.env.VIDFETCH_LAB_IDS.split(',').includes(job.id))){
   console.log('RUN',job.id,job.key);const begun=Date.now();
   const context=await browser.newContext({viewport:job.mobile?{width:390,height:844}:{width:1100,height:900},isMobile:!!job.mobile,hasTouch:!!job.mobile,acceptDownloads:true});
   await context.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true}));
   const page=await context.newPage();let violations=[];
   const result={id:job.id,key:job.key,tool:job.tool,path:paths[job.tool],input:job.file,options:job.options??{},mobileEmulation:!!job.mobile,startedAt:new Date().toISOString()};
   try{
    const response=await page.goto(base+paths[job.tool],{waitUntil:'networkidle'});assert.equal(response.status(),200);
    context.on('request',request=>{const u=new URL(request.url());if(['http:','https:'].includes(u.protocol)&&(u.origin!==base||request.method()!=='GET'||(request.postDataBuffer()?.length??0)>0))violations.push({origin:u.origin,method:request.method(),pathname:u.pathname});});
    await page.locator('input[type=file]').setInputFiles(files[job.file]);
    if(job.expectError){await page.locator('[data-local-tool] [role=alert]').waitFor({timeout:90000});result.error=await page.locator('[data-local-tool] [role=alert]').innerText();assert.equal(await page.locator('[data-local-download]').count(),0);}
    else{
     const button=page.getByRole('button',{name:m.convert,exact:true});await button.waitFor({timeout:90000});
     for(const [key,value]of Object.entries(job.options??{})){
      const control=page.getByLabel(m[key],{exact:true});if(['start','end'].includes(key))await control.fill(value);else await control.selectOption(value);
     }
     await page.waitForFunction(()=>{const b=[...document.querySelectorAll('[data-local-tool] button')].find(b=>b.textContent==='Convert locally');return b&&!b.disabled;},{},{timeout:90000});
     result.plannedFormat=await page.locator('[data-local-tool]').innerText().then(t=>t.includes(m.webmWarning)?'WebM fallback shown':'No WebM warning');
     await button.click();const link=page.locator('[data-local-download]');
     await Promise.race([link.waitFor({timeout:180000}),page.locator('[data-local-tool] [role=alert]').waitFor({timeout:180000}).then(async()=>{throw Error(await page.locator('[data-local-tool] [role=alert]').innerText());})]);
     const pending=page.waitForEvent('download');await link.click();const download=await pending;
     const out=path.join(root,'outputs',job.key+'-'+download.suggestedFilename());await download.saveAs(out);result.output={file:path.basename(out),bytes:fs.statSync(out).size,probe:probe(out)};result.outcome='completed';
    }
    if(job.screenshot!==false){
     await page.locator('[data-local-tool]').scrollIntoViewIfNeeded();
     const png=await page.locator('[data-local-tool]').screenshot({animations:'disabled'});const filename=job.key+'.webp';const image=await sharp(png).webp({quality:82}).toBuffer({resolveWithObject:true});fs.writeFileSync(path.join(assets,filename),image.data);result.screenshot={file:filename,width:image.info.width,height:image.info.height,bytes:image.data.length};
    }
    assert.deepEqual(violations,[]);result.uploadOrThirdPartyRequests=violations.length;result.elapsedMs=Date.now()-begun;result.finishedAt=new Date().toISOString();if(job.expectError)result.outcome='refused-as-expected';
   }catch(e){result.outcome='lab-failed';result.labError=e.message;console.error('CASE FAILED',job.key,e.message);}
   finally{await context.close();report.results.push(result);persist();}
  }
  report.finishedAt=new Date().toISOString();persist();console.log('DONE',report.results.length,'cases',report.results.filter(r=>r.outcome==='lab-failed').length,'failures');
 }finally{await browser.close();}
})().catch(error=>{persist();console.error(error);process.exitCode=1;});
