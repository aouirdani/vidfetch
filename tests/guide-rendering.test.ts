import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GuideBody } from '../src/components/GuideBody';
import { trustPath } from '../src/lib/trust-pages';
import { guides, isReviewedGuide } from '../src/lib/guides';

test('guide tables and procedures use semantic markup; only declared local images render',()=>{
 const body='1. Choose the source\n2. Save the result\n\n| Setting | Bytes |\n| --- | --- |\n| Local | 100 |\n\n![A local test interface](/guides/lab/test.webp)\n\n![An undeclared image](https://example.com/tracker.webp)\n\n<script>alert(1)</script>';
 const html=renderToStaticMarkup(createElement(GuideBody,{body,locale:'en',images:[{src:'/guides/lab/test.webp',alt:'A local test interface',width:390,height:844}]}));
 assert.match(html,/<ol><li>Choose the source<\/li><li>Save the result<\/li><\/ol>/);
 assert.match(html,/<table><thead><tr><th scope="col">Setting/);
 const image=html.match(/<img [^>]+>/)![0];
 assert.match(image,/loading="lazy"/);assert.match(image,/width="390"/);assert.match(image,/height="844"/);
 assert.equal((html.match(/<img /g)??[]).length,1);
 assert.doesNotMatch(html,/<script>|src="https:\/\/example.com/);
 assert.match(html,/&lt;script&gt;/);
});
test('mission guide cannot publish with a missing author or an unavailable About page',()=>{
 const draft=guides().find(g=>g.series==='adsense-2026-11')!;
 assert.ok(draft);
 assert.equal(isReviewedGuide({...draft,status:'ready',published:'2026-11-07',author:''}),false);
 if(!trustPath('en','about')) assert.equal(isReviewedGuide({...draft,status:'ready',published:'2026-11-07',author:'Test author'}),false);
});
