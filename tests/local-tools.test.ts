import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LOCALES} from '../src/i18n/config';
import {toolCopy,toolPath,TOOL_IDS} from '../src/local-tools/catalogue';
import {resolvePage,sitePages,languageAlternates} from '../src/lib/site-pages';
import {localizedMetadata} from '../src/lib/localized-seo';
import sitemap from '../src/app/sitemap';
import {showsAds} from '../src/lib/adsense';
import {LOCAL_LIMITS,PRESETS,TOOL_LIMITS,outputDimensions} from '../src/local-tools/limits';
test('32 distinct SSR local tools, equivalent languages, metadata and no third party advertising',()=>{
 const contract=JSON.parse(readFileSync('deploy/ovh/tests/fixtures/public-indexing-expected.json','utf8'));assert.deepEqual(new Set(Object.keys(contract.indexable)),new Set(sitePages().filter(p=>p.indexable).map(p=>p.path)));const paths=new Set(sitePages().map(p=>p.path));assert.equal(paths.size,sitePages().length);
 const urls=new Set(sitemap().map(p=>p.url));
 for(const locale of LOCALES)for(const id of TOOL_IDS){const c=toolCopy(locale,id),path=toolPath(locale,id),page=resolvePage(path.split('/').filter(Boolean))!;assert.deepEqual(page.identity,{kind:'local-tool',id});assert.ok(urls.has('https://vidfetch.app'+path));assert.equal(Object.keys(languageAlternates(page)).length,9);assert.equal(showsAds(page),false);const meta=localizedMetadata(page);assert.ok((c.title+' | VidFetch').length<=60);assert.ok(c.description.length<=155);assert.equal(meta.alternates?.canonical,'https://vidfetch.app'+path);const text=[c.heading,c.intro,c.stepsHeading,...c.steps,...c.sections.flatMap(s=>[s.heading,...s.paragraphs]),...c.faqs.flatMap(f=>[f.question,f.answer])].join(' ');assert.doesNotMatch(text,/\{\w+\}/,'limits must be resolved server side');const count=text.split(/\s+/).length;assert.ok(count>=700&&count<=1000,`${locale}/${id}: ${count}`);assert.doesNotMatch(text,/\{\{|\bTODO\b|\blorem\b|YouTube|Instagram/i);}
});
test('real local limits and pinned browser-only libraries',()=>{assert.equal(TOOL_LIMITS.audio.mobile.inputBytes,200*1024**2);assert.equal(TOOL_LIMITS.trim.desktop.inputBytes,1024*1024**2);assert.equal(LOCAL_LIMITS.gifSeconds,15);assert.equal(TOOL_LIMITS.audio.mobile.duration,300);assert.equal(TOOL_LIMITS.audio.desktop.duration,1200);assert.deepEqual(outputDimensions(3840,2160,0),{width:1920,height:1080});assert.deepEqual(outputDimensions(2160,3840,0),{width:1080,height:1920});assert.deepEqual(Object.values(PRESETS),[2000000,1000000,500000]);const pkg=JSON.parse(readFileSync('package.json','utf8'));for(const name of ['mediabunny','@mediabunny/mp3-encoder','gifenc']){assert.match(pkg.devDependencies[name],/^\d+\.\d+\.\d+$/);assert.equal(pkg.dependencies[name],undefined);}});
