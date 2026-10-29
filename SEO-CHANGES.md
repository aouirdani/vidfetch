# Refonte SEO de vidfetch.app

## 1. Architecture découverte

Next.js 16.4.2, React 19 et TypeScript, App Router. Le catch-all serveur `src/app/(site)/[[...segments]]` résout les routes depuis `src/lib/site-pages.ts` et les prérend avec `generateStaticParams`. Les vues sont dans `src/views/SiteViews.tsx`; seuls le formulaire et le parcours de téléchargement nécessitent une hydratation. Le contenu et les liens sont présents dans le HTML initial.

Huit dictionnaires dans `src/i18n/messages`, préfixes et codes dans `src/i18n/config.ts` (préfixe `/pt`, langue `pt-BR`). Les textes SEO des accueils restent hors des dictionnaires partagés avec la passerelle : `content/home-seo.json`. Les outils proviennent de `content/platforms/catalogue.json`; les guides sont des Markdown à métadonnées JSON dans `content/guides`. Le head vient de `localizedMetadata`, le document et son `lang/dir` du layout serveur, et les schémas des vues et de `localized-seo.ts`.

`src/app/robots.ts` et `src/app/sitemap.ts` génèrent leurs sorties au build depuis le même registre de routes. Lastmod correspond aux dates éditoriales, jamais à l’horloge du build : guides, copies outils, accueils, ou dernière révision réelle des mentions légales. Le blog prend la dernière modification de ses articles publiés.

OVH utilise le build standalone et Caddy devant le frontend Node et les services médias. Aucun nginx ni `.htaccess` actif dans cette architecture. Les en-têtes applicatifs sont aussi configurés dans `next.config.ts`. Plusieurs Caddyfiles publics et de préproduction coexistent : une PR frontend ne remplace pas la configuration Caddy active. Le workflow `.github/workflows/deploy.yml` valide maintenant les PR et conserve son verrou de déploiement sur `refs/heads/main`.

Travail isolé dans `/private/tmp/vidfetch-seo-refonte`, branche `seo/refonte` issue de `origin/main` (`4fc94dd7`). Les modifications préexistantes du répertoire principal et sa branche ont été préservées. Cinq commits, un par phase; aucune fusion et aucun push sur main.

## 2. Indexation et corrections techniques

Origine précise du noindex du blog : les dix guides anglais étaient `status: ready`, mais avec `published: null`. `isPublishedGuide` les excluait de l’index; `canIndex` dans `site-pages.ts` rendait aussi le blog non indexable. `localizedMetadata` émettait donc `noindex, follow`, sans hreflang, et le sitemap excluait ces routes. Une date de publication explicite, 2026-10-29, les rend maintenant indexables. La date de révision est celle de cette intervention éditoriale, pas celle de chaque compilation.

Les 70 anciennes traductions en attente de relecture restent indisponibles (404), sans page satellite publiée. Les trois nouvelles versions françaises ont une publication explicitement demandée (`publicationRequested`), avec contrôle du hash du corps anglais. Aucun nom de relecteur humain ni validation linguistique fictive n’a été ajouté. La relecture humaine reste recommandée.

Le Caddyfile général `deploy/ovh/Caddyfile` avait un `X-Robots-Tag` global par défaut; il a été retiré pour le contenu public. Les variantes `media/Caddyfile.public` et `media/Caddyfile.public-dl` n’avaient déjà pas cet en-tête global. Les modèles de préproduction conservent volontairement leurs protections. Il faut confirmer quel fichier est actif sur OVH après fusion, sans déployer un modèle de préproduction par erreur.

Restent volontairement hors index :

- Toute URL inexistante : HTTP 404 et meta `noindex` Next.js.
- `/api/*`, `/auth/*`, `/download-helper`, `/internal/*`, `/server-status` : admission, tickets, transfert, diagnostics; en-têtes techniques dans les Caddyfiles publics. Aucun contenu éditorial à indexer.
- `/_next/*` : assets techniques, `X-Robots-Tag: noindex` dans Next.
- Les hôtes de prévisualisation Cloudflare Pages et les configurations de test/préproduction : protection contre l’indexation d’environnements non publics. Ce ne sont pas des pages de contenu public du sitemap.

Aucune des 50 pages publiques indexables ne garde noindex. Les occurrences dans tests, commentaires et scripts de contrôle ne sont pas des directives servies.

Robots autorise le contenu public et exclut seulement `/api/`, `/auth/`, `/download-helper`, `/internal/`, `/tmp/`. Les anciennes exclusions génériques `/test/` et `/staging/` ont été retirées. Le lien Sitemap est présent. Le fichier robots du dépôt ne bloquait aucune route éditoriale connue : **l’URL exacte du signalement GSC ne peut pas être identifiée sans son export au niveau URL**. Aucun accès Search Console n’a été fourni. Le contrôle automatique prouve que robots ne bloque aucune URL du nouveau sitemap.

Politique : pas de slash final, sauf la racine `/`; l’autre forme renvoie 301, avec conservation de la query. Liens internes, canonicals, hreflang et sitemap suivent cette règle. La forme racine `https://vidfetch.app` sérialisée par Next et `https://vidfetch.app/` désigne la même URL absolue; le contrôle compare leur URL normalisée. Caddy conserve www → domaine nu en 301; le Caddyfile général et les deux configurations publiques explicitent également HTTP → HTTPS en 301. Les configurations actives d’OVH et les règles Cloudflare devront être vérifiées après déploiement : les modifier en production ne fait pas partie de cette PR.

Les groupes outils comportent les huit langues et x-default anglais. Les articles nouveaux ont EN ↔ FR, tandis que les anciens guides n’annoncent que l’anglais réellement publié. OG suit les mêmes équivalences; le sélecteur conserve la page équivalente, sinon l’accueil local. Arabe en RTL.

Schémas : Organization avec logo SVG, WebSite, WebApplication gratuit (`MultimediaApplication`, `Any`, `inLanguage`), BreadcrumbList et FAQ exactes sur les outils; BlogPosting avec dates et auteur/éditeur Organization. Les FAQ utilisent H3 sous H2 et chaque page un seul H1. L’espace avant les exemples de liens est explicite. Les vignettes de résultats ont alt descriptif, dimensions et chargement différé. Il n’y a pas de police web téléchargée : la pile système ne nécessite ni font-display ni préchargement. Le logo est vectoriel; l’image OG JPEG est conservée pour le partage social. Le format des vignettes distantes appartient à la plateforme et n’a pas été transcodé par cette PR.

## 3. URL indexables à soumettre dans Search Console

Soumettre `https://vidfetch.app/sitemap.xml` après déploiement. La liste ci-dessous correspond aux 50 entrées vérifiées, sans redirection, noindex ni erreur.

### en — 18 URL

- https://vidfetch.app/
- https://vidfetch.app/blog
- https://vidfetch.app/legal
- https://vidfetch.app/blog/720p-1080p-4k
- https://vidfetch.app/blog/backup-your-videos
- https://vidfetch.app/blog/bitrate-vs-resolution
- https://vidfetch.app/blog/h264-h265-av1
- https://vidfetch.app/blog/mp3-vs-m4a
- https://vidfetch.app/blog/mp4-vs-webm
- https://vidfetch.app/blog/reduce-video-size
- https://vidfetch.app/blog/save-tiktok-phone-gallery
- https://vidfetch.app/blog/save-tiktok-sound-mp3
- https://vidfetch.app/blog/video-download-fails
- https://vidfetch.app/blog/video-format-smartphone
- https://vidfetch.app/blog/video-to-audio
- https://vidfetch.app/blog/why-cant-i-save-tiktok
- https://vidfetch.app/tiktok-video-downloader
- https://vidfetch.app/tiktok-to-mp3

### fr — 8 URL

- https://vidfetch.app/fr
- https://vidfetch.app/fr/guides
- https://vidfetch.app/fr/mentions-legales
- https://vidfetch.app/fr/guides/enregistrer-tiktok-galerie-iphone-android
- https://vidfetch.app/fr/guides/recuperer-son-tiktok-mp3
- https://vidfetch.app/fr/guides/pourquoi-impossible-enregistrer-tiktok
- https://vidfetch.app/fr/telecharger-video-tiktok
- https://vidfetch.app/fr/tiktok-en-mp3

### es — 4 URL

- https://vidfetch.app/es
- https://vidfetch.app/es/aviso-legal
- https://vidfetch.app/es/descargar-video-tiktok
- https://vidfetch.app/es/tiktok-a-mp3

### pt-BR — 4 URL

- https://vidfetch.app/pt
- https://vidfetch.app/pt/termos-e-privacidade
- https://vidfetch.app/pt/baixar-video-tiktok
- https://vidfetch.app/pt/tiktok-para-mp3

### id — 4 URL

- https://vidfetch.app/id
- https://vidfetch.app/id/ketentuan-dan-privasi
- https://vidfetch.app/id/download-video-tiktok
- https://vidfetch.app/id/tiktok-ke-mp3

### de — 4 URL

- https://vidfetch.app/de
- https://vidfetch.app/de/rechtliches
- https://vidfetch.app/de/tiktok-video-herunterladen
- https://vidfetch.app/de/tiktok-zu-mp3

### it — 4 URL

- https://vidfetch.app/it
- https://vidfetch.app/it/note-legali
- https://vidfetch.app/it/scaricare-video-tiktok
- https://vidfetch.app/it/tiktok-in-mp3

### ar — 4 URL

- https://vidfetch.app/ar
- https://vidfetch.app/ar/الشروط-والخصوصية
- https://vidfetch.app/ar/tahmil-video-tiktok
- https://vidfetch.app/ar/tiktok-mp3

## 4. Nouvelles pages et contenu

Douze outils TikTok MP4/MP3 localisés :

- https://vidfetch.app/es/descargar-video-tiktok
- https://vidfetch.app/es/tiktok-a-mp3
- https://vidfetch.app/pt/baixar-video-tiktok
- https://vidfetch.app/pt/tiktok-para-mp3
- https://vidfetch.app/id/download-video-tiktok
- https://vidfetch.app/id/tiktok-ke-mp3
- https://vidfetch.app/de/tiktok-video-herunterladen
- https://vidfetch.app/de/tiktok-zu-mp3
- https://vidfetch.app/it/scaricare-video-tiktok
- https://vidfetch.app/it/tiktok-in-mp3
- https://vidfetch.app/ar/tahmil-video-tiktok
- https://vidfetch.app/ar/tiktok-mp3

Six articles, trois sujets avec versions EN/FR :

- https://vidfetch.app/blog/save-tiktok-phone-gallery
- https://vidfetch.app/blog/save-tiktok-sound-mp3
- https://vidfetch.app/blog/why-cant-i-save-tiktok
- https://vidfetch.app/fr/guides/enregistrer-tiktok-galerie-iphone-android
- https://vidfetch.app/fr/guides/recuperer-son-tiktok-mp3
- https://vidfetch.app/fr/guides/pourquoi-impossible-enregistrer-tiktok

L’index `/fr/guides` devient également une vraie page, avec ses trois articles. Le blog anglais existant et ses dix articles passent de noindex à indexable.

Les nouveaux outils contiennent environ 916 à 1 096 mots de contenu éditorial (hors formulaire et navigation). Ils intègrent une rédaction spécifique à TikTok et des explications de formats adaptées des guides existants dans leur langue; les sections procédurales locales sans leur commande ont été remplacées par des conseils complets sur la vérification du fichier. Les versions MP4 et MP3 ont des introductions, étapes et explications de format distinctes, et partagent les contraintes de produit et d’appareil utiles aux deux usages. Les descriptions restent sous 155 caractères et les titres sous 60.

Les huit accueils ciblent le téléchargement TikTok MP4 + MP3 et présentent environ 700–890 mots dans leur contenu principal. Les pages outils gardent l’intention spécifique MP4 ou MP3. Les six nouveaux articles ont environ 976–1 035 mots de corps. Les dates sont visibles, un outil pertinent figure dans le corps des articles et 2–3 articles connexes sont proposés.

Les affirmations restent limitées au produit : TikTok public, aucun retrait de filigrane incrusté, YouTube indisponible, Instagram/X non vérifiés. Les limites 256 Mo/30 minutes, les quotas et les droits sont conservés. Aucun avis ni chiffre d’usage inventé. Les sources externes des nouveaux guides sont les documentations officielles TikTok, Apple et Android, consultées pendant la rédaction; les transferts de test utilisent uniquement des octets synthétiques.

## 5. Validation

- Build OVH : `VIDFETCH_TARGET=ovh npm run build -- --webpack` — PASS.
- `npm run lint` — PASS.
- Suite applicative complète sous Node 22, en série : 183 tests, 0 échec, 0 ignoré.
- Backend : 17 tests PASS; passerelle : 3 tests PASS; charge/attente : 5 tests PASS.
- `npm run test:i18n` : 65 visites HTML, huit langues, sélecteurs, RTL, 404 localisées, transferts simulés — PASS.
- `npm run check:release` : aucune anomalie détectée.
- `git diff --check` : PASS.
- Caddy officiel 2.11.7, archive temporaire vérifiée par SHA-256 : HTTP/www → HTTPS en 301 avec chemin/query, contenu public 200 sans X-Robots-Tag, endpoint technique 503/noindex — PASS sur ports locaux éphémères.
- Curl local, sans exécution JavaScript : `/blog`, `/id/download-video-tiktok`, `/ar/tahmil-video-tiktok` → 200, title/meta/H1/lang et texte présents; arabe RTL. Une URL inexistante → 404 et noindex.

`scripts/seo-check` démarre un serveur éphémère depuis le build et analyse le HTML avec JavaScript désactivé et les ressources réseau du navigateur bloquées. Il contrôle aussi les liens internes, OG, les FAQ visibles face au JSON-LD, les lastmod et l’égalité sitemap/head. Les scripts/styles sont exclus du texte principal pour qu’un schéma seul ne puisse pas faire réussir le test. Il s’exécute dans la CI des PR avant toute possibilité de déploiement.

Sortie complète de `npm run seo-check` :

```text
> seo-check
> node scripts/seo-check

PASS / (en, 883 words in main)
PASS /blog (en, 486 words in main)
PASS /legal (en, 429 words in main)
PASS /blog/720p-1080p-4k (en, 614 words in main)
PASS /blog/backup-your-videos (en, 598 words in main)
PASS /blog/bitrate-vs-resolution (en, 615 words in main)
PASS /blog/h264-h265-av1 (en, 600 words in main)
PASS /blog/mp3-vs-m4a (en, 598 words in main)
PASS /blog/mp4-vs-webm (en, 636 words in main)
PASS /blog/reduce-video-size (en, 642 words in main)
PASS /blog/save-tiktok-phone-gallery (en, 1181 words in main)
PASS /blog/save-tiktok-sound-mp3 (en, 1135 words in main)
PASS /blog/video-download-fails (en, 609 words in main)
PASS /blog/video-format-smartphone (en, 622 words in main)
PASS /blog/video-to-audio (en, 609 words in main)
PASS /blog/why-cant-i-save-tiktok (en, 1129 words in main)
PASS /tiktok-video-downloader (en, 906 words in main)
PASS /tiktok-to-mp3 (en, 671 words in main)
PASS /fr (fr, 892 words in main)
PASS /fr/guides (fr, 138 words in main)
PASS /fr/mentions-legales (fr, 481 words in main)
PASS /fr/guides/enregistrer-tiktok-galerie-iphone-android (fr, 1147 words in main)
PASS /fr/guides/recuperer-son-tiktok-mp3 (fr, 1139 words in main)
PASS /fr/guides/pourquoi-impossible-enregistrer-tiktok (fr, 1113 words in main)
PASS /fr/telecharger-video-tiktok (fr, 904 words in main)
PASS /fr/tiktok-en-mp3 (fr, 707 words in main)
PASS /es (es, 711 words in main)
PASS /es/aviso-legal (es, 464 words in main)
PASS /es/descargar-video-tiktok (es, 965 words in main)
PASS /es/tiktok-a-mp3 (es, 981 words in main)
PASS /pt (pt-BR, 731 words in main)
PASS /pt/termos-e-privacidade (pt-BR, 447 words in main)
PASS /pt/baixar-video-tiktok (pt-BR, 951 words in main)
PASS /pt/tiktok-para-mp3 (pt-BR, 965 words in main)
PASS /id (id, 733 words in main)
PASS /id/ketentuan-dan-privasi (id, 394 words in main)
PASS /id/download-video-tiktok (id, 952 words in main)
PASS /id/tiktok-ke-mp3 (id, 1056 words in main)
PASS /de (de, 733 words in main)
PASS /de/rechtliches (de, 368 words in main)
PASS /de/tiktok-video-herunterladen (de, 958 words in main)
PASS /de/tiktok-zu-mp3 (de, 1069 words in main)
PASS /it (it, 796 words in main)
PASS /it/note-legali (it, 415 words in main)
PASS /it/scaricare-video-tiktok (it, 951 words in main)
PASS /it/tiktok-in-mp3 (it, 1133 words in main)
PASS /ar (ar, 703 words in main)
PASS /ar/%D8%A7%D9%84%D8%B4%D8%B1%D9%88%D8%B7-%D9%88%D8%A7%D9%84%D8%AE%D8%B5%D9%88%D8%B5%D9%8A%D8%A9 (ar, 380 words in main)
PASS /ar/tahmil-video-tiktok (ar, 976 words in main)
PASS /ar/tiktok-mp3 (ar, 1044 words in main)
SEO CHECK PASS: 50 URLs; HTTP 200, robots, title/description, H1, canonicals, reciprocal hreflang, lang/RTL, OG, JSON-LD/FAQ, sitemap dates, SSR text, internal links, 301 and 404.
```

## 6. Actions humaines et limites de vérification

- Relire les douze outils avec des locuteurs natifs, en priorité arabe et indonésien, puis allemand/italien/espagnol/portugais brésilien. Relire aussi les trois nouveaux articles français. Aucune validation native indépendante n’est prétendue.
- Après revue et fusion décidée par le propriétaire : laisser la CI déployer, vérifier le Caddyfile public actif et les réponses externes HTTP/HTTPS/www, puis purger le cache CDN si des anciennes metas/robots/sitemap persistent. Cette PR ne modifie aucun serveur ou cache de production.
- Soumettre le sitemap dans GSC; vérifier les anciennes exclusions et fournir l’URL exacte marquée « bloquée par robots.txt » si elle persiste. Le dépôt et le nouvel audit ne permettent pas d’attribuer ce signalement historique à une URL précise.
- Le build Turbopack a échoué localement sur une interdiction de création de processus/socket, même après demande d’exécution hors sandbox. Webpack compile le même build OVH avec succès; la CI Linux garde le build par défaut.
- Le premier run CI a révélé un découpage trop large dans le générateur de Caddyfiles de test : le nouveau bloc HTTP contenant www était confondu avec le bloc HTTPS www. Le repérage est désormais ancré sur le début du bloc et les redirections HTTP 301 apex/www, chemin et query sont testées.
- La suite Python OVH locale a été tentée : le premier lancement sandbox était limité par sudo; la relance s’est bloquée sur la disponibilité Docker avant les scénarios conteneur et a été interrompue. Ces scénarios restent à valider par la CI Linux; aucun succès global de cette suite n’est revendiqué ici.
- Aucun test de média tiers réel ni de nouvelle capacité de téléchargement n’a été réalisé. Les protections de préproduction et les limitations des formats distants restent en place.
- Aucun changement SEO ne garantit un nombre d’impressions. Suivre séparément impressions hors marque, pages indexées et requêtes MP4/MP3 après réexploration.
