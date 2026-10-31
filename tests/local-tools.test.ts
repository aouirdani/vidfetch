import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LOCALES} from '../src/i18n/config';
import {toolCopy,toolPath,TOOL_IDS} from '../src/local-tools/catalogue';
import {resolvePage,sitePages,languageAlternates} from '../src/lib/site-pages';
import {localizedMetadata} from '../src/lib/localized-seo';
import sitemap from '../src/app/sitemap';
import {showsAds} from '../src/lib/adsense';
import {LOCAL_LIMITS,PRESETS} from '../src/local-tools/limits';
test('32 distinct SSR local tools, equivalent languages, metadata and no third party advertising',()=>{
 const contract=JSON.parse(readFileSync('deploy/ovh/tests/fixtures/public-indexing-expected.json','utf8'));assert.deepEqual(new Set(Object.keys(contract.indexable)),new Set(sitePages().filter(p=>p.indexable).map(p=>p.path)));const paths=new Set(sitePages().map(p=>p.path));assert.equal(paths.size,sitePages().length);
 const urls=new Set(sitemap().map(p=>p.url));
 for(const locale of LOCALES)for(const id of TOOL_IDS){const c=toolCopy(locale,id),path=toolPath(locale,id),page=resolvePage(path.split('/').filter(Boolean))!;assert.deepEqual(page.identity,{kind:'local-tool',id});assert.ok(urls.has('https://vidfetch.app'+path));assert.equal(Object.keys(languageAlternates(page)).length,9);assert.equal(showsAds(page),false);const meta=localizedMetadata(page);assert.ok((c.title+' | VidFetch').length<=60);assert.ok(c.description.length<=155);assert.equal(meta.alternates?.canonical,'https://vidfetch.app'+path);const text=[c.heading,c.intro,...c.sections.flatMap(s=>[s.heading,...s.paragraphs]),...c.faqs.flatMap(f=>[f.question,f.answer])].join(' ');const count=text.split(/\s+/).length;assert.ok(count>=700&&count<=1000,`${locale}/${id}: ${count}`);assert.doesNotMatch(text,/\{\{|\bTODO\b|\blorem\b|YouTube|Instagram/i);}
});
test('real local limits and pinned browser-only libraries',()=>{assert.equal(LOCAL_LIMITS.mobileBytes,8*1024**2);assert.equal(LOCAL_LIMITS.desktopBytes,32*1024**2);assert.equal(LOCAL_LIMITS.gifSeconds,15);assert.equal(LOCAL_LIMITS.timeoutMs,180000);assert.deepEqual(Object.values(PRESETS),[2000000,1000000,500000]);const pkg=JSON.parse(readFileSync('package.json','utf8'));for(const name of ['mediabunny','@mediabunny/mp3-encoder','gifenc']){assert.match(pkg.devDependencies[name],/^\d+\.\d+\.\d+$/);assert.equal(pkg.dependencies[name],undefined);}});
