/** This namespace contains only disposable converter output, never user-selected source files. */
export const OUTPUT_DIRECTORY='vidfetch-local-outputs-v1';
export const validJob=id=>typeof id==='string'&&/^job-[a-f0-9-]{36}$/.test(id);
export const lockName=id=>'vidfetch-local-output:'+id;
export const outputRoot=()=>navigator.storage.getDirectory().then(root=>root.getDirectoryHandle(OUTPUT_DIRECTORY,{create:true}));
export async function holdJob(id){
 if(!validJob(id))throw Error('STORAGE');
 let release,started;const ready=new Promise(resolve=>started=resolve);
 const finished=navigator.locks.request(lockName(id),{mode:'shared'},()=>{started();return new Promise(resolve=>release=resolve);});
 await Promise.race([ready,finished]);return async()=>{release();await finished;};
}
export async function removeJob(id){
 if(!validJob(id))return;
 await navigator.locks.request(lockName(id),async()=>{try{await(await outputRoot()).removeEntry(id,{recursive:true});}catch(e){if(e.name!=='NotFoundError')throw e;}});
}
export async function sweepJobs(){
 const root=await outputRoot();
 for await(const [id]of root.entries())if(validJob(id))await navigator.locks.request(lockName(id),{ifAvailable:true},async lock=>{if(lock)await root.removeEntry(id,{recursive:true}).catch(()=>{});});
}
export async function probeOPFS(){
 if(!navigator.storage?.getDirectory||!navigator.storage?.estimate||!navigator.locks)return false;
 const id='job-'+crypto.randomUUID();let release,handle;
 try{await sweepJobs();release=await holdJob(id);const dir=await(await outputRoot()).getDirectoryHandle(id,{create:true});const file=await dir.getFileHandle('probe',{create:true});if(!file.createSyncAccessHandle)return false;handle=await file.createSyncAccessHandle();handle.close();handle=undefined;return true;}
 catch{return false;}
 finally{handle?.close();await release?.();await removeJob(id).catch(()=>{});}
}
