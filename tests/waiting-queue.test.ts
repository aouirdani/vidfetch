import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { WaitingQueue } from "../backend/gateway/queue";
import { resolveQueued } from "../src/lib/queue-client";
import { AccessError } from "../src/server/access-crypto";
import {checkPiCapacity} from "../backend/gateway/pi-capacity";

const input=(owner:string,ip=owner)=>({owner,ip,path:"/api/download" as const,body:Buffer.from('{"url":"https://youtu.be/aqz-KE-bpKQ","type":"video","format_id":"18"}')});
describe("bounded waiting before engine startup",()=>{
  it("refuses undervoltage, overheating, low memory and unreadable resource states",()=>{
    checkPiCapacity("MemAvailable: 500000 kB\n","35000","0");
    for(const [memory,temp,alarm]of [["500000","35000","1"],["500000","65000","0"],["200000","35000","0"],["bad","35000","0"],["500000","bad","0"],["500000","35000","bad"]])assert.throws(()=>checkPiCapacity(`MemAvailable: ${memory} kB\n`,temp,alarm),AccessError);
  });
  it("caps storage and permits one waiting request per owner/IP",()=>{
    const queue=new WaitingQueue();queue.enqueue(input("a"),true,1000);
    assert.throws(()=>queue.enqueue(input("a","other"),true,1000),AccessError);
    assert.throws(()=>queue.enqueue(input("b","a"),true,1000),AccessError);
    queue.enqueue(input("b"),true,1000);assert.equal(queue.size(1000),2);
    assert.throws(()=>queue.enqueue(input("c"),true,1000),AccessError);
  });
  it("claims FIFO only, binds owner/IP and consumes the request once",()=>{
    const queue=new WaitingQueue(),a=queue.enqueue(input("a"),true,1000),b=queue.enqueue(input("b"),true,1000);
    assert.throws(()=>queue.inspect(a.queueToken,"b","a",false,1000),AccessError);
    assert.throws(()=>queue.claim(a.queueToken,"a","other",false,1000),AccessError);
    assert.throws(()=>queue.claim(a.queueToken,"a","a",true,1000),AccessError);
    assert.throws(()=>queue.claim(b.queueToken,"b","b",false,1000),AccessError);
    assert.equal(queue.inspect(a.queueToken,"a","a",false,1000).status,"available");
    assert.equal(queue.claim(a.queueToken,"a","a",false,1000).path,"/api/download");
    assert.throws(()=>queue.claim(a.queueToken,"a","a",false,1000),AccessError);
    assert.equal(queue.inspect(b.queueToken,"b","b",false,1000).position,1);
  });
  it("expires without extending its deadline on polling, and removes abandoned clients",()=>{
    const queue=new WaitingQueue({waitMs:10000,heartbeatMs:4000,claimMs:2000,estimateMs:1000});
    const row=queue.enqueue(input("a"),true,1000);const expiry=row.expiresAt;
    for(const now of [3000,6000,9000])assert.equal(queue.inspect(row.queueToken,"a","a",true,now).expiresAt,expiry);
    assert.throws(()=>queue.inspect(row.queueToken,"a","a",false,11000),AccessError);
    const abandoned=queue.enqueue(input("b"),true,12000);
    assert.throws(()=>queue.inspect(abandoned.queueToken,"b","b",false,16000),AccessError);
  });
  it("expires a missed claim and frees capacity; cancel and shutdown do not run work",()=>{
    const queue=new WaitingQueue({claimMs:1000});const a=queue.enqueue(input("a"),false,1000);
    assert.throws(()=>queue.inspect(a.queueToken,"a","a",false,2000),AccessError);
    const b=queue.enqueue(input("b"),true,2000);assert.throws(()=>queue.cancel(b.queueToken,"a","b",2000),AccessError);
    queue.cancel(b.queueToken,"b","b",2000);assert.equal(queue.size(2000),0);queue.close();assert.throws(()=>queue.enqueue(input("c"),true,2000),AccessError);
  });
  it("rejects an estimated wait over the ceiling and makes a bounded payload copy",()=>{
    const queue=new WaitingQueue({waitMs:30000,heartbeatMs:10000,claimMs:5000,estimateMs:20000});
    const request=input("a"),row=queue.enqueue(request,true,1000);request.body.fill(0);
    assert.throws(()=>queue.enqueue(input("b"),true,1000),AccessError);
    assert.notEqual(queue.claim(row.queueToken,"a","a",false,1000).body[0],0);
  });
  it("client claims without passing a queue token as a download ticket",async()=>{
    const token="a".repeat(43),calls:string[]=[],notices:unknown[]=[];
    const response=Response.json({ok:true,queued:true,queueToken:token,status:"available",position:1,estimatedWaitMs:0,expiresAt:Date.now()+10000,retryAfterMs:3000},{status:202});
    const result=await resolveQueued(response,async(path,init)=>{calls.push(path);assert.deepEqual(JSON.parse(String(init?.body)),{claim:token});return Response.json({ok:true,token:"real-download-ticket"},{status:201});},undefined,n=>notices.push(n));
    assert.deepEqual(result,{ok:true,token:"real-download-ticket"});assert.deepEqual(calls,["/api/queue"]);assert.equal(notices.length,1);
  });
  it("client abort cancels waiting with a separate short request",async()=>{
    const token="b".repeat(43),controller=new AbortController(),calls:string[]=[];
    const response=Response.json({ok:true,queued:true,queueToken:token,status:"waiting",position:1,estimatedWaitMs:90000,expiresAt:Date.now()+10000,retryAfterMs:3000},{status:202});
    controller.abort();await assert.rejects(()=>resolveQueued(response,async(_path,init)=>{calls.push(String(init?.body));return Response.json({ok:true});},controller.signal));
    assert.equal(calls.length,1);assert.equal(JSON.parse(calls[0]).cancel,token);
  });
});
