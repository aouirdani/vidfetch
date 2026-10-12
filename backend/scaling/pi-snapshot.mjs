// Read-only snapshot, run by SSH via stdin. Never changes a service or network.
import {readFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const command=(exe,args)=>{const r=spawnSync(exe,args,{encoding:'utf8',timeout:8000});return r.status===0?r.stdout.trim():null;};
const service=()=>Object.fromEntries((command('systemctl',['show','vidfetch.service','-p','MainPID','-p','NRestarts','-p','ActiveState','-p','ControlGroup','-p','CPUUsageNSec'])??'').split('\n').filter(Boolean).map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)];}));
const before=service(),samples=[];
for(let i=0;i<4;i++){
 const memory=await readFile('/proc/meminfo','utf8'),stat=await readFile(`/proc/${before.MainPID}/status`,'utf8');
 const throttled=command('/usr/bin/vcgencmd',['get_throttled']);
 samples.push({at:new Date().toISOString(),throttled,armClock:command('/usr/bin/vcgencmd',['measure_clock','arm']),temperatureMilliC:Number(await readFile('/sys/class/thermal/thermal_zone0/temp','utf8')),
  availableKiB:Number(memory.match(/^MemAvailable:\s+(\d+)/m)?.[1]),totalKiB:Number(memory.match(/^MemTotal:\s+(\d+)/m)?.[1]),swapUsedKiB:Number(memory.match(/^SwapTotal:\s+(\d+)/m)?.[1])-Number(memory.match(/^SwapFree:\s+(\d+)/m)?.[1]),backendRssKiB:Number(stat.match(/^VmRSS:\s+(\d+)/m)?.[1]),load:(await readFile('/proc/loadavg','utf8')).split(' ').slice(0,3)});
 if(i<3)await delay(2000);
}
const processes=[];for(const name of await readdir('/proc'))if(/^\d+$/.test(name))try{const comm=(await readFile(`/proc/${name}/comm`,'utf8')).trim();if(/yt-dlp|ffmpeg|tailscaled/.test(comm))processes.push({pid:Number(name),comm});}catch{}
const ipv6=JSON.parse(command('ip',['-j','-6','address','show','dev','wlan0'])??'[]');
console.log(JSON.stringify({at:new Date().toISOString(),architecture:command('uname',['-m']),node:process.version,
 before,after:service(),ssh:command('systemctl',['show','ssh.service','-p','MainPID','-p','ActiveState']),
 port8787:command('ss',['-H','-ltn','sport = :8787']),port8788:command('ss',['-H','-ltn','sport = :8788']),
 bundleSha256:command('sha256sum',['/opt/vidfetch/releases/20261011-eu3x4mea/vidfetch-backend.cjs'])?.split(' ')[0],
 cgroupControllers:(await readFile('/sys/fs/cgroup/cgroup.controllers','utf8')).trim(),samples,mediaOrTailscaleProcesses:processes,
 interface:JSON.parse(command('ip',['-j','route','show','default'])??'[]').map(({dev})=>dev),
 hasGlobalIpv6:ipv6.some(i=>i.addr_info?.some(a=>a.scope==='global'&&a.family==='inet6')),
 tailscaleInstalled:command('sh',['-c','command -v tailscale'])!==null,
 noServiceMutation:true},null,2));
