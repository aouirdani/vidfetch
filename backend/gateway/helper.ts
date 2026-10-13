import { dictionary } from "../../src/i18n/dictionaries";
import { LANGUAGES, type Locale } from "../../src/i18n/config";
import { randomBytes } from "node:crypto";
const htmlText = (value: string) => value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/** No ticket or credential in the URL, no third-party script, exact opener/origin. */
export function downloadHelper(origins: string[], locale: Locale = "en") {
  const d = dictionary(locale);
  const messages = JSON.stringify({ failure: d.expired, saving: d.helperSaving }).replace(/</g, "\\u003c");
  const nonce = randomBytes(18).toString("base64");
  const allowed = JSON.stringify(origins).replace(/</g, "\\u003c");
  const html = `<!doctype html><html lang="${locale}" dir="${LANGUAGES[locale].dir}"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>VidFetch — ${htmlText(d.download)}</title><p id="message">${htmlText(d.helperWaiting)}</p><script nonce="${nonce}">
const allowed=${allowed}; const messages=${messages}; let used=false;
const notify=(target,origin,type,error)=>target.postMessage({type,error},origin);
addEventListener('message',async event=>{
 if(used||event.source!==opener||!allowed.includes(event.origin)||event.data?.type!=='vidfetch-transfer')return;
 used=true;
 try{
  const {ticket,grant,proof}=event.data;
  const response=await fetch('/auth/transfer',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+grant,'X-VidFetch-Proof':proof},body:JSON.stringify({ticket}),cache:'no-store',credentials:'same-origin',redirect:'error'});
  if(!response.ok)throw Error(messages.failure);
  notify(event.source,event.origin,'vidfetch-started');
  document.getElementById('message').textContent=messages.saving;
  location.assign('/api/download?ticket='+encodeURIComponent(ticket));
 }catch{document.getElementById('message').textContent=messages.failure;notify(event.source,event.origin,'vidfetch-error',messages.failure);}
});
for(const origin of allowed)opener?.postMessage({type:'vidfetch-helper-ready'},origin);
</script></html>`;
  return { html, csp: `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` };
}
