import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import frozen from './fixtures/public-indexing-expected.json';
import sitemap from '../src/app/sitemap';
import { resolvePage, languageAlternates } from '../src/lib/site-pages';
import { localizedMetadata } from '../src/lib/localized-seo';
import { guides, isLegacyPublishedGuide, isPublishedGuide, isReviewedGuide, guideSchema, type Guide } from '../src/lib/guides';
import type { Locale } from '../src/i18n/config';

// This snapshot is the deployed 106-URL baseline. New URLs must never replace or shrink it.
test('all 106 production sitemap URLs remain indexable with identical canonical and reciprocal hreflang', () => {
  assert.equal(Object.keys(frozen.indexable).length, 106);
  assert.equal(Object.keys(frozen.pages).length, 106);
  const current = new Map(sitemap().map(p => [p.url, p]));
  for (const [path, previous] of Object.entries(frozen.pages)) {
    const entry = current.get(previous.canonical);
    assert.ok(entry, `${path}: production URL removed from sitemap`);
    const page = resolvePage(path.split('/').filter(Boolean));
    assert.ok(page?.indexable, `${path}: production route unpublished`);
    const meta = localizedMetadata(page);
    assert.deepEqual(meta.robots, { index: true, follow: true }, path);
    assert.equal(meta.alternates?.canonical, previous.canonical, path);
    assert.deepEqual(languageAlternates(page), previous.hreflang, path);
    assert.deepEqual(entry.alternates?.languages, previous.hreflang, path);
  }
});

test('the 34 legacy guides retain their actual dates, content and all pre-existing metadata', () => {
  assert.equal(frozen.guides.length, 34);
  for (const previous of frozen.guides) {
    const guide = guides(previous.locale as Locale).find(g => g.id === previous.id)!;
    assert.ok(guide, previous.path);
    assert.equal(guide.legacyPublished, true, previous.path);
    assert.equal(guide.published, previous.published, previous.path);
    const reviewed = isReviewedGuide(guide);
    assert.equal(createHash('sha256').update(guide.body).digest('hex'), previous.bodySha256, previous.path);
    const metadata = Object.fromEntries(Object.entries(guide).filter(([key]) => !['body','minutes','id','locale','slug','legacyPublished','reviewedBy','reviewedAt'].includes(key)));
    assert.deepEqual(metadata, reviewed ? { ...previous.metadata, updated: guide.updated, status: guide.status } : previous.metadata, previous.path);
    assert.equal(isLegacyPublishedGuide(guide), true);
    assert.equal(isPublishedGuide(guide), true);
    assert.equal(guideSchema(guide).author['@type'], reviewed ? 'Person' : 'Organization');
    assert.equal(guideSchema(guide).datePublished, previous.published);
  }
});

test('legacy publication cannot be assigned to a new guide or the new series', () => {
  const prior = guides().find(g => g.legacyPublished)!;
  assert.equal(isPublishedGuide({ ...prior, status: 'draft' }), true, 'review workflow cannot remove a legacy page');
  for (const patch of [{ id: 'a-new-guide' }, { series: 'adsense-2026-11' }, { slug: 'a-different-url' }, { published: '2026-11-14' }]) {
    const candidate = { ...prior, ...patch, legacyPublished: true, status: 'published' } as Guide;
    assert.equal(isLegacyPublishedGuide(candidate), false);
    assert.equal(isPublishedGuide(candidate), false);
  }
});
