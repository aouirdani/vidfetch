// Run with node --import tsx. Reads source state; never approves or publishes content.
import { writeFileSync } from 'node:fs';
import { LOCALES, LANGUAGES, articlePath } from '../../src/i18n/config.ts';
import { guides, isPublishedGuide } from '../../src/lib/guides.ts';
import { sitePages } from '../../src/lib/site-pages.ts';
import { platformCandidates, platformPagePath } from '../../src/lib/platform-pages.ts';
const pages = sitePages(), articles = LOCALES.flatMap(locale => guides(locale));
const lines = ['# VidFetch — URL et état d’indexation', '',
  'Inventaire généré depuis les sources. « Prête » signifie prête dans le code, sans publication ni indexation réelle revendiquée. Les dates éditoriales sont en UTC.', '',
  '## Pages disponibles', '', '| Langue | URL canonique | Prête pour indexation | Condition |', '|---|---|---|---|'];
for (const page of pages) lines.push(`| ${page.locale} | ${new URL(page.path, 'https://vidfetch.app').href} | ${page.indexable ? 'OUI' : 'NON'} | ${page.identity.kind === 'platform' ? 'Route historique informative ; fonctionnalité non validée' : page.identity.kind === 'guide' ? 'Date de publication réelle manquante' : page.identity.kind === 'blog' ? 'Aucun article publié dans cette langue' : 'Recette publique et activation encore nécessaires'} |`);
lines.push('', '## Traductions nécessitant une relecture', '', '| Langue | Identifiant commun | URL prévue | Statut |', '|---|---|---|---|');
for (const guide of articles.filter(g => g.locale !== 'en')) lines.push(`| ${guide.locale} | ${guide.id} | ${articlePath(guide.locale, guide.slug)} | ${guide.review?.linguistic ?? 'pending'} / ${guide.review?.technical ?? 'pending'} — route 404 jusqu’à approbation |`);
lines.push('', '## Pages plateformes préparées', '', '| Langue | Sujet | URL prévue | Statut |', '|---|---|---|---|');
for (const locale of LOCALES) for (const entry of platformCandidates) lines.push(`| ${locale} | ${entry.id} | ${platformPagePath(entry, locale)} | NON PUBLIABLE : preuve de téléchargement et contenu validé requis |`);
writeFileSync('docs/VIDFETCH-URL-INDEXATION.md', lines.join('\n') + '\n');
const summary = { locales: LOCALES.map(locale => ({ locale, name: LANGUAGES[locale].name, totalGuides: guides(locale).length, reviewed: guides(locale).filter(g => g.status === 'ready').length, published: guides(locale).filter(isPublishedGuide).length })), availablePages: pages.length, indexablePages: pages.filter(p => p.indexable).length, translatedGuides: articles.filter(g => g.locale !== 'en').length, platformIntents: platformCandidates.length };
writeFileSync('docs/VIDFETCH-CONTENT-STATUS.json', JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
