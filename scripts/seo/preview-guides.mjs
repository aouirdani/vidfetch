/** Loopback-only review server. Never approves, edits, publishes, or serves a Next route. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const project = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const source = resolve(process.argv.find(a => a.startsWith('--source='))?.slice(9) ?? project);
const port = Number(process.argv.find(a => a.startsWith('--port='))?.slice(7) ?? 4184);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid review port');
const bundle = await build({stdin:{contents:`export {GuideBody} from './src/components/GuideBody';export {guides} from './src/lib/guides';export {LOCALES,articlePath} from './src/i18n/config';`, resolveDir:project},bundle:true,platform:'node',format:'esm',write:false,jsx:'automatic',packages:'external'});
// Keep the temporary module beside node_modules, so React uses the same instance as the server renderer.
const modulePath = resolve(project, 'build/guide-preview-module.mjs');
const { mkdir, writeFile, unlink } = await import('node:fs/promises');
await mkdir(resolve(project,'build'),{recursive:true});
await writeFile(modulePath,bundle.outputFiles[0].text);
process.chdir(source);
const { GuideBody, guides, LOCALES, articlePath } = await import(pathToFileURL(modulePath).href);
await unlink(modulePath);
const all = LOCALES.flatMap(locale=>guides(locale));
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const weight = g => /why-cant-i-save-tiktok|save-tiktok-phone-gallery/.test(g.id) ? 0 : /save-tiktok-sound-mp3/.test(g.id) ? 1 : g.locale==='es' ? 2 : 3;
const ordered=[...all].sort((a,b)=>weight(a)-weight(b)||(a.planRank??999)-(b.planRank??999)||a.id.localeCompare(b.id)||a.locale.localeCompare(b.locale));
const style='body{margin:2rem auto;max-width:75ch;padding:0 1rem;font:18px/1.65 system-ui;color:#17202b;background:#fafafa}a{color:#07536b}h1{line-height:1.2}img{max-width:100%;height:auto}table{border-collapse:collapse;display:block;overflow:auto}td,th{border:1px solid #aaa;padding:.5rem}pre{overflow:auto;background:#eee;padding:1rem}.pending{padding:1rem;background:#fff1c0}';
const document = (title,body,locale='fr')=>'<!doctype html><html lang="'+locale+'" dir="'+(locale==='ar'?'rtl':'ltr')+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>'+escape(title)+'</title><style>'+style+'</style></head><body>'+body+'</body></html>';
const server=createServer(async(req,res)=>{
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
  try {
    const path=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    if(path.startsWith('/guides/lab/')){
      if(!/^\/guides\/lab\/[a-z0-9-]+\.(webp|avif)$/.test(path)) throw Error('Invalid image');
      const file=resolve(source,'public'+path);
      if(!file.startsWith(resolve(source,'public')+sep) || !(await stat(file)).isFile()) throw Error('Missing image');
      res.setHeader('Content-Type',path.endsWith('.avif')?'image/avif':'image/webp');res.end(await readFile(file));return;
    }
    res.setHeader('Content-Type','text/html; charset=utf-8');
    if(path==='/'){
      res.end(document('Relecture des guides','<h1>Relecture des guides</h1><p class="pending">Prévisualisations privées. Aucune relecture humaine certifiée. Ne pas publier depuis ce serveur.</p><ol>'+ordered.map(g=>'<li><a href="/preview/'+g.locale+'/'+g.id+'">'+escape(g.locale+' · '+g.title)+'</a></li>').join('')+'</ol>'));return;
    }
    const match=/^\/preview\/([a-z]{2}(?:-[A-Z]{2})?)\/([a-z0-9-]+)$/.exec(path);
    const guide=match && all.find(g=>g.locale===match[1]&&g.id===match[2]);
    if(!guide){res.statusCode=404;res.end(document('Introuvable','<h1>Introuvable</h1>'));return;}
    const body=renderToStaticMarkup(createElement(GuideBody,{body:guide.body,locale:guide.locale,images:guide.images}));
    res.end(document(guide.title,'<nav><a href="/">Liste de relecture</a></nav><p class="pending">En attente de relecture humaine · '+escape(guide.locale)+' · '+escape(guide.id)+'</p><h1>'+escape(guide.title)+'</h1><p>'+escape(guide.description)+'</p><p>URL prévue : '+escape(articlePath(guide.locale,guide.slug))+'</p>'+body+'<h2>Sources à vérifier</h2><ul>'+guide.sources.map(s=>'<li><a href="'+escape(s.url)+'">'+escape(s.title)+'</a>'+ (s.accessed?' · '+escape(s.accessed):'')+'</li>').join('')+'</ul>',guide.locale));
  } catch {res.statusCode=404;res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Private guide review: http://127.0.0.1:${port} (${all.length} drafts; source ${source})`));
