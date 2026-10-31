#!/usr/bin/env node
/** Operator-only verification using the normal public website and its human verification UI. */
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
export function parseLinks(text){return [...new Set(text.split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#')))].map(link=>{
 const u=new URL(link);if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash)throw Error('Use HTTPS publication URLs without credentials, query strings or fragments.');
 let platform,type;
 if(['instagram.com','www.instagram.com'].includes(u.hostname)&&/^\/(reel|p)\/[\w-]{5,80}\/?$/.test(u.pathname)){platform='instagram';type=u.pathname.split('/')[1]==='reel'?'reel':'video-post';}
 else if(['x.com','www.x.com','twitter.com','www.twitter.com'].includes(u.hostname)&&/^\/(?:\w{1,20}\/status|i\/web\/status)\/\d+\/?$/.test(u.pathname)){platform='x';type='video-post';}
 else throw Error('Only individual Instagram reel/p and X video status URLs are accepted.');
 return{link,platform,type};
});}
export function safeCode(value){return typeof value==='string'&&/^[A-Z_]{3,60}$/.test(value)?value:'UNSUPPORTED';}
export function mediaSummary(probe,kind){const duration=Number(probe.format?.duration),streams=probe.streams??[];if(!Number.isFinite(duration)||duration<=0)throw Error('INVALID_MEDIA');const audio=streams.filter(s=>s.codec_type==='audio'),video=streams.filter(s=>s.codec_type==='video');if(kind==='mp3'&&(!audio.some(s=>s.codec_name==='mp3')||video.length))throw Error('INVALID_MP3');if(kind==='mp4'&&(!video.length||!String(probe.format?.format_name).split(',').includes('mp4')))throw Error('INVALID_MP4');return{durationSeconds:duration,audioTracks:audio.length,videoTracks:video.length,codecs:streams.filter(s=>['audio','video'].includes(s.codec_type)).map(s=>String(s.codec_name).replace(/[^a-z0-9_]/gi,'').slice(0,30))};}
export function reportMarkdown(report){return `# ${report.platform} — operator verification\n\nRun: ${report.startedAt}. Rights declaration confirmed. No account cookies, proxy or platform login used.\n\nSuccessful operations: ${report.passed}/${report.attempted} (${report.ratePercent}%). Unattempted operations are excluded. This sample is not a general support guarantee.\n\n| Provided publication | Type | Format | Result | Code | Seconds |\n|---|---|---|---|---|---|\n${report.results.map(r=>`| ${r.link.replace(/\|/g,'%7C')} | ${r.type} | ${r.kind} | ${r.status} | ${r.code??''} | ${r.seconds??''} |`).join('\n')}\n\nSupported-in-sample link types: ${report.typesPassing.join(', ')||'none'}. Inspect the JSON for track and duration checks. Never publish if login or platform restrictions prevent the promised use.\n`;}
export async function verify({file,out='platform-verification',origin='https://vidfetch.app',confirm}){
 if(origin!=='https://vidfetch.app')throw Error('This operator command uses only https://vidfetch.app. Tests must use fixtures without running verify().');
 const links=parseLinks(await readFile(file,'utf8'));if(!links.length||links.length>3)throw Error('Provide 1–3 authorized links per run, at most six download operations. Budget includes your other usage today.');
 if(!confirm)throw Error('Required: --confirm-rights. Use only your own publications or explicitly authorized content.');
 if(!stdin.isTTY)throw Error('Interactive terminal required for the rights declaration and normal human verification.');
 const prompt=createInterface({input:stdin,output:stdout});let answer;try{answer=await prompt.question('I have the right to download every provided publication. I will not sign into any platform or bypass a restriction. Type I HAVE PERMISSION: ');}finally{prompt.close();}
 if(answer!=='I HAVE PERMISSION')throw Error('Rights confirmation not given. No request sent.');
 const d=JSON.parse(await readFile('src/i18n/messages/en.json','utf8')),dir=await mkdtemp(join(tmpdir(),'vidfetch-authorized-'));
 let browser;const results=[],startedAt=new Date().toISOString();let exhausted=false;
 try{
  // Fresh context: never accept account cookies, browser profiles, proxy configuration or storageState.
  browser=await chromium.launch({headless:false});const context=await browser.newContext({acceptDownloads:true});
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(/(^|\.)(instagram\.com|instagr\.am|x\.com|twitter\.com)$/.test(u.hostname))return route.abort();return route.continue();});
  const page=await context.newPage();console.log('Complete VidFetch’s usual human verification in the visible browser when asked. Do not open or sign into a platform.');
  for(const entry of links){
   let info;
   if(!exhausted){await page.goto(origin,{waitUntil:'domcontentloaded'});await page.getByRole('textbox',{name:d.videoLink}).fill(entry.link);
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/fetch-info',{timeout:180000});await page.getByRole('button',{name:d.extract,exact:true}).click();
    try{const res=await response;const payload=await res.json();if(!res.ok()||!payload.ok){const code=safeCode(payload.code);if(/QUOTA|RATE|BUSY|QUEUE_FULL/.test(code))exhausted=true;info={error:code};}else info=payload.info;}catch{info={error:'ANALYSIS_TIMEOUT'};}
   }
   for(const kind of ['mp4','mp3']){
    const begin=Date.now(),record={...entry,kind,status:'unsupported'};
    if(exhausted){results.push({...record,status:'not-attempted',code:'QUOTA_OR_QUEUE_STOP'});continue;}
    if(info?.error){results.push({...record,code:info.error,seconds:(Date.now()-begin)/1000});continue;}
    const formats=kind==='mp4'?info?.videoFormats:info?.audioFormats,format=formats?.find(f=>f.ext===kind);
    if(!format){results.push({...record,code:'NO_MATCHING_FORMAT'});continue;}
    let popup;
    try{
     await page.getByRole('tab',{name:new RegExp(kind==='mp4'?d.video:d.audio)}).click();
     const radios=page.getByRole('radiogroup').getByRole('radio');if(await radios.count()!==formats.length)throw Error('FORMAT_NOT_UNAMBIGUOUS');await radios.nth(formats.indexOf(format)).click();
     // The normal UI owns access proofs, queue polling and tickets. No API bypass or retry loop.
     const opened=page.waitForEvent('popup',{timeout:30000});await page.getByRole('button',{name:new RegExp('^'+d.download+' ')}).click();popup=await opened;
     let restricted=false;const onResponse=async res=>{if(!['/api/download','/api/queue'].some(p=>new URL(res.url()).pathname.startsWith(p)))return;if(res.status()===429||res.status()===503){restricted=true;exhausted=true;}};context.on('response',onResponse);
     try{const download=await popup.waitForEvent('download',{timeout:660000});const path=join(dir,`result-${results.length}.${kind}`);await download.saveAs(path);if(await download.failure())throw Error('DOWNLOAD_FAILED');const probe=JSON.parse(execFileSync(process.env.FFPROBE_PATH||'ffprobe',['-v','error','-show_format','-show_streams','-of','json',path],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024}));Object.assign(record,{status:'pass',media:mediaSummary(probe,kind)});await rm(path,{force:true});}finally{context.off('response',onResponse);}
     if(restricted)Object.assign(record,{status:'unsupported',code:'QUOTA_OR_QUEUE_STOP'});
    }catch{record.code=exhausted?'QUOTA_OR_QUEUE_STOP':'DOWNLOAD_OR_VALIDATION_FAILED';}finally{await popup?.close().catch(()=>{});}
    record.seconds=Number(((Date.now()-begin)/1000).toFixed(2));results.push(record);
   }
  }
 }finally{await browser?.close();await rm(dir,{recursive:true,force:true});}
 await mkdir(out,{recursive:true});for(const platform of ['instagram','x']){const rows=results.filter(r=>r.platform===platform);if(!rows.length)continue;const attempted=rows.filter(r=>r.status!=='not-attempted').length,passed=rows.filter(r=>r.status==='pass').length;const report={platform,startedAt,rightsConfirmed:true,attempted,passed,ratePercent:attempted?Number((passed/attempted*100).toFixed(1)):0,typesPassing:[...new Set(rows.filter(r=>r.status==='pass').map(r=>r.type))],results:rows};await writeFile(join(out,`${platform}.json`),JSON.stringify(report,null,2)+'\n');await writeFile(join(out,`${platform}.md`),reportMarkdown(report));}
 console.log('Reports written. No signed media URL, title, uploader, cookie or ticket was included. Review failures before any publication.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const args=process.argv.slice(2),allowed=['--links','--out','--confirm-rights'];for(let i=0;i<args.length;i++){if(!allowed.includes(args[i]))throw Error('Unknown option. Cookies, credentials, proxies and browser-profile options are forbidden.');if(args[i]!=='--confirm-rights')i++;}const option=n=>args[args.indexOf(n)+1];verify({file:option('--links'),out:args.includes('--out')?option('--out'):undefined,confirm:args.includes('--confirm-rights')}).catch(()=>{console.error('Verification stopped. Check input, explicit rights confirmation, local browser and ffprobe. No automatic retry or workaround.');process.exitCode=1;});}
