# Résultat final — mission VidFetch

État établi le 2 novembre 2026 à partir du dépôt, des builds locaux, des statuts GitHub et des contrôles HTTP disponibles. Les pourcentages ci-dessous mesurent la réalisation technique du périmètre demandé, pas une probabilité de succès commercial.

## Architecture

Le site est une application Next.js App Router rendue côté serveur/statique. Les pages localisées passent par le registre `src/lib/site-pages.ts`, les textes sont en JSON et les pages plateformes sont générées depuis `content/platforms/catalogue.json` avec des gates éditoriales. Les outils locaux utilisent des workers auto-hébergés. Le backend et la passerelle de téléchargement sont des composants OVH séparés, protégés du déploiement frontend par `deploy/ovh/ci/promote.py`. Le trafic public passe par Caddy et Cloudflare. Le workflow GitHub construit et vérifie une archive frontend; les changements des moteurs exigent l'outil d'administration serveur.

## Les six piliers

| Pilier | Avant | État atteint | Preuve / réserve |
|---|---:|---:|---|
| Plateformes | TikTok disponible; Instagram/X annoncés sans garantie | **55 %** | TikTok conservé; Instagram/X et 4 plateformes candidates demeurent verrouillés. Aucun contournement ni test de plateforme sans média autorisé. PR [#30](https://github.com/aouirdani/vidfetch/pull/30) déployée; routes candidates absentes du rendu et du sitemap. |
| Formats | TikTok MP4/MP3 | **90 %** | MP3/M4A, compression, coupe et GIF locaux sont inclus dans les 32 pages de la PR #24 fusionnée. Sorties et confidentialité contrôlées avec fixtures; compatibilité réelle des téléphones non certifiée. |
| Capacité | Quotas et concurrence fixes; pas de mesure | **50 %** | Capacité configurable, réservation, file, métriques anonymes et banc isolé préparés dans la PR non fusionnée `feat/capacity-v2`. La validation locale ne remplace pas une mesure OVH; impossible de promettre plusieurs centaines d'usagers/jour. |
| UI/UX | Parcours initial | **75 %** | Navigation mobile, états et captures/audit de PR [#27](https://github.com/aouirdani/vidfetch/pull/27) sont intégrés à `main` et servis en production. Captures Playwright, pas de téléphones physiques. |
| SEO | Blog exclu, peu de pages localisées | **90 %** | Blog indexable, contenus TikTok dans 8 langues, outils locaux et contrôle SEO renforcé via PR #29 et #32. Les déploiements #33/#30 sont servis; aucun chiffre d'impressions n'est garanti. |
| Exploitation | Déploiement frontend automatique | **45 %** | CI et kit de lancement sont en place. Le dernier déploiement docs-only (#28) n'a pas atteint la production : le transfert a été refusé car le stockage d'archives CI dépasse 700 Mio. Le workflow de capacité v2 fournit un chemin administrateur; son script a passé la simulation Debian/systemd mais la CI de PR reste à exécuter. Pas d'accès SSH/sudo pour diagnostiquer/nettoyer le VPS. |

Les pourcentages ne s'additionnent pas et ne représentent pas un score du site. Ils indiquent le niveau de réalisation par rapport au périmètre de chaque pilier.

## État des changements et déploiement

- PR #24 (`feat/local-tools`) a été fusionnée et déployée. Elle comprend 32 routes d'outils locaux, l'OPFS, les plafonds prudents et les workers. Les mesures de laboratoire et l'analyse des budgets sont dans `TOOLS-CHANGES.md`, `docs/LOCAL-TOOLS-MEMORY.md` et `docs/LOCAL-TOOLS-OPFS-MEMORY.json`.
- PR #26 (`feat/capacity`) a été fusionnée en `a906a4969fba1dc3ecea6a0797bd0b27998856f1`, mais le run de déploiement `41334481660` a refusé l'archive : « Engine/gateway artifact changed; separate administrator review required ». La santé publique observée indiquait encore la release précédente `3a4f929a7c35b4fe416bf0ec540880c9ed7ffbb9`. Aucun changement backend n'a été promu. L'accès SSH non interactif est refusé; aucune commande sudo serveur n'a été exécutée.
- Le revert #31 (`revert: capacity until admin session`) a depuis été fusionné en `31f51121735aacbfee99c29dadee1440b693b734`. Son CI push/deploy `41343004391` a réussi. `/api/health` en production confirme ce commit comme actif, sans rollback; l'ancienne release `3a4f929` n'est donc plus active.
- La parité préalable a été contrôlée sur les archives CI exactes : les hashes moteur et passerelle de la release `3a4f929` et de l'archive candidate PR #31 sont identiques. Le code #26 a été retiré de `main`; capacité v2 n'est pas active.
- PR #29 a été fusionnée après correction de parité avec le gateway (#32). PR #27 et PR #30 ont été fusionnées dans l'ordre, puis #28 (kit de lancement) fusionnée en `e46c909`. CI build de #28 verte, mais deploy `41422094642` a échoué avant promotion avec `Upload storage bound reached`; aucun rollback ne s'est produit. La santé publique reste sur `6bc01461736d89522d7585de5c3bcf42f03c210a` (PR #30), ce qui signifie que #28 est documentaire et n'a aucun changement runtime à vérifier en production.
- La capacité v2 est préparée sur `feat/capacity-v2` avec la capacité de #26 et le nouvel outil administrateur `12-engine-release.sh`. Le test d'intégration systemd isolé passe; la PR doit rester non fusionnée jusqu'à CI complète et revue indépendante, puis l'opération serveur devra être exécutée par un administrateur. La procédure est dans `docs/VIDFETCH-CAPACITE-MISE-EN-PROD.md`.
- Aucun accès Cloudflare ou Search Console n'est configuré; aucun cache CDN n'a été purgé.

## Résultats de validation disponibles

- Phase 1 : rapports de CI indiqués dans `TOOLS-CHANGES.md`; builds, lint, typage, tests des outils et du backend documentés. Profils Playwright Chromium/WebKit et données de mémoire disponibles; aucun iPhone ou téléphone Android matériel testé.
- Phase 2 : banc synthétique local **7/7**, pic observé **85,05 Mio RSS** pour sa fixture de **396 790 octets**; ce résultat n'est ni un test VPS ni une projection d'utilisateurs quotidiens. Réglages de production non appliqués. Script `12-engine-release.sh` vérifié par systemd simulé : check, application, idempotence et rollback.
- Phase 3 : PR #27 build réussi. Les captures avant/après et mesures sont dans `docs/ux/` de cette branche; tests sur dimensions Playwright, pas sur appareils physiques.
- Phase 4 : dans `feat/platform-audit`, `npm run lint`, `npm run typecheck`, `npm test` **192/192**, `npm run test:i18n` (**97 pages**, 8 langues) passent. Les candidats n'apparaissent ni dans le sitemap ni dans le rendu. Le vérificateur réel n'a pas été lancé.
- Phase 5 : sur cette branche, lint, typecheck, `npm test` **193/193**, `test:i18n` (**97 pages**, 8 langues), build OVH avec Webpack, Vercel/browser smoke, `seo-check` (**82 URL**, zéro orpheline, HTML sous **524 288 octets**) et vérifications i18n passent. Turbopack local a échoué avec `Operation not permitted` sur une ouverture de port; le même build passe avec Webpack. CI GitHub de la PR v2 reste à faire.
- Phase 6 : textes préparés dans `docs/launch/` seulement; aucun compte tiers n'a été utilisé et rien n'a été publié.

## URL nouvelles ou modifiées

Les pages sont rendues sur le domaine nu HTTPS. Les chemins ci-dessous sont les URL canoniques; le sitemap les publie avec leurs hreflang.

### Outils locaux — 32 URL nouvelles

| Langue | MP3 | Compression | Coupe | GIF |
|---|---|---|---|---|
| EN | `/video-to-mp3` | `/compress-video` | `/trim-video` | `/video-to-gif` |
| FR | `/fr/convertir-video-en-mp3` | `/fr/compresser-video` | `/fr/couper-video` | `/fr/video-en-gif` |
| ES | `/es/convertir-video-a-mp3` | `/es/comprimir-video` | `/es/cortar-video` | `/es/video-a-gif` |
| PT-BR | `/pt/converter-video-para-mp3` | `/pt/comprimir-video` | `/pt/cortar-video` | `/pt/video-para-gif` |
| ID | `/id/konversi-video-ke-mp3` | `/id/kompres-video` | `/id/potong-video` | `/id/video-ke-gif` |
| DE | `/de/video-in-mp3-umwandeln` | `/de/video-komprimieren` | `/de/video-schneiden` | `/de/video-in-gif` |
| IT | `/it/convertire-video-in-mp3` | `/it/comprimere-video` | `/it/tagliare-video` | `/it/video-in-gif` |
| AR | `/ar/tahwil-video-ila-mp3` | `/ar/daght-video` | `/ar/qass-video` | `/ar/video-ila-gif` |

### Pages TikTok MP4/MP3 — 12 URL nouvelles

| Langue | MP4 | MP3 |
|---|---|---|
| ES | `/es/descargar-video-tiktok` | `/es/tiktok-a-mp3` |
| PT-BR | `/pt/baixar-video-tiktok` | `/pt/tiktok-para-mp3` |
| ID | `/id/download-video-tiktok` | `/id/tiktok-ke-mp3` |
| DE | `/de/tiktok-video-herunterladen` | `/de/tiktok-zu-mp3` |
| IT | `/it/scaricare-video-tiktok` | `/it/tiktok-in-mp3` |
| AR | `/ar/tahmil-video-tiktok` | `/ar/tiktok-mp3` |

Les versions EN/FR existantes restent `/tiktok-video-downloader`, `/tiktok-to-mp3`, `/fr/telecharger-video-tiktok` et `/fr/tiktok-en-mp3`. Les huit accueils modifiés sont `/`, `/fr/`, `/es/`, `/pt/`, `/id/`, `/de/`, `/it/`, `/ar/`.

### Blog — 6 URL nouvelles et indexation corrigée

- EN : `/blog/why-cant-i-save-tiktok`, `/blog/save-tiktok-sound-mp3`, `/blog/save-tiktok-phone-gallery`.
- FR : `/fr/guides/pourquoi-impossible-enregistrer-tiktok`, `/fr/guides/recuperer-son-tiktok-mp3`, `/fr/guides/enregistrer-tiktok-galerie-iphone-android`.
- `/blog` et les articles déjà présents ont perdu le `noindex`; `/fr/guides` est un index de contenu. Le fichier `SEO-CHANGES.md` conserve l'inventaire étendu des URL historiques indexables.
- Les dix articles anglais déjà publiés et désormais indexables : `/blog/720p-1080p-4k`, `/blog/backup-your-videos`, `/blog/bitrate-vs-resolution`, `/blog/h264-h265-av1`, `/blog/mp3-vs-m4a`, `/blog/mp4-vs-webm`, `/blog/reduce-video-size`, `/blog/video-download-fails`, `/blog/video-format-smartphone`, `/blog/video-to-audio`.

### Candidats privés — non publiés

La PR #30 contient 64 lignes de catalogue Facebook/Reddit/Vimeo/Dailymotion (MP4 et MP3, 8 langues chacune), mais aucun chemin public correspondant n'est généré. Les pages Instagram/X déjà préparées restent également fermées. Elles ne sont pas incluses dans les URL publiques ci-dessus.

## Capacité, performances et expérience réelle

La configuration serveur qui reste après le revert conserve les plafonds actuels, dont la limite globale de 100 téléchargements par jour; les variables, réservations, métriques et réglages de file de #26 ne sont pas présents ni actifs sur `main`. Aucun banc de charge VPS n'a été lancé. Il serait inexact d'annoncer une capacité confirmée à plusieurs centaines d'usagers par jour.

Pour les convertisseurs, les tests isolés couvrent des fichiers générés et des parcours Chromium/WebKit; les sorties et les écritures OPFS sont vérifiées. L'OPFS et le sélecteur de fichier du système ne sont pas validés sur téléphone physique. L'ouverture dans Photos, Galerie ou WhatsApp, Safari 26 matériel, Android/Chrome matériel, HEVC/HDR de caméra, permissions réelles et quotas de stockage mobiles restent à tester. Les limites de l'outil sont des bornes applicatives prudentes, pas une garantie de capacité matérielle universelle.

Les mesures LCP/CLS/TBT et taille JS comparatives sont conservées dans `TOOLS-CHANGES.md` et les rapports d'UX de la PR #27. Le JS initial documenté pour les outils locaux augmente de 2,36 % gzip (sous le seuil de 10 %); les pages de contenu ne chargent le moteur qu'après sélection du fichier. Pas de Lighthouse sur téléphone matériel.

## Actions restant au propriétaire

1. **VPS — 15–30 min d'inspection admin, puis fenêtre de changement** : examiner l'espace de `/var/lib/vidfetch-deploy/ci-incoming` (le transfert CI a signalé une limite de 700 Mio), conserver les preuves utiles, puis libérer de l'espace selon la politique opérateur. Ne pas supprimer à l'aveugle les archives/release. Vérifier `promote.py status` et le garde avant de rétablir tout déploiement. #28 est documentaire; le frontend actuellement servi reste sain.
2. **Capacité v2 — 30–60 min de revue admin + fenêtre de changement** : relire la PR non fusionnée `feat/capacity-v2`, vérifier son CI et son test systemd, fusionner seulement après les critères habituels, puis suivre `docs/VIDFETCH-CAPACITE-MISE-EN-PROD.md` pour installer les bundles avec sauvegarde/rollback. Ne pas annoncer de hausse de capacité avant mesure VPS.
3. **Capacité VPS — 1–2 h en heures creuses** : exécuter le banc isolé décrit dans `docs/VIDFETCH-CAPACITE.md`, surveiller RAM et erreurs, configurer les quotas seulement après mesure, et activer un canal d'alerte HTTPS administré.
4. **Téléphones — 1–2 h par modèle** : suivre le protocole de `TOOLS-CHANGES.md` sur iPhone Safari 26 et Android Chrome avec vidéos caméra 30 s, 2 min et 5 min en 1080p/4K, dont HEVC iPhone; vérifier Photos/Galerie/WhatsApp.
5. **Relecture native — variable** : faire relire en priorité arabe, indonésien et portugais les phrases signalées dans `docs/RELECTURE-NATIVE.md` et `TOOLS-CHANGES.md`.
6. **Instagram/X — selon fourniture des médias** : fournir uniquement des liens autorisés dans `operator/authorized-links.txt`, puis suivre `docs/PUBLISH-INSTAGRAM-X.md`. Les gates restent fermées jusque-là.
7. **Cloudflare — 5–10 min après un déploiement réussi** : purger les pages modifiées, le sitemap et les assets; aucun accès API n'était disponible.
8. **Search Console — 10–20 min après le déploiement des pages concernées** : inspecter les nouvelles URL, soumettre `https://vidfetch.app/sitemap.xml` et demander l'indexation prioritaire des 32 outils locaux et des 12 pages TikTok ajoutées. Aucun compte GSC n'était accessible.
9. **Lancement — selon le calendrier du propriétaire** : publier manuellement les brouillons dans `docs/launch/` avec les comptes officiels.

## Revue critique et décisions

- Le garde d'intégrité des bundles moteur/passerelle est une vraie condition de déploiement, pas un échec à contourner. Aucun fichier protégé, secret, compte de plateforme, configuration active Caddy ou Cloudflare n'a été modifié.
- La vérification Instagram/X n'a pas été exécutée faute de lien autorisé disponible; les gates restent fermées. Vague 2 est du contenu de préparation interne et ne prétend à aucun support.
- Aucun changement YouTube n'a été réalisé; les routes restent bloquées.
- Les déploiements #31, #32, #33 et #30 ont réussi; l'unique échec postérieur est le transfert #28 pour dépassement de stockage, sans activation ni rollback. Il faut un accès admin pour examiner l'espace d'upload du VPS avant toute nouvelle tentative de transfert.
