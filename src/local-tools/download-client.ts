const SCRIPT='/local-media/download/sw.js?v='+process.env.NEXT_PUBLIC_LOCAL_MEDIA_REVISION;
export async function prepareDownloadService():Promise<ServiceWorker|null>{
 if(!('serviceWorker' in navigator))return null;
 try{
  const registration=await navigator.serviceWorker.register(SCRIPT,{scope:'/local-media/download/',type:'module',updateViaCache:'none'});
  if(registration.active)return registration.active;
  const pending=registration.installing??registration.waiting;if(!pending)return null;
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Download service timeout')),12000);const check=()=>{if(pending.state==='activated'){clearTimeout(timer);resolve();}else if(pending.state==='redundant'){clearTimeout(timer);reject(Error('Download service unavailable'));}};pending.addEventListener('statechange',check);check();});
  return registration.active;
 }catch{return null;}
}
export function discardOutput(service:ServiceWorker|null,id:string|null){if(id)service?.postMessage({type:'discard',id});}
