import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';

const origin = 'https://vidfetch.app';
const localeOg = { en:'en_US',fr:'fr_FR',es:'es_ES','pt-BR':'pt_BR',id:'id_ID',de:'de_DE',it:'it_IT',ar:'ar_AR' };
// An external origin lets release/edge checks use the same assertions as local Next.
let base = process.env.SEO_CHECK_BASE_URL, server, log = '';
if (!base) {
  const reserve = createServer();
  await new Promise((resolve,reject) => { reserve.once('error',reject); reserve.listen(0,'127.0.0.1',resolve); });
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{
    stdio:['ignore','pipe','pipe'],env:{...process.env,VIDFETCH_TARGET:'ovh',VIDFETCH_CONNECTION_READY:'0',NEXT_TELEMETRY_DISABLED:'1'},
  });
  for (const stream of [server.stdout,server.stderr]) stream.on('data',chunk => { log+=chunk; });
}
base = base.replace(/\/$/, '');
const endpoint = new URL(base);
assert.ok(['http:','https:'].includes(endpoint.protocol) && !endpoint.username && !endpoint.password && endpoint.pathname === '/' && !endpoint.search && !endpoint.hash, 'SEO_CHECK_BASE_URL must be an origin');
const host = process.env.SEO_CHECK_HOST;
if (host) assert.match(host, /^[a-z0-9.-]+$/i);
const ca = process.env.SEO_CHECK_CA_FILE ? readFileSync(process.env.SEO_CHECK_CA_FILE) : undefined;
const request = path => {
  if (!process.env.SEO_CHECK_BASE_URL) return fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(10000)});
  const url = new URL(path, base);
  return new Promise((resolve,reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send(url,{headers:host ? {Host:host} : {}, ...(url.protocol === 'https:' ? {servername:host ?? url.hostname, ...(ca ? {ca} : {})} : {}),signal:AbortSignal.timeout(10000)},res => {
      const chunks=[]; let bytes=0;
      res.on('data',chunk=>{ bytes+=chunk.length; if(bytes>10*1024*1024) res.destroy(Error('HTML response too large')); else chunks.push(chunk); });
      res.on('error',reject);
      res.on('end',()=>resolve({status:res.statusCode,headers:new Headers(Object.entries(res.headers).filter(([,v])=>v!==undefined).map(([k,v])=>[k,Array.isArray(v)?v.join(', '):v])),text:async()=>Buffer.concat(chunks).toString('utf8')}));
    });
    req.on('error',reject); req.end();
  });
};
let browser;
try {
  for(let n=0;;n++) {
    try { if ((await request('/robots.txt')).status===200) break; } catch {}
    if(n>100 || (server && server.exitCode!==null)) throw Error(`Server failed: ${log}`);
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const sitemapResponse=await request('/sitemap.xml'); assert.equal(sitemapResponse.status,200);
  const sitemap=await sitemapResponse.text();
  const blocks=[...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m=>m[1]);
  const urls=blocks.map(block=>block.match(/<loc>([^<]+)<\/loc>/)[1]);
  assert.ok(urls.length>0); assert.equal(new Set(urls).size,urls.length);
  const robots=await (await request('/robots.txt')).text();
  assert.match(robots,/Sitemap: https:\/\/vidfetch\.app\/sitemap\.xml/);
  // Apply the longest matching Allow/Disallow rule for the wildcard crawler, including * and $.
  const rules=[]; let applies=false;
  for(const line of robots.split('\n')) {
    const match=/^([^:#]+):\s*([^#]*)/.exec(line); if(!match)continue;
    const [,key,raw]=match, value=raw.trim();
    if(key.toLowerCase()==='user-agent') applies=value==='*';
    else if(applies && /^(allow|disallow)$/i.test(key) && value) rules.push({allow:key.toLowerCase()==='allow',value});
  }
  function allowed(path) {
    const matches=rules.filter(r=>new RegExp('^'+r.value.replace(/[.+?^{}()|[\]\\]/g,'\\$&').replaceAll('*','.*')).test(path)).sort((a,b)=>b.value.length-a.value.length || Number(b.allow)-Number(a.allow));
    return !matches.length || matches[0].allow;
  }
  browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});
  const context=await browser.newContext({javaScriptEnabled:false});
  await context.route('**/*',route=>route.abort());
  const dom=await context.newPage(), pages=new Map();
  for(const [index,url] of urls.entries()) {
    assert.equal(new URL(url).origin,origin,url); const path=new URL(url).pathname;
    assert.ok(path==='/' || !path.endsWith('/'),`${url}: slash policy`);
    assert.ok(allowed(path),`${url}: blocked by robots`);
    const response=await request(path); assert.equal(response.status,200,url);
    assert.doesNotMatch(response.headers.get('x-robots-tag')??'',/noindex|nofollow|none|nosnippet|noarchive|unavailable_after|max-snippet:\s*0/i,url);
    const html=await response.text(); await dom.setContent(html,{waitUntil:'domcontentloaded'});
    const data=await dom.evaluate(()=>({
      title:document.title, description:document.querySelector('meta[name=description]')?.content,
      robots:[...document.querySelectorAll('meta[name=robots]')].map(n=>n.content),
      h1:[...document.querySelectorAll('h1')].map(n=>n.textContent.trim()),
      main:(() => { const main=document.querySelector('main')?.cloneNode(true); if(!main)return ''; main.querySelectorAll('script,style,template,form').forEach(n=>n.remove()); const walker=document.createTreeWalker(main,NodeFilter.SHOW_TEXT); const parts=[]; while(walker.nextNode())parts.push(walker.currentNode.textContent); return parts.join(' ').replace(/\s+/g,' ').trim(); })(),lang:document.documentElement.lang,dir:document.documentElement.dir,
      canonicalAbsolute:[...document.querySelectorAll('link[rel=canonical]')].every(n=>/^https:\/\//.test(n.getAttribute('href'))),
      canonical:[...document.querySelectorAll('link[rel=canonical]')].map(n=>n.href),
      alternates:Object.fromEntries([...document.querySelectorAll('link[rel=alternate][hreflang]')].map(n=>[n.hreflang,n.href])),
      og:document.querySelector('meta[property="og:locale"]')?.content,
      ogAlternates:[...document.querySelectorAll('meta[property="og:locale:alternate"]')].map(n=>n.content),
      json:[...document.querySelectorAll('script[type="application/ld+json"]')].map(n=>JSON.parse(n.textContent)),
      questions:[...document.querySelectorAll('summary h3')].map(n=>n.textContent.trim()),
      answers:[...document.querySelectorAll('details > p')].map(n=>n.textContent.trim()),
      links:[...document.querySelectorAll('main a[href],header a[href],footer a[href]')].map(n=>n.getAttribute('href')),
    }));
    assert.ok(data.title && [...data.title].length<=60,`${url}: title ${data.title?.length}: ${data.title}`);
    assert.ok(data.description && [...data.description].length<=160,`${url}: description ${data.description?.length}`);
    assert.equal(data.h1.length,1,`${url}: H1`); assert.ok(data.h1[0]);
    assert.doesNotMatch(data.robots.join(' '),/noindex/i,url);
    assert.ok(data.canonicalAbsolute,`${url}: relative canonical`);
    assert.deepEqual(data.canonical,[url],`${url}: canonical`);
    assert.ok(data.main?.length>100,`${url}: main content missing without JavaScript`);
    assert.equal(data.alternates['x-default'],data.alternates.en,`${url}: x-default must be English`);
    assert.ok(data.alternates['x-default'],`${url}: x-default missing`);
    assert.equal(data.alternates[data.lang],url,`${url}: html lang/self hreflang`);
    assert.equal(data.dir,data.lang==='ar'?'rtl':'ltr',url);
    assert.equal(data.og,localeOg[data.lang],url);
    assert.deepEqual(data.ogAlternates.sort(),Object.keys(data.alternates).filter(l=>l!==data.lang && l!=='x-default').map(l=>localeOg[l]).sort(),`${url}: OG languages`);
    assert.ok(data.json.length,`${url}: JSON-LD missing`);
    for(const node of data.json.flatMap(g=>g['@graph']??[g])) if(node['@type']==='FAQPage') {
      assert.deepEqual(node.mainEntity.map(q=>q.name),data.questions,`${url}: visible FAQ questions`);
      assert.deepEqual(node.mainEntity.map(q=>q.acceptedAnswer.text),data.answers,`${url}: visible FAQ answers`);
    }
    const block=blocks[index]; const lastmod=block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
    assert.ok(lastmod && Number.isFinite(Date.parse(lastmod)) && Date.parse(lastmod)<=Date.now(),`${url}: lastmod`);
    const xmlAlternates=Object.fromEntries([...block.matchAll(/<xhtml:link\s+rel="alternate"\s+hreflang="([^"]+)"\s+href="([^"]+)"\s*\/?\s*>/g)].map(m=>[m[1],m[2]]));
    assert.deepEqual(data.alternates,xmlAlternates,`${url}: sitemap/head alternatives`);
    pages.set(url,data);
    console.log(`PASS ${path} (${data.lang}, ${data.main.split(/\s+/).length} words in main)`);
  }
  for(const [url,data] of pages) {
    for(const [lang,target] of Object.entries(data.alternates)) {
      assert.ok(pages.has(target),`${url}: alternate target absent from sitemap: ${target}`);
      if(lang!=='x-default') assert.equal(pages.get(target).alternates[data.lang],url,`${url}: nonreciprocal ${target}`);
    }
    for(const href of data.links.filter(h=>h?.startsWith('/') && !h.startsWith('//'))) {
      const target=new URL(href,origin); target.hash=''; target.search='';
      if(/^\/local-media\/generated\/(licenses\/(mediabunny|mp3-encoder|lame|gifenc|emscripten|musl|compiler-rt)\.txt|corresponding-source\.tar\.gz)$/.test(target.pathname)) {
        assert.equal((await request(target.pathname)).status,200,`license/source asset ${target.pathname}`);
      } else assert.ok(pages.has(target.href),`${url}: internal content link outside sitemap: ${target.href}`);
    }
    if(new URL(url).pathname!=='/') { const other=await request(new URL(url).pathname+'/'); assert.equal(other.status,301,`${url}: trailing slash status`); assert.equal(new URL(other.headers.get('location'),base).pathname,new URL(url).pathname); }
  }
  assert.equal((await request('/seo-check-missing-6d18c7')).status,404,'missing URL must return 404');
  console.log(`SEO CHECK PASS: ${pages.size} URLs; HTTP 200, robots, title/description, H1, canonicals, reciprocal hreflang, lang/RTL, OG, JSON-LD/FAQ, sitemap dates, SSR text, internal links, 301 and 404.`);
} finally {
  await browser?.close(); server?.kill('SIGTERM');
}
