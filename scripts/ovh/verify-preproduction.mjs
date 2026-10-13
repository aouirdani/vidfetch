// Read-only HTTP/browser checks of the installed release through private SSH forwarding.
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = process.env.VIDFETCH_TEST_SITE;
const output = process.env.VIDFETCH_TEST_OUTPUT ?? 'backend/artifacts/preproduction-validation';
assert.ok(base && /^http:\/\/127\.0\.0\.1:\d+$/.test(base), 'Private loopback test origin required');
await mkdir(output, { recursive: true });
const locales = ['en','fr','es','pt-BR','id','de','it','ar'];
const homes = ['/','/fr/','/es/','/pt/','/id/','/de/','/it/','/ar/'];
const blogs = ['/blog','/fr/guides','/es/guias','/pt/guias','/id/panduan','/de/ratgeber','/it/guide','/ar/أدلة'];
const report = { release: '', pages: [], locales: [], checks: [], browserErrors: [], externalRequestsBlocked: true };
const browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { channel:'chrome' } : {}) });
try {
  const health = await (await fetch(base+'/api/health')).json();
  assert.equal(health.ok,true); assert.equal(health.release,'689c592141287a1ca1e45569a89e5d76f18133ed');
  assert.equal(health.downloads.available,false); report.release=health.release;
  const sitemap=await (await fetch(base+'/sitemap.xml')).text();
  const indexed=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>new URL(match[1]).pathname);
  assert.equal(indexed.length,16); assert.equal(new Set(indexed).size,16);
  assert.doesNotMatch(sitemap,/\/api\/|youtube|mp4-vs-webm/);
  const guides=(await readdir('content/guides')).filter(file=>file.endsWith('.md')).map(file=>'/blog/'+file.slice(0,-3));
  const paths=[...indexed,...blogs,...guides,'/youtube-video-downloader','/tiktok-video-downloader','/instagram-reels-downloader','/twitter-video-downloader'];
  assert.equal(paths.length,38);
  const context=await browser.newContext({javaScriptEnabled:false});const dom=await context.newPage();
  for(const path of paths){
    const response=await fetch(base+path);assert.equal(response.status,200,path);await dom.setContent(await response.text());
    assert.equal(await dom.locator('h1').count(),1,path);
    assert.equal(await dom.locator('link[rel=canonical]').evaluate(element=>element.href),new URL(path,'https://vidfetch.app').href,path);
    const noindex=await dom.locator('meta[name=robots]').evaluate(element=>/noindex/.test(element.content));
    assert.equal(noindex,!indexed.includes(path),path);
    assert.equal(await dom.locator('link[rel=alternate][hreflang]').count(),indexed.includes(path)?9:0,path);
    for(const json of await dom.locator('script[type="application/ld+json"]').allTextContents())JSON.parse(json);
    report.pages.push({path,status:200,indexable:!noindex});
  }
  for(let i=0;i<locales.length;i++){
    const locale=locales[i],d=JSON.parse(await readFile(`src/i18n/messages/${locale}.json`,'utf8'));
    const content=await (await fetch(base+homes[i])).text();await dom.setContent(content);
    assert.equal(await dom.locator('html').getAttribute('lang'),locale);
    assert.equal(await dom.locator('html').getAttribute('dir'),locale==='ar'?'rtl':'ltr');
    assert.equal(await dom.locator('h1').textContent(),d.heroTitle+d.heroAccent);
    for(let target=0;target<locales.length;target++){
      await dom.setContent(content);const href=await dom.locator(`link[hreflang="${locales[target]}"]`).getAttribute('href');
      assert.equal(new URL(href).pathname,homes[target]);await dom.setContent(await (await fetch(base+new URL(href).pathname)).text());
      assert.equal(new URL(await dom.locator(`link[hreflang="${locale}"]`).getAttribute('href')).pathname,homes[i]);
    }
    const mobile=await browser.newContext({viewport:{width:390,height:844}});const page=await mobile.newPage();
    page.on('pageerror',error=>report.browserErrors.push(error.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    await page.goto(base+homes[i]);await page.locator('[data-language-selector] summary').click();
    assert.equal(await page.locator('[data-language-selector] nav a').count(),8);
    const target=i===0?'fr':'en';await page.locator(`[data-language-selector] nav a[hreflang="${target}"]`).click();
    await page.waitForURL(base+(target==='en'?'/':'/fr/'));
    await page.goto(base+homes[i]);const input=page.getByRole('textbox',{name:d.videoLink});
    assert.equal(await input.getAttribute('dir'),'ltr');await input.fill('https://youtu.be/aqz-KE-bpKQ');
    await page.getByRole('button',{name:d.extract,exact:true}).click();
    await page.getByRole('status').filter({hasText:d.backendUnavailable}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,locale);
    const missing=await page.goto(base+homes[i]+'not-a-page');assert.equal(missing.status(),404,locale);
    await page.getByRole('heading',{name:d.notFoundTitle}).waitFor();assert.equal(await page.locator('link[rel=canonical]').count(),0);
    const tags=await page.locator('meta[name=robots]').evaluateAll(nodes=>nodes.map(node=>node.content));assert.ok(tags.every(value=>/noindex/.test(value)));
    report.locales.push({locale,SSR:true,mobile:true,selector:true,localizedUnavailable:true,localized404:true,RTL:locale==='ar'});
    await mobile.close();
  }
  for(const path of ['/fr/guides/mp4-ou-webm','/ar/تنزيل-فيديو-يوتيوب','/fr/api/download'])assert.equal((await fetch(base+path)).status,404,path);
  const robots=await (await fetch(base+'/robots.txt')).text();assert.match(robots,/Disallow: \/api\//);assert.match(robots,/Disallow: \/auth\//);
  for(const path of ['/api/fetch-info','/api/download','/api/download-access']){
    const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,503);assert.equal((await response.json()).code,'BACKEND_UNAVAILABLE');
  }
  assert.equal((await fetch(base+'/api/fetch-info')).status,405);
  assert.equal((await fetch(base+'/fr',{redirect:'manual'})).status,308);
  assert.deepEqual(report.browserErrors,[]);
  report.checks=['38 server HTML pages','eight mobile/selector/degraded/404 journeys including RTL','16 sitemap canonicals and reciprocal equivalents','unreviewed articles and platform drafts unavailable','robots and root API paths unchanged'];
}finally{await browser.close();await writeFile(output+'/verification.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({release:report.release,pages:report.pages.length,locales:report.locales.length,groups:report.checks.length,browserErrors:report.browserErrors.length}));
