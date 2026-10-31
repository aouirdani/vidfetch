import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LOCALES} from '../src/i18n/config';
import {platformCandidates,approvedPlatformCopy,platformPagePath,platformLinks,navigationPlatformLinks,type PlatformCandidate} from '../src/lib/platform-pages';
import {resolvePage,languageAlternates,sitePages} from '../src/lib/site-pages';
import {localizedMetadata,platformPageSchemas} from '../src/lib/localized-seo';
import {faqSchema} from '../src/lib/seo';
import sitemap from '../src/app/sitemap';
// @ts-expect-error Operator script is plain JavaScript; imported helpers perform no network work.
import {parseLinks,safeCode,mediaSummary,reportMarkdown,verify} from '../scripts/ovh/verify-platform-links.mjs';
const ids=['instagram-video','x-video'];
test('closed Instagram/X candidates have no route, sitemap URL or incoming link in any language',()=>{
 for(const e of platformCandidates.filter(e=>ids.includes(e.id))){assert.equal(e.published,false);assert.ok(Object.values(e.gate).every(v=>v===false));for(const l of LOCALES){const path=platformPagePath(e,l);assert.equal(resolvePage(path.split('/').filter(Boolean)),undefined);assert.ok(!sitemap().some(u=>u.url==='https://vidfetch.app'+path));assert.ok(!platformLinks(l).some(t=>t.id===e.id));assert.ok(!navigationPlatformLinks(l).some(t=>t.id===e.id));assert.ok(e.copy?.[l]?.details?.length);}}
});
test('publication fixture: all four switches alone expose 16 complete reciprocal pages without writing the catalogue',()=>{
 const baseline=sitePages().filter(p=>p.indexable).length;const disk=readFileSync('content/platforms/catalogue.json','utf8'),saved=[...platformCandidates];const fixtures=structuredClone(platformCandidates) as PlatformCandidate[];
 try{for(const e of fixtures.filter(e=>ids.includes(e.id))){e.published=true;e.gate={authorizedMediaVerified:true,copyReviewed:true,permissionToPublish:true};}platformCandidates.splice(0,platformCandidates.length,...fixtures);
 for(const e of fixtures.filter(e=>ids.includes(e.id)))for(const l of LOCALES){const copy=approvedPlatformCopy(e,l)!;assert.ok(copy);const path=platformPagePath(e,l),page=resolvePage(path.split('/').filter(Boolean))!;assert.equal(page.identity.kind,'platform');assert.equal(page.indexable,true);const alternates=languageAlternates(page);assert.equal(Object.keys(alternates).length,9);for(const other of LOCALES){const target=resolvePage(new URL(alternates[other]).pathname.split('/').filter(Boolean))!;assert.equal(languageAlternates(target)[l],'https://vidfetch.app'+path);}assert.equal(localizedMetadata(page).alternates?.canonical,'https://vidfetch.app'+path);assert.ok(sitemap().some(u=>u.url==='https://vidfetch.app'+path));const schemas=[...platformPageSchemas(page,copy),faqSchema(copy.faqs,'https://vidfetch.app'+path)];assert.deepEqual(JSON.parse(JSON.stringify(schemas)),schemas);assert.deepEqual(faqSchema(copy.faqs,'https://vidfetch.app'+path).mainEntity,copy.faqs.map(f=>({'@type':'Question',name:f.question,acceptedAnswer:{'@type':'Answer',text:f.answer}})));assert.ok(platformLinks(l).some(t=>t.id===e.id));}
 assert.equal(sitePages().filter(p=>p.indexable).length,baseline+16);
 }finally{platformCandidates.splice(0,platformCandidates.length,...saved);}assert.equal(readFileSync('content/platforms/catalogue.json','utf8'),disk);
});
test('operator helpers reject unsupported links and never emit raw response details',async()=>{
 const input='https://www.instagram.com/reel/abcdef/\nhttps://x.com/operator/status/12345';assert.equal(parseLinks(input).length,2);for(const link of ['https://x.com/operator','https://www.instagram.com/stories/me/123/','https://user:secret@x.com/op/status/1','https://x.com/op/status/1?ticket=secret'])assert.throws(()=>parseLinks(link));assert.equal(safeCode('https://media.invalid/video?signature=secret'),'UNSUPPORTED');assert.equal(safeCode('QUOTA_EXCEEDED'),'QUOTA_EXCEEDED');assert.throws(()=>mediaSummary({format:{duration:'2',format_name:'mp4'},streams:[{codec_type:'audio',codec_name:'aac'}]},'mp3'));assert.deepEqual(mediaSummary({format:{duration:'2',format_name:'mov,mp4'},streams:[{codec_type:'video',codec_name:'h264'}]},'mp4'),{durationSeconds:2,audioTracks:0,videoTracks:1,codecs:['h264']});const md=reportMarkdown({platform:'x',startedAt:'fixture',passed:0,attempted:1,ratePercent:0,typesPassing:[],results:[{link:'https://x.com/op/status/1',type:'video-post',kind:'mp4',status:'unsupported',code:'LOGIN_REQUIRED'}]});assert.doesNotMatch(md,/signature=|cookie=/);await assert.rejects(()=>verify({file:'missing',origin:'https://example.invalid',confirm:true}));
});
