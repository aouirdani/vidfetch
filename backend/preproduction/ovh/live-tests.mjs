// Root-only local validation. Service signing key is read in memory and never written/logged.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,createWriteStream,readdirSync} from 'node:fs';
import {createHash,createHmac,generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {request} from 'node:http';
import {spawnSync} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {Readable,Transform} from 'node:stream';
import {setTimeout as delay} from 'node:timers/promises';
const dir=process.argv[2];assert(dir?.startsWith('/home/debian/vidfetch-ovh-20261012-'));
const rawBase='http://127.0.0.1:8788',gateBase='http://127.0.0.1:8789',aud='https://api.vidfetch.app',url='https://www.youtube.com/watch?v=aqz-KE-bpKQ';
const secret=Buffer.from(readFileSync('/etc/vidfetch/gateway.env','utf8').split('\n').find(s=>s.startsWith('VIDFETCH_ACCESS_SIGNING_KEY=')).split('=')[1],'base64url');
function localFetch(url,init={}){
 return new Promise((resolve,reject)=>{
  const req=request(url,{method:init.method??'GET',headers:init.headers,signal:init.signal??AbortSignal.timeout(150000)},res=>{
   const headers=new Headers();for(const [name,value]of Object.entries(res.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(', '):value);
   resolve(new Response(res.statusCode===204?null:Readable.toWeb(res),{status:res.statusCode,headers}));
  });req.on('error',reject);req.end(init.body);
 });
}
const digest=v=>createHash('sha256').update(v).digest('base64url');
const report={started:new Date().toISOString(),scope:'VPS shared backend using fixed public licensed fixture metadata; actual yt-dlp/ffmpeg, UID egress and installed authenticated gateway. Not a successful YouTube extraction or Internet browser test.',checks:[],samples:[],transfers:[]};
const check=(name,ok,evidence={})=>{report.checks.push({name,ok,...evidence});assert(ok,name);};
function actor(ip){
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),key=publicKey.export({format:'jwk'}),owner=randomUUID();
 function auth(path,method='GET',body=''){
  const now=Math.floor(Date.now()/1000),claims={iss:'vidfetch-access',aud,purpose:'api',sub:owner,key,iat:now,exp:now+120};
  const head=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),payload=Buffer.from(JSON.stringify(claims)).toString('base64url'),data=head+'.'+payload;
  const token=data+'.'+createHmac('sha256',secret).update(data).digest('base64url');
  const proof=Buffer.from(JSON.stringify({iat:now,jti:randomUUID(),method,path,bodyHash:digest(body),tokenHash:digest(token)})).toString('base64url');
  return {Authorization:'Bearer '+token,'X-VidFetch-Proof':proof+'.'+sign('sha256',Buffer.from(proof),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')};
 }
 const edge={Host:'api.vidfetch.app','X-Forwarded-Proto':'https','X-Forwarded-For':ip};
 async function call(path,method='GET',object,extra={}){
  const body=object===undefined?'':JSON.stringify(object);
  return localFetch(gateBase+path,{method,headers:{...edge,...auth(path,method,body),...(body?{'Content-Type':'application/json'}:{}),...extra},...(body?{body}:{}),signal:AbortSignal.timeout(150000)});
 }
 return {owner,auth,edge,call};
}
let videoFormat='ogv';
const a=actor('203.0.113.40'),b=actor('203.0.113.41'),c=actor('203.0.113.42');
function sample(){
 const s={at:Date.now(),processes:[]};
 for(const id of readdirSync('/proc').filter(p=>/^\d+$/.test(p)))try{
  const text=readFileSync('/proc/'+id+'/status','utf8'),uid=Number(text.match(/^Uid:\s+(\d+)/m)?.[1]);
  if(![999,995].includes(uid))continue;
  s.processes.push({pid:Number(id),ppid:Number(text.match(/^PPid:\s+(\d+)/m)?.[1]),name:text.match(/^Name:\s+(.+)/m)?.[1],rssKiB:Number(text.match(/^VmRSS:\s+(\d+)/m)?.[1]??0)});
 }catch{}
 for(const service of ['vidfetch','vidfetch-gateway'])try{
  const path='/sys/fs/cgroup/system.slice/'+service+'.service/';
  s[service]={memory:Number(readFileSync(path+'memory.current','utf8')),peak:Number(readFileSync(path+'memory.peak','utf8')),cpuUsec:Number(readFileSync(path+'cpu.stat','utf8').match(/^usage_usec (\d+)/m)[1])};
 }catch{}
 report.samples.push(s);
}
async function status(token){const r=await a.call('/api/download?status='+token);return {http:r.status,...await r.json()};}
async function ready(type){const r=await a.call('/api/download','POST',{url,format_id:type==='audio'?'mp3':videoFormat,type});check('prepare_'+type,r.status===201,{http:r.status});return r.json();}
async function cookie(item){const r=await a.call('/auth/transfer','POST',{ticket:item.token});check('transfer_authorization',r.status===200,{http:r.status});return r.headers.get('set-cookie').split(';')[0];}
async function waitTerminal(token){let state;for(let i=0;i<100;i++){state=await status(token);if(['completed','failed','aborted','expired'].includes(state.status))return state;await delay(50);}throw Error('terminal_status_timeout');}
const timer=setInterval(sample,500);sample();
try{
 const health=await(await localFetch(rawBase+'/api/health')).json();check('fixture_identified',health.engine.fixture===true&&health.engine.isolationProfile==='vidfetch-uid-nft-v1');
 for(const [name,path,options,expected]of [
  ['invalid_json','/api/fetch-info',{method:'POST',body:'{'},400],
  ['oversize','/api/fetch-info',{method:'POST',body:JSON.stringify({pad:'x'.repeat(9000)})},413],
  ['private_url','/api/fetch-info',{method:'POST',body:JSON.stringify({url:'http://127.0.0.1:8787'})},400],
  ['invalid_type','/api/download',{method:'POST',body:JSON.stringify({url,format_id:'ogv',type:'bad'})},400],
  ['http_method','/api/fetch-info',{method:'GET'},405],
  ['unknown_ticket','/api/download?ticket=missing',{},404],
  ['unknown_status','/api/download?status=missing',{},404],
 ]){const r=await localFetch(rawBase+path,options);const data=await r.json();check(name,r.status===expected,{http:r.status,code:data.code});}
 const missing=await localFetch(gateBase+'/api/health',{headers:a.edge});check('authentication_required',missing.status===401,{http:missing.status});
 const outsider=await a.call('/api/health','GET',undefined,{Origin:'https://evil.example'});check('origin_denied',outsider.status===403,{http:outsider.status});
 const signed=a.auth('/api/health'),first=await localFetch(gateBase+'/api/health',{headers:{...a.edge,...signed}});check('authenticated_health',first.status===200);
 const replay=await localFetch(gateBase+'/api/health',{headers:{...a.edge,...signed}});check('proof_replay',replay.status===401,{http:replay.status});
 const infoR=await a.call('/api/fetch-info','POST',{url}),info=await infoR.json();check('fixture_fetch_info',infoR.status===200&&info.info.formats.some(f=>f.kind==='video')&&info.info.audioFormats.some(f=>f.id==='mp3'),{http:infoR.status,formatCount:info.info.formats.length});videoFormat=info.info.formats.find(f=>f.kind==='video').id;
 for(const type of ['video','audio']){
  const started=Date.now(),item=await ready(type);
  const stolen=await b.call('/auth/transfer','POST',{ticket:item.token});check('ticket_owner_'+type,stolen.status===404,{http:stolen.status});
  if(type==='video'){
   const busy=await localFetch(rawBase+'/api/download',{method:'POST',body:JSON.stringify({url,format_id:videoFormat,type:'video'})});check('one_engine',busy.status===429,{http:busy.status});
   const queued=await b.call('/api/fetch-info','POST',{url}),q=await queued.json();check('queue_bounded_admission',queued.status===202&&q.position===1,{http:queued.status});
   const duplicate=await b.call('/api/fetch-info','POST',{url});check('queue_duplicate',duplicate.status===429,{http:duplicate.status});
   const other=await c.call('/api/queue?job='+q.queueToken);check('queue_owner',other.status===404,{http:other.status});
   const cancel=await b.call('/api/queue','POST',{cancel:q.queueToken});check('queue_cancel',cancel.status===200);
  }
  const transferCookie=await cookie(item);
  const response=await localFetch(gateBase+item.downloadUrl,{headers:{...a.edge,Cookie:transferCookie,'Sec-Fetch-Site':'same-origin'},signal:AbortSignal.timeout(150000)});check('stream_'+type,response.status===200,{http:response.status});
  const file=dir+'/received.'+(type==='video'?'ogv':'mp3'),hash=createHash('sha256');let bytes=0;
  await pipeline(Readable.fromWeb(response.body),new Transform({transform(chunk,encoding,cb){bytes+=chunk.length;hash.update(chunk);cb(null,chunk);}}),createWriteStream(file,{flags:'wx',mode:0o600}));
  const state=await waitTerminal(item.token);check('completed_bytes_'+type,state.status==='completed'&&state.bytes===bytes,{status:state.status,bytes});
  const reuse=await localFetch(gateBase+item.downloadUrl,{headers:{...a.edge,Cookie:transferCookie,'Sec-Fetch-Site':'same-origin'}});check('one_use_'+type,reuse.status===404,{http:reuse.status});
  const probe=spawnSync('/usr/bin/ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name:format=duration,size','-of','json',file],{encoding:'utf8',timeout:30000});check('ffprobe_'+type,probe.status===0);
  const properties=JSON.parse(probe.stdout);check('audio_present_'+type,properties.streams.some(s=>s.codec_type==='audio'));if(type==='video')check('video_present',properties.streams.some(s=>s.codec_type==='video'));else check('mp3_codec',properties.streams.every(s=>s.codec_name==='mp3'));
  const decode=spawnSync('/usr/bin/ffmpeg',['-v','error','-xerror','-err_detect','explode','-threads','1','-i',file,'-f','null','-'],{encoding:'utf8',timeout:60000});check('full_decode_'+type,decode.status===0,{exit:decode.status});
  const later=await status(item.token);check('retained_after_consumption_'+type,later.http===200&&later.status==='completed');
  report.transfers.push({type,bytes,sha256:hash.digest('hex'),elapsedMs:Date.now()-started,probe:properties});
 }
 const expiring=await ready('video');await delay(61500);const expired=await status(expiring.token);check('real_ticket_expiration',expired.status==='expired',{status:expired.status,waitMs:61500});
 const expiredGet=await localFetch(gateBase+expiring.downloadUrl,{headers:a.edge});check('expired_ticket_denied',expiredGet.status===404,{http:expiredGet.status});
 const interrupted=await ready('video'),session=await cookie(interrupted);
 await new Promise((resolve,reject)=>{const req=request(gateBase+interrupted.downloadUrl,{headers:{...a.edge,Cookie:session,'Sec-Fetch-Site':'same-origin'}},res=>{res.once('data',()=>{res.destroy();resolve();});res.on('error',()=>{});});req.on('error',reject);req.end();});
 const aborted=await waitTerminal(interrupted.token);check('client_disconnect',aborted.status==='aborted',{status:aborted.status});
 await delay(1200);sample();const children=report.samples.at(-1).processes.filter(p=>p.name!=='node');check('engine_cleanup',children.length===0,{children:children.length});
 check('ssh_preserved',spawnSync('systemctl',['is-active','ssh'],{encoding:'utf8'}).stdout.trim()==='active');
}catch(error){report.failure=error.message;process.exitCode=1;}
finally{
 clearInterval(timer);sample();report.finished=new Date().toISOString();
 report.resources={sampleIntervalMs:500,maxFamilyRssMiB:Math.max(...report.samples.map(s=>s.processes.reduce((sum,p)=>sum+p.rssKiB,0)))/1024};
 for(const service of ['vidfetch','vidfetch-gateway']){const values=report.samples.filter(s=>s[service]),initial=values[0],last=values.at(-1);let peakCpu=0;for(let i=1;i<values.length;i++)peakCpu=Math.max(peakCpu,(values[i][service].cpuUsec-values[i-1][service].cpuUsec)/((values[i].at-values[i-1].at)*1000)*100);report.resources[service]={maxCgroupMiB:Math.max(...values.map(s=>s[service].memory))/1024**2,cpuSeconds:(last[service].cpuUsec-initial[service].cpuUsec)/1e6,peakIntervalCpuPercentOneCore:peakCpu};}
 writeFileSync(dir+'/live-tests.json',JSON.stringify(report,null,2),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({checks:report.checks.length,passed:report.checks.filter(c=>c.ok).length,failure:report.failure,transfers:report.transfers,resources:report.resources}));
}
