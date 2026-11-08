import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { chromium } from 'playwright';
import { setTimeout as delay } from 'node:timers/promises';

const reserve=createServer(); reserve.listen(0,'127.0.0.1'); await once(reserve,'listening');
const port=reserve.address().port; await new Promise(resolve=>reserve.close(resolve));
const base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1'},detached:true,stdio:'ignore'});
let browser;
try {
  let ready=false;
  for(let i=0;i<80;i++){try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).status===200){ready=true;break;}}catch{}if(child.exitCode!==null)break;await delay(250);}
  assert.ok(ready,'production Next server should start');
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({javaScriptEnabled:false});
  const externalRequests=[];
  context.on('request',request=>{if(new URL(request.url()).origin!==base)externalRequests.push(request.url());});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const page=await context.newPage();
  const paths=['/','/fr','/id','/ar','/tiktok-video-downloader','/video-to-mp3','/compress-video','/trim-video','/video-to-gif','/fr/convertir-video-en-mp3','/id/kompres-video','/ar/daght-video'];
  for(const path of paths){
    const response=await page.goto(base+path,{waitUntil:'domcontentloaded'});
    assert.equal(response.status(),200,path);
    assert.equal(await page.locator('h1').count(),1,path);
    assert.equal(await page.locator('h1').isVisible(),true,`${path}: heading visible without JavaScript`);
    if(['/', '/fr', '/id', '/ar'].includes(path)){
      await page.locator('#faq').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('#faq').isVisible(),true,`${path}: FAQ visible without JavaScript`);
    }
    assert.ok((await page.title()).trim(),`${path}: title`);
    assert.ok((await page.locator('main').innerText()).trim().length>100,`${path}: SSR main text`);
    assert.ok(await page.locator('form').count()||await page.locator('input[type=file]').count(),`${path}: expected tool form`);
  }
  assert.equal((await page.goto(base+'/youtube-video-downloader',{waitUntil:'domcontentloaded'})).status(),404,'YouTube remains unpublished');
  assert.equal((await page.goto(base+'/missing-smoke-route',{waitUntil:'domcontentloaded'})).status(),404,'unknown routes stay 404');
  assert.deepEqual(externalRequests,[],'the smoke path must not contact third parties');
  console.log(`BROWSER SMOKE PASS: ${paths.length} SSR pages, no third-party requests, YouTube blocked, true 404s.`);
} finally {
  await browser?.close();
  if(child.exitCode===null){process.kill(-child.pid,'SIGTERM');await Promise.race([once(child,'exit'),delay(5000)]);if(child.exitCode===null)process.kill(-child.pid,'SIGKILL');}
}
