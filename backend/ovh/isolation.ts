import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
function rootFile(path: string){
  if(!path.startsWith("/"))throw Error("An absolute root-controlled path is required");
  const stat=statSync(path);
  if(!stat.isFile()||stat.uid!==0||(stat.mode&0o022))throw Error("Isolation configuration must be root-controlled");
  return readFileSync(path,"utf8");
}
/** Root attests installation of a dedicated UID-scoped nft policy; not a network namespace. */
export function verifyUidIsolation(file: string){
  if(process.platform!=="linux")throw Error("UID egress isolation requires Linux");
  const profile=JSON.parse(rootFile(file)) as {version?:string;workerUid?:number;gatewayUid?:number;rulesVerified?:boolean;rulesFile?:string;rulesSha256?:string};
  const status=readFileSync("/proc/self/status","utf8");
  if(profile.version!=="vidfetch-uid-nft-v1"||profile.rulesVerified!==true||!profile.workerUid||!profile.gatewayUid||profile.workerUid===profile.gatewayUid||profile.workerUid!==process.getuid?.()
    ||!/^CapEff:\s+0+$/m.test(status)||!/^NoNewPrivs:\s+1$/m.test(status)||!profile.rulesFile
    ||createHash("sha256").update(rootFile(profile.rulesFile)).digest("hex")!==profile.rulesSha256)throw Error("UID egress isolation requirements not satisfied");
  for(const variable of Object.keys(process.env))if((/^YTDLP_.*(?:COOKIES|PROXY)/.test(variable)||/^(?:ALL|HTTP|HTTPS)_PROXY$/i.test(variable))&&process.env[variable])throw Error("OVH worker cannot inherit proxy/cookie secrets");
  return "vidfetch-uid-nft-v1";
}
