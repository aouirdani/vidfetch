// Controlled SSRF canary. One public redirect per engine; no downloaded video or public listener.
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawn,spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
let hits=0;const local=createServer((_req,res)=>{hits++;res.end('CANARY');});local.listen(0,'127.0.0.1');await once(local,'listening');
const destination=`http://127.0.0.1:${local.address().port}/private`,publicUrl=`https://httpbingo.org/redirect-to?url=${encodeURIComponent(destination)}`;
const report={publicRedirectValidated:false,tests:[],canaryHits:0};
try{
 const baseline=spawnSync('/usr/bin/curl',['-4','-sS','--max-time','8','-o','/dev/null','-w','%{http_code} %{redirect_url}',publicUrl],{encoding:'utf8',timeout:12000});
 report.publicRedirectValidated=baseline.status===0&&baseline.stdout===`302 ${destination}`;
 if(!report.publicRedirectValidated)throw Error('Public redirect source unavailable; no claim of redirect protection validation');
 for(const [engine,args]of [
  ['yt-dlp',['/usr/bin/timeout','8','/opt/vidfetch/tools/yt-dlp-2026.08.19/yt-dlp','--ignore-config','--force-ipv4','--socket-timeout','2','--retries','0','--extractor-retries','0','--skip-download','--dump-single-json',publicUrl]],
  ['ffmpeg',['/usr/bin/timeout','8','/usr/bin/ffmpeg','-v','error','-rw_timeout','2000000','-i',publicUrl,'-f','null','-']],
 ]){
  const child=spawn('systemd-run',['--quiet','--wait','--collect','--pipe','--unit=vidfetch-redirect-'+engine,'--property=User=vidfetch-worker','--property=NoNewPrivileges=yes','--property=BindReadOnlyPaths=/etc/vidfetch/resolv.conf:/etc/resolv.conf',...args],{stdio:['ignore','ignore','pipe']});
  let privateTargetObserved=false;child.stderr.on('data',b=>{if(b.toString().includes('127.0.0.1'))privateTargetObserved=true;});
  const [exit,signal]=await once(child,'exit');report.tests.push({engine,exit,signal,privateTargetObserved,blocked:hits===0&&exit!==0});
 }
 if(report.tests.some(t=>!t.blocked))throw Error('Private redirect canary reached');
}catch(e){report.failure=e.message;process.exitCode=1;}
finally{report.canaryHits=hits;local.closeAllConnections();await new Promise(r=>local.close(r));writeFileSync(process.argv[2],JSON.stringify(report,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify(report));}
