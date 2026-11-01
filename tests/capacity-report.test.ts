import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {spawnSync} from "node:child_process";

test("daily capacity report uses only aggregate ledger data and raises configured thresholds",async()=>{
 const directory=await mkdtemp(resolve(tmpdir(),"vidfetch-capacity-report-")),dbPath=resolve(directory,"quota.sqlite"),envPath=resolve(directory,"gateway.env"),day=new Date().toISOString().slice(0,10),slot=Math.floor(Date.now()/86400000);
 const db=new DatabaseSync(dbPath);
 try{
  db.exec("CREATE TABLE counters(k TEXT PRIMARY KEY,n INTEGER NOT NULL,b INTEGER NOT NULL,expires INTEGER NOT NULL); CREATE TABLE metrics(day TEXT NOT NULL,name TEXT NOT NULL,n INTEGER NOT NULL,PRIMARY KEY(day,name))");
  db.prepare("INSERT INTO counters VALUES(?,?,?,?)").run(`daily:global:${slot}`,85,3500*1024**2,(slot+1)*86400000);
  const add=db.prepare("INSERT INTO metrics VALUES(?,?,?)");for(const [name,n] of [["requests",20],["quota_rejected",2],["busy_or_unavailable",3],["other_errors",0]] as const)add.run(day,name,n);
 }finally{db.close();}
 await writeFile(envPath,"VIDFETCH_QUOTA_GLOBAL_OPS_DAY=100\nVIDFETCH_QUOTA_GLOBAL_MIB_DAY=4096\n");
 try{
  const run=spawnSync(process.execPath,["scripts/ovh/daily-capacity-report.mjs"],{encoding:"utf8",env:{...process.env,VIDFETCH_QUOTA_DB:dbPath,VIDFETCH_GATEWAY_ENV:envPath}});
  assert.equal(run.status,0,run.stderr);const report=JSON.parse(run.stdout);
  assert.deepEqual(report.alerts,["global_quota_at_or_above_80_percent","daily_error_rate_above_5_percent","service_unavailable_at_least_3_times","local_health_probe_failed"]);
  assert.equal(report.global.operations,85);assert.equal(report.global.bytes,3500*1024**2);
  assert.doesNotMatch(run.stdout,/url|ip|owner|identity|token/i);
 }finally{await rm(directory,{recursive:true,force:true});}
});
