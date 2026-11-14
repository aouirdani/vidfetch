import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LOCALES, articlePath } from '../src/i18n/config';
import { guides, guideSchema } from '../src/lib/guides';
import { AI_ASSISTED_BYLINE, REVIEW_BYLINE } from '../src/lib/guide-labels';
import { ArticleView } from '../src/views/SiteViews';
import { resolvePage } from '../src/lib/site-pages';
import { trustPath } from '../src/lib/trust-pages';

test('unreviewed legacy signatures disclose only AI assistance in all eight languages', () => {
  for (const locale of LOCALES) {
    const guide=guides(locale).find(g=>g.id==='why-cant-i-save-tiktok')!;
    const saved={...guide};
    try {
      // Model an unreviewed legacy record in memory, without editing its source.
      Object.assign(guide,{reviewedBy:null,reviewedAt:null});
      const page=resolvePage(articlePath(locale,guide.slug).split('/').filter(Boolean))!;
      assert.ok(page?.indexable, locale);
      const html=renderToStaticMarkup(createElement(ArticleView,{page}));
      const signature=html.match(/<p[^>]*data-guide-byline[^>]*>([\s\S]*?)<\/p>/)?.[1];
      assert.equal(signature,AI_ASSISTED_BYLINE[locale],locale);
      assert.doesNotMatch(signature!,/<time|<a|Aymane/);
      assert.equal(guideSchema(guide).author['@type'],'Organization');
    } finally {Object.assign(guide,saved);}

  }
});

test('a later explicit review moves a legacy guide to the Person byline while preserving its first publication date', () => {
  const guide=guides('fr').find(g=>g.id==='why-cant-i-save-tiktok')!;
  const saved={...guide};
  try {
    // In-memory fixture only; the source file is neither approved nor edited.
    Object.assign(guide,{reviewedBy:'Aymane Ouirdani',reviewedAt:'2026-11-14',updated:'2026-11-14'});
    const page=resolvePage(articlePath('fr',guide.slug).split('/').filter(Boolean))!;
    assert.ok(page.indexable);
    const html=renderToStaticMarkup(createElement(ArticleView,{page}));
    const signature=html.match(/<p[^>]*data-guide-byline[^>]*>([\s\S]*?)<\/p>/)![1];
    assert.ok(signature.includes('Aymane Ouirdani'));
    assert.ok(signature.includes(REVIEW_BYLINE.fr));
    assert.ok(signature.includes(`href="${trustPath('fr','about')}"`));
    assert.match(signature,/<time dateTime="2026-11-14"|<time datetime="2026-11-14"/);
    const schema=guideSchema(guide);
    assert.equal(schema.author['@type'],'Person');
    assert.equal(schema.datePublished,saved.published);
    assert.equal(schema.dateModified,'2026-11-14');
  } finally {Object.assign(guide,saved);}
});
