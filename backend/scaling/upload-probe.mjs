// At most 896 KiB of zero-filled WAN upload, three low-rate stages. No secrets.
// This measures a safe observed lower bound, never the saturated ISP capacity.
import {request} from 'node:https';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {once} from 'node:events';
import {performance} from 'node:perf_hooks';
const result={at:new Date().toISOString(),status:'NON TESTÉ',bytes:0,stages:[],maximumCapacityValidated:false};
const guard=async()=>{
 if(process.platform!=='linux')throw Error('Linux Pi only');
 const probe=spawnSync('/usr/bin/vcgencmd',['get_throttled'],{encoding:'utf8',timeout:3000});
 const match=probe.stdout?.match(/0x([0-9a-f]+)/i);if(!match||probe.status!==0)throw Error('Power/thermal status unavailable');
 const flag=parseInt(match[1],16);if(flag&15)throw Error('Current undervoltage or throttling: '+match[0]);
 const temperature=Number(await readFile('/sys/class/thermal/thermal_zone0/temp','utf8'));
 const memory=await readFile('/proc/meminfo','utf8');if(temperature>=65000||Number(memory.match(/^MemAvailable:\s+(\d+)/m)?.[1])<262144)throw Error('Resource guard');
 for(const name of await readdir('/proc'))if(/^\d+$/.test(name))try{if(/^(yt-dlp|ffmpeg)$/.test((await readFile(`/proc/${name}/comm`,'utf8')).trim()))throw Error('Existing media operation');}catch(error){if(error.message==='Existing media operation')throw error;}
};
const controlAgent=undefined;
async function probe(){return new Promise((resolve,reject)=>{
 const start=performance.now(),req=request('https://speed.cloudflare.com/__down?bytes=0',{method:'GET',agent:controlAgent,timeout:3000},res=>{res.resume();res.on('end',()=>res.statusCode===200?resolve(performance.now()-start):reject(Error('Probe endpoint unavailable')));});
 req.on('timeout',()=>req.destroy(Error('Latency timeout')));req.on('error',reject);req.end();
});}
async function upload(rate,baseline){
 const controller=new AbortController(),size=rate*4,started=performance.now();let sent=0,watching=false,peakLatency=0;
 const response=new Promise((resolve,reject)=>{const req=request('https://speed.cloudflare.com/__up',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/octet-stream','Content-Length':size}},res=>{res.resume();res.on('end',()=>res.statusCode===200?resolve({http:200,seconds:(performance.now()-started)/1000}):reject(Error('Upload HTTP '+res.statusCode)));});req.on('error',reject);
  void(async()=>{try{while(sent<size){controller.signal.throwIfAborted();const bytes=Math.min(8192,size-sent);if(!req.write(Buffer.alloc(bytes)))await once(req,'drain',{signal:controller.signal});sent+=bytes;result.bytes+=bytes;await delay(Math.max(0,started+sent/rate*1000-performance.now()),undefined,{signal:controller.signal});}req.end();}catch(error){req.destroy(error);}})();
 });
 void response.catch(()=>{});
 const deadline=setTimeout(()=>controller.abort(Error('Upload duration limit')),10000);
 const monitor=setInterval(()=>{if(watching)return;watching=true;void(async()=>{try{await guard();const latency=await probe();peakLatency=Math.max(peakLatency,latency);if(latency>baseline+50)controller.abort(Error('Latency increase; stopping'));}catch(error){controller.abort(error);}finally{watching=false;}})();},1000);
 try{const reply=await response;return{...reply,bytes:sent,rateLimitMbps:rate*8/1e6,observedMbps:sent*8/1e6/reply.seconds,peakLatencyMs:peakLatency};}
 finally{clearInterval(monitor);clearTimeout(deadline);controller.abort();while(watching)await delay(10);}
}
try{
 await guard();const latencies=[];for(let i=0;i<3;i++){latencies.push(await probe());await delay(500);}const baseline=latencies.sort((a,b)=>a-b)[1];result.baselineMs=baseline;
 for(const rate of [32768,65536,131072]){await guard();result.stages.push(await upload(rate,baseline));await delay(1000);}
 result.status='VALIDÉ : lower bound only';
}catch(error){result.status=result.bytes?'ARRÊT DE PRÉCAUTION':'BLOQUÉ';result.reason=error.message;}
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(result,null,2)+'\n',{flag:'wx'});else console.log(JSON.stringify(result,null,2));
if(result.status==='BLOQUÉ')process.exitCode=2;
