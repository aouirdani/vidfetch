#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { readFile, readdir, lstat } from "node:fs/promises";

const file=process.env.VIDFETCH_QUOTA_DB;
if(!file?.startsWith("/")) throw new Error("VIDFETCH_QUOTA_DB must name the absolute gateway ledger path");
const db=new DatabaseSync(file,{readOnly:true}),day=new Date().toISOString().slice(0,10);
try {
  const row=db.prepare("SELECT n,b FROM counters WHERE k=?").get(`daily:global:${Math.floor(Date.now()/86400000)}`)??{n:0,b:0};
  const metrics=Object.fromEntries(db.prepare("SELECT name,n FROM metrics WHERE day=?").all(day).map(item=>[item.name,item.n]));
  const config=Object.fromEntries((await readFile(process.env.VIDFETCH_GATEWAY_ENV??"/etc/vidfetch/gateway.env","utf8")).split(/\r?\n/).filter(line=>/^VIDFETCH_QUOTA_(GLOBAL_OPS|GLOBAL_MIB)_DAY=/.test(line)).map(line=>line.split("=",2)));
  const limitOps=Number(config.VIDFETCH_QUOTA_GLOBAL_OPS_DAY??100),limitBytes=Number(config.VIDFETCH_QUOTA_GLOBAL_MIB_DAY??4096)*1024**2;
  const total=Number(metrics.requests??0),errors=Number(metrics.quota_rejected??0)+Number(metrics.busy_or_unavailable??0)+Number(metrics.other_errors??0);
  const alerts=[];
  const incomingDir=process.env.VIDFETCH_CI_INCOMING_DIR??"/var/lib/vidfetch-deploy/ci-incoming",incomingThreshold=500*1024**2;
  let incomingBytes=0,incomingAvailable=true;
  try{for(const name of await readdir(incomingDir)){try{const item=await lstat(`${incomingDir}/${name}`);if(item.isFile())incomingBytes+=item.size;}catch(error){if(error.code!=="ENOENT")throw error;}}}catch{incomingAvailable=false;}
  if(incomingAvailable&&incomingBytes>incomingThreshold)alerts.push("ci_incoming_storage_above_500_mib");
  if(!incomingAvailable)alerts.push("ci_incoming_storage_unavailable");
  const healthUrl=new URL(process.env.VIDFETCH_CAPACITY_HEALTH_URL??"http://127.0.0.1:3000/api/health");
  if(healthUrl.protocol!=="http:"||!(["127.0.0.1","localhost","[::1]"].includes(healthUrl.hostname)))throw new Error("Capacity health probe must target loopback HTTP");
  let healthy=false;try{const response=await fetch(healthUrl,{signal:AbortSignal.timeout(2500)});const data=await response.json();healthy=response.ok&&data.ok===true&&data.frontend?.ready!==false;}catch{}
  if(Number(row.b)/limitBytes>=0.8||Number(row.n)/limitOps>=0.8)alerts.push("global_quota_at_or_above_80_percent");
  if(total>=20&&errors/total>0.05)alerts.push("daily_error_rate_above_5_percent");
  if(Number(metrics.busy_or_unavailable??0)>=3)alerts.push("service_unavailable_at_least_3_times");
  if(!healthy)alerts.push("local_health_probe_failed");
  const report={day,health:{available:healthy},global:{operations:Number(row.n),operationLimit:limitOps,bytes:Number(row.b),byteLimit:limitBytes},incomingStorage:{available:incomingAvailable,bytes:incomingBytes,thresholdBytes:incomingThreshold},requests:total,errors:{quotaRejected:Number(metrics.quota_rejected??0),busyOrUnavailable:Number(metrics.busy_or_unavailable??0),other:Number(metrics.other_errors??0)},alerts};
  console.log(JSON.stringify(report));
  const hook=process.env.VIDFETCH_CAPACITY_ALERT_WEBHOOK;
  if(alerts.length&&hook){const url=new URL(hook);if(url.protocol!=="https:")throw new Error("Alert webhook must use HTTPS");const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(report),signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error(`Alert endpoint returned HTTP ${response.status}`);}
} finally {db.close();}
