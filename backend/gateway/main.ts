import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { publicGatewayOrigin } from "../../src/lib/gateway-origin";
import { serviceKey } from "../../src/server/access-crypto";
import { GatewayLedger } from "./ledger";
import { createGateway } from "./server";
import {piCapacityGuard} from "./pi-capacity";

const origin = publicGatewayOrigin(process.env.VIDFETCH_GATEWAY_ORIGIN);
const sites = (process.env.VIDFETCH_SITE_ORIGINS ?? "").split(",").map(s => publicGatewayOrigin(s));
const file = process.env.VIDFETCH_QUOTA_DB;
const proxy=process.env.VIDFETCH_PROXY??"reverse-proxy";
if(proxy!=="funnel"&&proxy!=="reverse-proxy")throw Error("Invalid gateway proxy mode");
const isolationMode=process.env.VIDFETCH_ISOLATION_MODE??"netns";
if(!["netns","uid-nft"].includes(isolationMode))throw Error("Invalid isolation mode");
const onPi=proxy==="funnel"||process.env.VIDFETCH_PI_MODE==="1";
if (!origin || !sites.length || sites.some(s => !s) || !file?.startsWith("/") || process.env.VIDFETCH_GATEWAY_ENABLED !== "1") throw new Error("Gateway configuration incomplete; public serving is disabled");
if(proxy==="funnel"&&!new URL(origin).hostname.endsWith(".ts.net"))throw Error("Funnel requires its assigned ts.net hostname");
function bounded(name: string,fallback: number,minimum: number,maximum: number){
  const value=process.env[name]??String(fallback);
  if(!/^\d+$/.test(value)||Number(value)<minimum||Number(value)>maximum)throw Error("Invalid gateway bounds");
  return Number(value);
}
const mib=(name:string,fallback:number,maximum:number)=>bounded(name,fallback,1,maximum)*1024**2;
mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
const app = createGateway({ origin, sites: sites as string[], key: serviceKey(process.env.VIDFETCH_ACCESS_SIGNING_KEY),
  backend: process.env.VIDFETCH_PRIVATE_BACKEND ?? (onPi?"http://127.0.0.1:8788":"http://127.0.0.1:18788"),
  backendSocket:onPi?"/run/vidfetch-public/backend.sock":undefined,proxy,
  admitWork:onPi?piCapacityGuard():undefined,
  isDraining:process.env.VIDFETCH_DEPLOY_DRAIN_FILE === "/run/vidfetch-deployment/drain" ? () => existsSync("/run/vidfetch-deployment/drain") : undefined,
  maxBytes:mib("VIDFETCH_PUBLIC_MAX_MIB",onPi?16:256,256),
  bytesPerSecond:bounded("VIDFETCH_STREAM_KIBPS",onPi?64:2048,32,2048)*1024,
  queue:process.env.VIDFETCH_QUEUE_ENABLED==="1"?{
    maxWaiting:bounded("VIDFETCH_QUEUE_MAX",8,1,32),waitMs:bounded("VIDFETCH_QUEUE_WAIT_SECONDS",300,20,600)*1000,
    estimateMs:bounded("VIDFETCH_QUEUE_ESTIMATE_SECONDS",90,1,300)*1000,
  }:undefined,
  isolationProfile:isolationMode==="uid-nft"?"vidfetch-uid-nft-v1":"vidfetch-netns-v1",
  ledger: new GatewayLedger(file, {
    identityOps:bounded("VIDFETCH_QUOTA_IDENTITY_OPS_DAY",8,1,1000),
    globalOps:bounded("VIDFETCH_QUOTA_GLOBAL_OPS_DAY",100,1,100000),
    identityBytes:mib("VIDFETCH_QUOTA_IDENTITY_MIB_DAY",1024,65536),
    globalBytes:mib("VIDFETCH_QUOTA_GLOBAL_MIB_DAY",4096,1048576),
    requestsPerMinute:bounded("VIDFETCH_RATE_REQUESTS_MIN",120,1,10000),
    workPerTenMinutes:bounded("VIDFETCH_RATE_WORK_10MIN",20,1,1000),
    grantsPerMinute:bounded("VIDFETCH_RATE_GRANTS_MIN",10,1,1000),
  }), requireIsolation: true });
app.server.listen(8789, "127.0.0.1", () => console.log("[vidfetch] authenticated gateway listening on loopback"));
app.server.on("error", () => { console.error("[vidfetch] gateway listener failed"); void app.shutdown(); process.exitCode=1; });
for (const signal of ["SIGTERM","SIGINT"] as const) process.once(signal,()=>void app.shutdown());
