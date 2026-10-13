export type QueueNotice = { position: number; estimatedWaitMs: number; expiresAt: number };
type Queued = QueueNotice & {ok:true;queued:true;queueToken:string;status:"waiting"|"available";retryAfterMs:number};
async function pause(milliseconds: number,signal?: AbortSignal){
  signal?.throwIfAborted();
  await new Promise<void>((resolve,reject)=>{
    const finish=()=>{signal?.removeEventListener("abort",abort);clearTimeout(timer);};
    const abort=()=>{finish();reject(signal?.reason??new Error("Cancelled"));};
    const timer=setTimeout(()=>{finish();resolve();},milliseconds);
    signal?.addEventListener("abort",abort,{once:true});if(signal?.aborted)abort();
  });
}
/** Client-driven claims prevent disconnected visitors from launching engines. */
export async function resolveQueued<T>(first: Response,transport:(path:string,init?:RequestInit)=>Promise<Response>,signal?:AbortSignal,onQueue?:(notice:QueueNotice)=>void):Promise<T>{
  let response=first,token:string|undefined;
  try{
    let payload=await response.json().catch(()=>null) as T|Queued;
    if(response.status!==202||(payload as Queued)?.queued!==true)return payload as T;
    const initial=payload as Queued;
    if(!/^[A-Za-z0-9_-]{43}$/.test(initial.queueToken)||!Number.isFinite(initial.expiresAt)||initial.expiresAt>Date.now()+305000)throw Error("Invalid queue reply");
    token=initial.queueToken;
    while(true){
      signal?.throwIfAborted();
      const state=payload as Queued;
      if(!response.ok||state.ok!==true||state.queued!==true)throw Error("The waiting request expired or the service is unavailable. Try again later.");
      if(Date.now()>=initial.expiresAt)throw Error("The waiting time limit was reached. Try again later.");
      onQueue?.({position:state.position,estimatedWaitMs:state.estimatedWaitMs,expiresAt:initial.expiresAt});
      if(state.status==="available"){
        response=await transport("/api/queue",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({claim:token}),signal});
        if(response.status===409){await response.body?.cancel();}
        else {token=undefined;return await response.json().catch(()=>null) as T;}
      }
      await pause(Math.max(1000,Math.min(5000,state.retryAfterMs??3000)),signal);
      response=await transport(`/api/queue?job=${encodeURIComponent(token)}`,{cache:"no-store",signal});payload=await response.json() as Queued;
    }
  }finally{
    if(token)void transport("/api/queue",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cancel:token}),signal:AbortSignal.timeout(3000)}).then(r=>r.body?.cancel()).catch(()=>{});
  }
}
