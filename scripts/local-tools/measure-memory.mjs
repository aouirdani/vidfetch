/** Desktop laboratory only. Never describes Chromium mobile emulation as physical-phone measurement. */
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,cp,mkdtemp,appendFile,rm} from 'node:fs/promises';
import {spawnSync,execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium,webkit} from 'playwright';
if(process.platform!=='darwin')throw Error('Native physical-footprint sampling requires macOS; this harness does not report a fabricated zero on other hosts.');
const args=process.argv.slice(2),value=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const unbounded=args.includes('--allow-large-output'),baseline=args.includes('--baseline'),fixturePath=value('--fixtures','/private/tmp/vidfetch-camera-bench/manifest.json'),report=value('--report','/private/tmp/local-memory.jsonl'),filter=value('--filter',''),browserNames=value('--browsers','chromium,webkit').split(','),toolNames=value('--tools','audio,trim,compress,gif').split(','),sink=value('--sink','buffer'),device=value('--device','desktop'),clip=value('--clip',null);
const fixtures=JSON.parse(await readFile(fixturePath,'utf8')).filter(f=>!filter||f.id.includes(filter));
if(!fixtures.length||!['buffer','file','opfs'].includes(sink)||!['mobile','desktop'].includes(device)||toolNames.some(t=>!['audio','trim','compress','gif'].includes(t))||browserNames.some(b=>!['chromium','webkit'].includes(b)))throw Error('Invalid benchmark selection');
const lock=join(tmpdir(),'vidfetch-memory-benchmark.lock');
await writeFile(lock,String(process.pid),{flag:'wx'});
const root=await mkdtemp(join(tmpdir(),'vidfetch-memory-'));
let source=baseline?execFileSync('git',['show','0af98b33:src/local-tools/engine.worker.mjs'],{encoding:'utf8'}):await readFile('src/local-tools/engine.worker.mjs','utf8');
// Deliberately isolated admission override to measure files the former product refused. Never emitted in public/.
if(baseline)source=source.replace("import { LOCAL_LIMITS, PRESETS } from './limits.ts';",`const LOCAL_LIMITS={duration:3600,pixels:4096*2160,gifSeconds:15};const PRESETS={light:2000000,balanced:1000000,strong:500000};`);
if(!baseline&&unbounded)source=source.replace('limits=toolLimits(tool,device);','limits={...toolLimits(tool,device),inputBytes:2**30,duration:3600,bufferBytes:2**30};');
const nativeHelper=join(root,'process-memory');if(process.platform==='darwin')execFileSync('cc',['-O2','scripts/local-tools/process-memory.c','-o',nativeHelper]);
await build({stdin:{contents:source,resolveDir:resolve('src/local-tools'),sourcefile:'memory.worker.mjs'},outfile:join(root,'engine.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,plugins:[{name:'local-lame',setup(b){b.onLoad({filter:/mediabunny-mp3-encoder\.mjs$/},async p=>({contents:(await readFile(p.path,'utf8')).replace(/function Worker2\(\) \{[\s\S]*?\n\}/,()=>`function Worker2(){return new Worker('/local-media/generated/mp3.js',{type:'module'});}`),resolveDir:resolve('node_modules/@mediabunny/mp3-encoder/dist/bundles')}));}}]});
for(const name of ['mp3.js','lame.wasm'])await cp(`public/local-media/generated/${name}`,join(root,name));
const html=`<!doctype html><meta charset="utf-8"><input type="file"><video controls preload="metadata" width="640" height="360" style="max-height:208px"></video><script>
window.addEventListener('unhandledrejection',e=>window.state={stage:'error',error:String(e.reason?.message??e.reason)});
window.run=async(options,baseline,sink,device,clip)=>{const file=document.querySelector('input').files[0];document.querySelector('video').src=URL.createObjectURL(file);window.state={stage:'probe',progress:0};const worker=new Worker('/engine.js',{type:'module'});window.worker=worker;let handle;
worker.onerror=e=>window.state={stage:'error',error:e.message};worker.onmessage=async({data})=>{if(data.type==='ready'){window.state.stage='run';if(options.tool==='trim')options.end=String(clip===null?data.duration:Math.min(Number(clip),data.duration));if(!baseline){worker.postMessage({type:'plan',options});}else worker.postMessage({type:'run',options});}else if(data.type==='plan'){if(sink==='file'&&options.tool!=='gif')handle=await(await navigator.storage.getDirectory()).getFileHandle('measured-output.'+data.ext,{create:true});worker.postMessage({type:'run',options,fileHandle:handle,opfsId:'job-'+crypto.randomUUID(),name:'measured-output.'+data.ext});}else if(data.type==='progress')window.state.progress=data.value;else if((data.type==='error'||data.type==='plan-error'||data.type==='capacity-error'))window.state={stage:'error',error:data.code};else if(data.type==='result'){if(data.bytes)window.result=new Blob([data.bytes],{type:data.mime});window.state={stage:'done',ext:data.ext,bytes:data.bytes?.byteLength??data.size,duration:data.duration,mime:data.mime,saved:!!data.saved,opfs:!!data.opfsId};}};
worker.postMessage({type:'probe',file,limit:2**30,tool:options.tool,device,downloadAvailable:sink==='opfs'});};
</script>`;
const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}const name=req.url.split('/').at(-1);if(!['engine.js','mp3.js','lame.wasm'].includes(name)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',name.endsWith('wasm')?'application/wasm':'application/javascript');res.end(await readFile(join(root,name)));}catch{res.statusCode=500;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
function processes(){return execFileSync('ps',['-axo','pid=,ppid=,rss=,comm='],{encoding:'utf8'}).trim().split('\n').flatMap(line=>{const m=/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);return m?[{pid:+m[1],parent:+m[2],rss:+m[3]*1024,name:m[4]}]:[];});}
function resident(rootPid,before){
 const rows=processes(),pids=new Set([rootPid]);
 for(const r of rows)if(!before.has(r.pid)&&/com\.apple\.WebKit\.(?:WebContent|GPU|Networking).*Development/.test(r.name))pids.add(r.pid);
 for(let i=0;i<8;i++)for(const r of rows)if(pids.has(r.parent))pids.add(r.pid);
 const selected=rows.filter(r=>pids.has(r.pid));
 let footprint=0,lifetimePeakUpper=0,coverage=0;
 if(process.platform==='darwin'){
  const usage=execFileSync(nativeHelper,selected.map(r=>String(r.pid)),{encoding:'utf8'}).trim().split('\n');
  for(const line of usage){if(!line.trim())continue;const[, ,physical,max]=line.trim().split(/\s+/).map(Number);footprint+=physical;lifetimePeakUpper+=max;coverage++;}
  if(!coverage)throw Error('No permission to read native process footprint');
 }
 return {rss:selected.reduce((sum,r)=>sum+r.rss,0),footprint,lifetimePeakUpper,nativeProcesses:selected.length,nativeMeasured:coverage};
}
async function meters(browser,page,name,before){const impl=browser._connection.toImpl(browser),pid=impl.options.browserProcess.process.pid;let js=0,backing=0,samples=0,rootSession,rootImpl;const sessions=new Map();let webkitSession;
 if(name==='webkit'){webkitSession=page._connection.toImpl(page).delegate._session;webkitSession.on('Memory.trackingUpdate',({event})=>{js=event.categories.find(c=>c.type==='javascript')?.size??0;samples++;});await webkitSession.send('Memory.enable');await webkitSession.send('Memory.startTracking');}
 else{rootSession=await browser.newBrowserCDPSession();rootImpl=rootSession._connection.toImpl(rootSession);}
 return{async read(){if(name==='chromium'){const {targetInfos}=await rootSession.send('Target.getTargets');for(const t of targetInfos.filter(t=>['page','worker'].includes(t.type))){if(!sessions.has(t.targetId))try{sessions.set(t.targetId,await rootImpl.attachToTarget(t.targetId));}catch{}}let used=0,external=0;for(const session of sessions.values())try{const m=await session._send('Runtime.getHeapUsage');used+=m.usedSize;external+=m.backingStorageSize??0;}catch{}js=used;backing=external;samples++;}return{...resident(pid,before),js,backing,samples};},async stop(){if(webkitSession)await webkitSession.send('Memory.stopTracking').catch(()=>{});}};
}
await mkdir(resolve(report,'..'),{recursive:true});
try{for(const name of browserNames)for(const fixture of fixtures)for(const tool of toolNames){
 const before=new Map(processes().map(p=>[p.pid,p]));const type={chromium,webkit}[name],launch={headless:true,...(name==='chromium'&&process.platform==='darwin'?{channel:'chrome'}:{})};const persistent=sink==='opfs'?await type.launchPersistentContext(join(root,'profile-'+name+'-'+fixture.id+'-'+tool),launch):null;const browser=persistent?.browser()??await type.launch(launch);const page=persistent?await persistent.newPage():await browser.newPage();const network=[];page.on('request',r=>{if(new URL(r.url()).origin!==origin||r.method()!=='GET'||r.postDataBuffer()?.length)network.push({method:r.method(),origin:new URL(r.url()).origin});});
 let meter,result;const started=Date.now(),points=[];
 try{await page.goto(origin);meter=await meters(browser,page,name,before);await page.waitForTimeout(600);const idle=await meter.read();await page.locator('input').setInputFiles(fixture.path);
 const options={tool,audioFormat:'mp3',bitrate:'320',preset:'balanced',maxHeight:'1080',start:'0',end:String(tool==='gif'?Math.min(15,fixture.duration):fixture.duration),mode:'copy',width:'640',fps:'15'};
 await page.evaluate(({options,baseline,sink,device,clip})=>window.run(options,baseline,sink,device,clip),{options,baseline,sink,device,clip});
 let lastStage;for(;;){const metrics=await meter.read(),state=await page.evaluate(()=>window.state);points.push({ms:Date.now()-started,...metrics,stage:state.stage,progress:state.progress});if(state.stage!==lastStage){console.log(name,fixture.id,tool,state.stage);lastStage=state.stage;}if(['done','error'].includes(state.stage)){await page.waitForTimeout(250);points.push({ms:Date.now()-started,...await meter.read(),stage:'final'});result={...state};break;}if(Date.now()-started>Number(value('--timeout','900'))*1000){result={stage:'timeout'};break;}await page.waitForTimeout(100);}
 const peak=k=>Math.max(idle[k],...points.map(p=>p[k]));const row={variant:baseline?'baseline':sink,browser:name,browserVersion:browser.version(),tool,device,clip,fixture:{...fixture,path:undefined},idle,peak:{rss:peak('rss'),footprint:peak('footprint'),lifetimePeakUpper:peak('lifetimePeakUpper'),js:peak('js'),backing:peak('backing')},deltaRss:peak('rss')-idle.rss,deltaFootprint:peak('footprint')-idle.footprint,admissionOverride:baseline||unbounded,opfsConversionOnly:sink==='opfs',elapsedMs:Date.now()-started,result,network,sourceSha256:createHash('sha256').update(source).digest('hex'),memoryMethod:name==='chromium'?'V8 heap/backing sum across page+dedicated workers; macOS physical footprint and RSS across browser process tree':'Partial WebKit Memory javascript category; macOS physical footprint and RSS including WebContent/GPU/Networking XPC',sampleIntervalMs:100,samplingNote:'100 ms delay plus OS/CDP sampling overhead; subinterval peaks may be missed',samples:points.length,jsScope:name==='webkit'?'partial inspector category; excludes worker/external buffers in calibration':'page and worker V8 heap plus backing stores',nativeScope:'macOS physical footprint summed across browser processes, including WebKit XPC GPU/WebContent; not added to JS (overlap)'};await appendFile(report,JSON.stringify(row)+'\n');console.log(JSON.stringify({browser:name,fixture:fixture.id,tool,seconds:row.elapsedMs/1000,rssMiB:peak('rss')/1024**2,physicalMiB:peak('footprint')/1024**2,jsMiB:peak('js')/1024**2,backingMiB:peak('backing')/1024**2,result}));
 }catch(e){await appendFile(report,JSON.stringify({variant:baseline?'baseline':sink,browser:name,tool,fixture:fixture.id,error:e.message})+'\n');console.error(e.message);}finally{await meter?.stop();await browser.close();}
}}finally{server.close();await rm(root,{recursive:true,force:true});await rm(lock,{force:true});}
