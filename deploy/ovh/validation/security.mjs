// Run as root only to read this fixture's key. Never uses the production signing key.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash, createHmac, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { request } from 'node:https';
import { setTimeout as delay } from 'node:timers/promises';
const base = '/opt/vidfetch-full-validation', origin = 'https://vidfetch.app:33443';
const secret = Buffer.from(readFileSync(base+'/auth.env','utf8').trim().split('=')[1],'base64url');
const ca = readFileSync(base+'/tls.crt'), checks=[];
const digest = b=>createHash('sha256').update(b).digest('base64url');
function actor(){
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),key=publicKey.export({format:'jwk'}),sub=randomUUID();
 return (path,method='GET',body='')=>{
  const iat=Math.floor(Date.now()/1000),head=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),payload=Buffer.from(JSON.stringify({iss:'vidfetch-access',aud:origin,purpose:'api',sub,key,iat,exp:iat+120})).toString('base64url'),content=head+'.'+payload,grant=content+'.'+createHmac('sha256',secret).update(content).digest('base64url');
  const data=Buffer.from(JSON.stringify({iat,jti:randomUUID(),method,path,bodyHash:digest(body),tokenHash:digest(grant)})).toString('base64url');
  return {Authorization:'Bearer '+grant,'X-VidFetch-Proof':data+'.'+sign('sha256',Buffer.from(data),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')};
 };
}
function call(path,method='GET',body='',headers={}){
 return new Promise((resolve,reject)=>{
  const req=request({hostname:'127.0.0.1',port:3443,path,method,servername:'vidfetch.app',ca,headers:{Host:'vidfetch.app:33443',...headers,...(body?{'Content-Type':'application/json'}:{})}},res=>{
   const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString()}));
  });req.on('error',reject);req.end(body);
 });
}
const a=actor(), b=actor();
assert.equal((await call('/api/fetch-info','POST','{}')).status,401);checks.push('Caddy download route requires authorization');
for(const path of ['/auth/admission','/auth/deployment'])assert.equal((await call(path)).status,404);checks.push('Caddy blocks both service-only endpoints');
// /api/health belongs to Next, not the gateway; retain a signed download status path for proof-replay testing.
const unknown='/api/download?status=unknown',headers=a(unknown);
assert.equal((await call(unknown,'GET','',headers)).status,404);
assert.equal((await call(unknown,'GET','',headers)).status,401);checks.push('Proof replay rejected');
const body=JSON.stringify({url:'https://youtu.be/aqz-KE-bpKQ',format_id:'fogg',type:'video'}),prepared=await call('/api/download','POST',body,a('/api/download','POST',body));assert.equal(prepared.status,201);
const ready=JSON.parse(prepared.body),path='/api/download?status='+ready.token;
assert.equal((await call(path,'GET','',b(path))).status,404);checks.push('Different browser owner cannot read transfer status');
assert.equal((await call('/api/download','POST',body,a('/api/download','POST',body))).status,429);checks.push('Same actor cannot prepare a second active operation');
const transfer=JSON.stringify({ticket:ready.token}),authorized=await call('/auth/transfer','POST',transfer,a('/auth/transfer','POST',transfer));assert.equal(authorized.status,200);
const cookie=authorized.headers['set-cookie'][0].split(';')[0];
let bytes=0;
await new Promise((resolve,reject)=>{
 const req=request({hostname:'127.0.0.1',port:3443,path:ready.downloadUrl,servername:'vidfetch.app',ca,headers:{Host:'vidfetch.app:33443',Cookie:cookie,'Sec-Fetch-Site':'same-origin'}},res=>{assert.equal(res.statusCode,200);res.once('data',chunk=>{bytes+=chunk.length;res.destroy();resolve();});});req.on('error',reject);req.end();
});
let status;
for(let i=0;i<50;i++){const r=await call(path,'GET','',a(path));status=JSON.parse(r.body);if(status.status==='aborted')break;await delay(100);}
assert.equal(status.status,'aborted');assert.ok(bytes>0);checks.push('TLS client disconnect propagates through Caddy and aborts transfer');
await delay(1200);
const engines=[];
for(const pid of readdirSync('/proc').filter(x=>/^\d+$/.test(x)))try{const s=readFileSync('/proc/'+pid+'/status','utf8');if(/^Uid:\s+999\b/m.test(s)&&/^Name:\s+(?:yt-dlp|ffmpeg)/m.test(s))engines.push(Number(pid));}catch{}
assert.deepEqual(engines,[]);checks.push('No yt-dlp/ffmpeg child remains under worker UID');
const output={checks,receivedBeforeAbort:bytes,status:status.status,engineChildren:engines};writeFileSync(process.argv[2],JSON.stringify(output,null,2));console.log(JSON.stringify(output));
