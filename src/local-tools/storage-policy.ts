/** Output bytes, not a promise about total browser/native memory or physical free disk. */
export const STORAGE_POLICY={fileBytes:2*1024**3,reserveBytes:16*1024**2,headroom:1.25,downloadChunkBytes:64*1024} as const;
export function opfsCapacity(estimate:{quota?:number;usage?:number}){
 const {quota,usage}=estimate;
 if(typeof quota!=='number'||typeof usage!=='number'||!Number.isFinite(quota)||!Number.isFinite(usage)||quota<0||usage<0)return 0;
 return Math.max(0,Math.min(STORAGE_POLICY.fileBytes,Math.floor((quota-usage-STORAGE_POLICY.reserveBytes)/STORAGE_POLICY.headroom)));
}
