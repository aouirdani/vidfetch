import {readFile,readdir} from "node:fs/promises";
import {AccessError} from "../../src/server/access-crypto";

export function checkPiCapacity(memory: string,temperature: string,voltageAlarm: string){
 const available=Number(memory.match(/^MemAvailable:\s+(\d+)/m)?.[1]),celsius=Number(temperature.trim())/1000;
 if(!Number.isFinite(available)||!Number.isFinite(celsius)||celsius<=0||celsius>=65||available<256*1024||voltageAlarm.trim()!=="0")throw new AccessError("RESOURCE_GUARD",503);
}
/** Read-only admission guard; no /dev, sudo, shell, overclock or service change. */
export function piCapacityGuard(){
 let cached:Promise<void>|undefined,expires=0;
 return async()=>{
  if(!cached||Date.now()>=expires){
   expires=Date.now()+5000;
   cached=(async()=>{
    try{
     if(process.platform!=="linux")throw Error("Linux required");
     const entries=(await readdir("/sys/class/hwmon")).filter(n=>/^hwmon\d+$/.test(n));
     if(entries.length>32)throw Error("Invalid sensors");
     const names=await Promise.all(entries.map(async name=>({name,label:(await readFile(`/sys/class/hwmon/${name}/name`,"utf8")).trim()})));
     const sensors=names.filter(n=>n.label==="rpi_volt");if(sensors.length!==1)throw Error("Power sensor unavailable");
     const [memory,temperature,alarm]=await Promise.all([readFile("/proc/meminfo","utf8"),readFile("/sys/class/thermal/thermal_zone0/temp","utf8"),readFile(`/sys/class/hwmon/${sensors[0].name}/in0_lcrit_alarm`,"utf8")]);
     checkPiCapacity(memory,temperature,alarm);
    }catch{throw new AccessError("RESOURCE_GUARD",503);}
   })();
  }
  await cached;
 };
}
