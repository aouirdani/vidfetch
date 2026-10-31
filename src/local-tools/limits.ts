/** Admission bounds, independent from the smaller fallback output-buffer budget. Physical phones still need validation. */
export type LocalToolId = "audio" | "compress" | "trim" | "gif";
export type DeviceClass = "mobile" | "desktop";
const MiB=1024**2;
export const LOCAL_LIMITS={pixels:3840*2160,maxEdge:3840,shortEdge:2160,outputLongEdge:1920,outputShortEdge:1080,gifSeconds:15,gifWidth:640,gifFps:15,probeTimeoutMs:60000,inputCacheBytes:8*MiB,streamChunkBytes:MiB} as const;
export const TOOL_LIMITS={
 audio:{mobile:{inputBytes:200*MiB,duration:300,bufferBytes:64*MiB,timeoutMs:15*60000},desktop:{inputBytes:1024*MiB,duration:1200,bufferBytes:64*MiB,timeoutMs:30*60000}},
 trim:{mobile:{inputBytes:200*MiB,duration:300,bufferBytes:64*MiB,timeoutMs:15*60000},desktop:{inputBytes:1024*MiB,duration:1200,bufferBytes:256*MiB,timeoutMs:30*60000}},
 compress:{mobile:{inputBytes:200*MiB,duration:300,bufferBytes:64*MiB,timeoutMs:20*60000},desktop:{inputBytes:500*MiB,duration:600,bufferBytes:256*MiB,timeoutMs:60*60000}},
 gif:{mobile:{inputBytes:200*MiB,duration:300,bufferBytes:16*MiB,timeoutMs:3*60000},desktop:{inputBytes:500*MiB,duration:1200,bufferBytes:32*MiB,timeoutMs:5*60000}},
} as const;
export function toolLimits(tool:LocalToolId,device:DeviceClass){return TOOL_LIMITS[tool][device];}
export const PRESETS={light:2_000_000,balanced:1_000_000,strong:500_000} as const;
export function outputDimensions(width:number,height:number,maxHeight:number){
 const scale=Math.min(1,LOCAL_LIMITS.outputLongEdge/Math.max(width,height),LOCAL_LIMITS.outputShortEdge/Math.min(width,height),maxHeight?maxHeight/height:1);
 return {width:Math.max(2,Math.floor(width*scale/2)*2),height:Math.max(2,Math.floor(height*scale/2)*2)};
}
