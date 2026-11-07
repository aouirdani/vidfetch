import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import sharp from 'sharp';

/** Validate prepared content too: publication gating must not hide authoring errors. */
export async function checkGuideContent() {
  const bundle=await build({stdin:{contents:`export {guides,isReviewedGuide} from './src/lib/guides';export {sitePages} from './src/lib/site-pages';export {LOCALES,articlePath} from './src/i18n/config';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
  const {guides,isReviewedGuide,sitePages,LOCALES,articlePath}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  const paths=new Set(sitePages().map(p=>p.path));
  for(const locale of LOCALES) for(const guide of guides(locale)) paths.add(articlePath(locale,guide.slug));
  let count=0;
  for(const locale of LOCALES) {
    const titles=new Set(),descriptions=new Set();
    for(const guide of guides(locale)) {
      for(const [key,seen] of [['title',titles],['description',descriptions]]) {const value=guide[key].trim().toLocaleLowerCase();assert.ok(!seen.has(value),`${locale}/${guide.id}: duplicate ${key}`);seen.add(value);}
      if(guide.series!=='adsense-2026-11') continue;
      count++;
      assert.ok(guide.title.length+11<=60,guide.id+': title including brand');
      assert.ok(guide.description.length<=155,guide.id+': meta description');
      assert.doesNotMatch(guide.body,/^# /m,guide.id+': the template supplies the only H1');
      assert.ok(guide.sources.length>=2,guide.id+': sources');
      for(const source of guide.sources) {assert.match(source.url,/^https:\/\//);assert.ok(source.accessed && /^\d{4}-\d{2}-\d{2}$/.test(source.accessed) && source.accessed<=new Date().toISOString().slice(0,10),guide.id+': source consultation date');}
      const links=[...guide.body.matchAll(/(?<!!)\[[^\]]+\]\((\/[^\s)]+)\)/g)].map(m=>m[1]);
      assert.ok(links.length>=2 && links.length<=4,`${locale}/${guide.id}: contextual links ${links.length}`);
      for(const href of links) assert.ok(paths.has(href.split('#')[0]),`${locale}/${guide.id}: missing internal target ${href}`);
      const images=[...guide.body.matchAll(/!\[([^\]]+)\]\(([^)]+)\)/g)];
      assert.ok(images.length<=3,guide.id+': too many captures');
      if(!['G27','G28'].includes(guide.planId)) assert.ok(images.length>=1,guide.id+': missing actual UI capture');
      for(const [,alt,src]of images) {
        const image=guide.images?.find(i=>i.src===src&&i.alt===alt);assert.ok(image,guide.id+': image metadata');
        assert.match(src,/^\/guides\/lab\/[a-z0-9-]+\.(webp|avif)$/);assert.ok(alt.length>=15);
        const actual=await sharp(readFileSync('public'+src)).metadata();assert.equal(actual.width,image.width);assert.equal(actual.height,image.height);
      }
      if(isReviewedGuide(guide)) assert.doesNotMatch(JSON.stringify(guide),/\[À\s+COMPLÉTER\s*:/iu,guide.id+': published unfinished field');
    }
  }
  console.log(`GUIDE CONTENT PASS: ${count} mission sources; metadata, consulted sources, contextual targets, UI captures and draft gates.`);
}
