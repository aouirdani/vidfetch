// Real native transfers through a private SSH forward. Challenge/metadata are fixtures.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const origin='https://vidfetch.app:33443';
const output=process.env.VIDFETCH_TEST_OUTPUT??'backend/artifacts/preproduction-downloads';
await mkdir(output,{recursive:true});
const report={scope:'Private SSH forwarding to OVH loopback Caddy, isolated UID-filtered worker, W3C Big Buck Bunny licensed trailer; challenge and metadata simulated. Not YouTube or public HTTPS validation.',transfers:[],browserErrors:[],responseKinds:[]};
const browser=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP vidfetch.app 127.0.0.1'],...(process.platform==='darwin'?{channel:'chrome'}:{})});
try{
  for(const [locale,path,type,extension] of [['en','/','video','ogv'],['ar','/ar/','audio','mp3']]){
    const d=JSON.parse(await readFile(`src/i18n/messages/${locale}.json`,'utf8'));
    const context=await browser.newContext({acceptDownloads:true,ignoreHTTPSErrors:true,viewport:{width:390,height:844}});
    const completions=[],preparations=[];
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='challenges.cloudflare.com')return route.fulfill({contentType:'application/javascript',body:'window.turnstile={render:function(el,o){window.__fixtureLanguage=o.language;setTimeout(function(){o.callback("authorized-local-fixture")},10);return "fixture";},remove:function(){},reset:function(){}};'});
      return url.origin===origin?route.continue():route.abort();
    });
    const page=await context.newPage();page.on('pageerror',error=>report.browserErrors.push(error.message));
    context.on('response',async response=>{
      const url=new URL(response.url());
      if(url.pathname==='/api/download')report.responseKinds.push({method:response.request().method(),kind:url.searchParams.has('status')?'status':url.searchParams.has('ticket')?'ticket':'prepare',httpStatus:response.status()});
      if(url.pathname==='/api/download'&&url.searchParams.has('status')){const data=await response.json();if(data.status==='completed')completions.push({status:data.status,bytes:data.bytes});}
      if(url.pathname==='/api/download'&&response.request().method()==='POST'&&response.status()===201)preparations.push(await response.json());
    });
    await page.goto(origin+path,{waitUntil:'networkidle'});
    assert.equal(await page.locator('html').getAttribute('lang'),locale);
    assert.equal(await page.locator('html').getAttribute('dir'),locale==='ar'?'rtl':'ltr');
    const input=page.getByRole('textbox',{name:d.videoLink});assert.equal(await input.getAttribute('dir'),'ltr');
    await input.fill('https://youtu.be/aqz-KE-bpKQ');await page.getByRole('button',{name:d.extract,exact:true}).click();
    await page.getByRole('tab',{name:new RegExp(d.video)}).waitFor({timeout:30000});
    assert.equal(await page.evaluate(()=>window.__fixtureLanguage),locale);
    if(type==='audio'){await page.getByRole('tab',{name:new RegExp(d.audio)}).click();await page.getByRole('radio',{name:/MP3/}).click();}
    const start=Date.now();
    let timer;
    const received=new Promise((resolve,reject)=>{
      timer=setTimeout(()=>reject(Error('Native fixture transfer timed out')),120000);
      context.once('page',popup=>popup.once('download',download=>{clearTimeout(timer);resolve(download);}));
    });
    try{
      await page.getByRole('button',{name:new RegExp('^'+d.download+' ')}).click();
      const download=await received;const file=output+'/received.'+extension;
      await download.saveAs(file);assert.equal(await download.failure(),null);
      await page.locator('p:not(.sr-only)').filter({hasText:d.saved.split('{size}')[0]}).waitFor({timeout:30000});
      for(let attempt=0;!completions.length&&attempt<120;attempt++)await page.waitForTimeout(250);
      const complete=completions.at(-1);assert.ok(complete,'The server must report completed after the native file has finished');
      const size=(await stat(file)).size;assert.equal(complete.bytes,size);
      const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);
      const sha256=hash.digest('hex');
      assert.equal(sha256,type==='video'?'dcbe6f2ea404a52d4b2f6fc91f274874e69be1671a1097eb3dc19f28f7c6e40f':'38b23dc423846fff16d0d88950390ace9e9d3152d871ea8d0d0f9f676bd69ecf');
      const ready=preparations.at(-1);assert.ok(ready);
      assert.equal(await page.evaluate(async url=>(await fetch(url,{credentials:'same-origin'})).status,ready.downloadUrl),404);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      report.transfers.push({locale,type,bytes:size,sha256,completedBytes:complete.bytes,status:complete.status,singleUse:true,startedAt:new Date(start).toISOString(),milliseconds:Date.now()-start,rtl:locale==='ar'});
    }finally{clearTimeout(timer);await context.close();}
  }
  assert.deepEqual(report.browserErrors,[]);
}finally{await browser.close();await writeFile(output+'/verification.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
