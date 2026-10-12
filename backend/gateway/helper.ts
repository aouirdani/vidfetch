import { randomBytes } from "node:crypto";

/** No ticket or credential in the URL, no third-party script, exact opener/origin. */
export function downloadHelper(origins: string[]) {
  const nonce = randomBytes(18).toString("base64");
  const allowed = JSON.stringify(origins).replace(/</g, "\\u003c");
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>VidFetch download</title><p id="message">Waiting for download authorization…</p><script nonce="${nonce}">
const allowed=${allowed}; let used=false;
const notify=(target,origin,type,error)=>target.postMessage({type,error},origin);
addEventListener('message',async event=>{
 if(used||event.source!==opener||!allowed.includes(event.origin)||event.data?.type!=='vidfetch-transfer')return;
 used=true;
 try{
  const {ticket,grant,proof}=event.data;
  const response=await fetch('/auth/transfer',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+grant,'X-VidFetch-Proof':proof},body:JSON.stringify({ticket}),cache:'no-store',credentials:'same-origin',redirect:'error'});
  if(!response.ok)throw Error('Download authorization failed. Return to VidFetch and try again.');
  notify(event.source,event.origin,'vidfetch-started');
  document.getElementById('message').textContent='Saving your file. You can return to VidFetch.';
  location.assign('/api/download?ticket='+encodeURIComponent(ticket));
 }catch(error){document.getElementById('message').textContent=error.message;notify(event.source,event.origin,'vidfetch-error',error.message);}
});
for(const origin of allowed)opener?.postMessage({type:'vidfetch-helper-ready'},origin);
</script></html>`;
  return { html, csp: `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` };
}
