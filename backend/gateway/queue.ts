import { randomBytes } from "node:crypto";
import { AccessError } from "../../src/server/access-crypto";

type Entry = {
  token: string; owner: string; ip: string; path: "/api/fetch-info" | "/api/download";
  body: Buffer; created: number; expires: number; seen: number; offered?: number;
};
export type QueueOptions = { maxWaiting?: number; waitMs?: number; heartbeatMs?: number; claimMs?: number; estimateMs?: number };
/** Waiting contains metadata only. A worker/ticket is created only by a claim. */
export class WaitingQueue {
  private entries: Entry[] = [];
  private accepting = true;
  readonly maximum: number;
  readonly waitMs: number;
  readonly heartbeatMs: number;
  readonly claimMs: number;
  readonly estimateMs: number;
  constructor(options: QueueOptions = {}) {
    this.maximum = options.maxWaiting ?? 2;
    this.waitMs = options.waitMs ?? 180000;
    this.heartbeatMs = options.heartbeatMs ?? 20000;
    this.claimMs = options.claimMs ?? 15000;
    this.estimateMs = options.estimateMs ?? 90000;
    if (![this.maximum,this.waitMs,this.heartbeatMs,this.claimMs,this.estimateMs].every(n=>Number.isInteger(n)&&n>0)
      || this.maximum>8 || this.waitMs>300000 || this.heartbeatMs>this.waitMs || this.claimMs>this.waitMs) throw Error("Invalid queue bounds");
  }
  sweep(now = Date.now()) {
    this.entries = this.entries.filter(e=>now<e.expires && now-e.seen<this.heartbeatMs && (e.offered===undefined || now<e.offered+this.claimMs));
  }
  size(now = Date.now()) { this.sweep(now); return this.entries.length; }
  private owned(token: string,owner: string,ip: string,now: number) {
    this.sweep(now);
    const entry=this.entries.find(e=>e.token===token&&e.owner===owner&&e.ip===ip);
    if(!entry)throw new AccessError("QUEUE_EXPIRED",404);
    return entry;
  }
  enqueue(input: Pick<Entry,"owner"|"ip"|"path"|"body">, busy: boolean,now = Date.now()) {
    this.sweep(now);
    if(!this.accepting)throw new AccessError("BACKEND_UNAVAILABLE",503);
    if(this.entries.some(e=>e.owner===input.owner||e.ip===input.ip))throw new AccessError("QUEUE_DUPLICATE",429);
    const eta=(this.entries.length+(busy?1:0))*this.estimateMs;
    if(this.entries.length>=this.maximum||eta>this.waitMs)throw new AccessError("QUEUE_FULL",429);
    if(input.body.length>8192||!["/api/download","/api/fetch-info"].includes(input.path))throw new AccessError("INVALID_QUEUE_REQUEST",400);
    const entry:Entry={...input,body:Buffer.from(input.body),token:randomBytes(32).toString("base64url"),created:now,expires:now+this.waitMs,seen:now};
    this.entries.push(entry);
    return this.inspect(entry.token,entry.owner,entry.ip,busy,now);
  }
  inspect(token: string,owner: string,ip: string,busy: boolean,now = Date.now()) {
    const entry=this.owned(token,owner,ip,now);
    entry.seen=now;
    const index=this.entries.indexOf(entry),available=index===0&&!busy;
    if(available&&entry.offered===undefined)entry.offered=now;
    return {ok:true,queued:true,queueToken:entry.token,status:available?"available":"waiting",position:index+1,
      expiresAt:entry.expires,claimBefore:entry.offered===undefined?null:Math.min(entry.expires,entry.offered+this.claimMs),
      estimatedWaitMs:(index+(busy?1:0))*this.estimateMs,retryAfterMs:3000};
  }
  claim(token: string,owner: string,ip: string,busy: boolean,now = Date.now()) {
    const entry=this.owned(token,owner,ip,now);
    if(busy||entry!==this.entries[0])throw new AccessError("QUEUE_WAIT",409);
    // No asynchronous boundary between this deletion and gateway acquisition.
    this.entries.shift();
    return {path:entry.path,body:entry.body};
  }
  cancel(token: string,owner: string,ip: string,now = Date.now()) {
    const entry=this.owned(token,owner,ip,now);
    this.entries=this.entries.filter(e=>e!==entry);
  }
  close() { this.accepting=false;this.entries=[]; }
}
