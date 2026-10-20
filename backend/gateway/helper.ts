import { dictionary } from "../../src/i18n/dictionaries";
import { LANGUAGES, type Locale } from "../../src/i18n/config";
import { randomBytes } from "node:crypto";
const htmlText = (value: string) => value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/** No ticket or credential in the URL, no third-party script, exact parent/opener origin. The site embeds it as a hidden
 * frame (older pages opened it as a window): only the site's own origins may frame it, and it obeys only the window that
 * embedded or opened it. Being on the gateway origin, it gets the single-use transfer cookie and starts the native,
 * streamed attachment download as a same-origin navigation. */
export function downloadHelper(origins: string[], locale: Locale = "en") {
  const d = dictionary(locale);
  const messages = JSON.stringify({ failure: d.expired, saving: d.helperSaving }).replace(/</g, "\\u003c");
  const nonce = randomBytes(18).toString("base64");
  const allowed = JSON.stringify(origins).replace(/</g, "\\u003c");
  // Exact origins only; anything unexpected keeps the page unframeable.
  const ancestors = origins.length && origins.every(origin => /^https?:\/\/[a-z0-9.-]+(?::\d{1,5})?$/.test(origin)) ? origins.join(" ") : "'none'";
  const html = `<!doctype html><html lang="${locale}" dir="${LANGUAGES[locale].dir}"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>VidFetch — ${htmlText(d.download)}</title><p id="message">${htmlText(d.helperWaiting)}</p><script nonce="${nonce}">
const allowed=${allowed}; const messages=${messages}; let used=false;
const host=parent!==window?parent:opener;
const notify=(target,origin,type,error)=>target.postMessage({type,error},origin);
addEventListener('message',async event=>{
 if(used||!host||event.source!==host||!allowed.includes(event.origin)||event.data?.type!=='vidfetch-transfer')return;
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
for(const origin of allowed)host?.postMessage({type:'vidfetch-helper-ready'},origin);
</script></html>`;
  return { html, csp: `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors ${ancestors}; base-uri 'none'; form-action 'none'` };
}
