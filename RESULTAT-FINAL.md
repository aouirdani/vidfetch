# Résultat final — mission VidFetch

État établi le 1 novembre 2026 à partir du dépôt, des builds locaux et des statuts GitHub disponibles. Les pourcentages ci-dessous mesurent la réalisation technique du périmètre demandé, pas une probabilité de succès commercial.

## Architecture

Le site est une application Next.js App Router rendue côté serveur/statique. Les pages localisées passent par le registre `src/lib/site-pages.ts`, les textes sont en JSON et les pages plateformes sont générées depuis `content/platforms/catalogue.json` avec des gates éditoriales. Les outils locaux utilisent des workers auto-hébergés. Le backend et la passerelle de téléchargement sont des composants OVH séparés, protégés du déploiement frontend par `deploy/ovh/ci/promote.py`. Le trafic public passe par Caddy et Cloudflare. Le workflow GitHub construit et vérifie une archive frontend; les changements des moteurs exigent l'outil d'administration serveur.

## Les six piliers

| Pilier | Avant | État atteint | Preuve / réserve |
|---|---:|---:|---|
| Plateformes | TikTok disponible; Instagram/X annoncés sans garantie | **55 %** | TikTok conservé; Instagram/X et 4 plateformes candidates demeurent verrouillés. Aucun contournement ni test de plateforme sans média autorisé. Voir PR [#30](https://github.com/aouirdani/vidfetch/pull/30). |
| Formats | TikTok MP4/MP3 | **90 %** | MP3/M4A, compression, coupe et GIF locaux sont inclus dans les 32 pages de la PR #24 fusionnée. Sorties et confidentialité contrôlées avec fixtures; compatibilité réelle des téléphones non certifiée. |
| Capacité | Quotas et concurrence fixes; pas de mesure | **45 %** | Variables, réservation, file, métriques anonymes et banc isolé préparés dans PR #26. Pas d'application serveur ni de mesure VPS : impossible de promettre plusieurs centaines d'usagers/jour. |
| UI/UX | Parcours initial | **75 %** | Navigation mobile et captures/audit dans PR [#27](https://github.com/aouirdani/vidfetch/pull/27), build vert. PR non fusionnée à cause du verrou de déploiement. |
| SEO | Blog exclu, peu de pages localisées | **90 %** | Blog indexable, contenus TikTok dans 8 langues, outils locaux et contrôle SEO. PR #29 durcit encore le CI; vérifications locales passent, CI GitHub en cours. Aucun chiffre d'impressions n'est garanti. |
| Exploitation | Déploiement frontend automatique | **55 %** | CI, tests de fumée, documentation de capacité, kit de lancement et procédure de vérification ajoutés. Le déploiement des releases contenant moteur/passerelle est bloqué par le garde de promotion; pas d'accès SSH/sudo pour le résoudre. |

Les pourcentages ne s'additionnent pas et ne représentent pas un score du site. Ils indiquent le niveau de réalisation par rapport au périmètre de chaque pilier.

## État des changements et déploiement

- PR #24 (`feat/local-tools`) a été fusionnée et déployée. Elle comprend 32 routes d'outils locaux, l'OPFS, les plafonds prudents et les workers. Les mesures de laboratoire et l'analyse des budgets sont dans `TOOLS-CHANGES.md`, `docs/LOCAL-TOOLS-MEMORY.md` et `docs/LOCAL-TOOLS-OPFS-MEMORY.json`.
- PR #26 (`feat/capacity`) a été fusionnée en `a906a4969fba1dc3ecea6a0797bd0b27998856f1`, mais le run de déploiement `41334481660` a refusé l'archive : « Engine/gateway artifact changed; separate administrator review required ». La santé publique observée indiquait encore la release précédente `3a4f929a7c35b4fe416bf0ec540880c9ed7ffbb9`. Aucun changement backend n'a été promu. L'accès SSH non interactif est refusé; aucune commande sudo serveur n'a été exécutée.
- PR #27 (UI/UX) est ouverte; son build CI a réussi. PR #28 (kit de lancement) est ouverte; CI était en cours à la dernière consultation. PR #29 (SEO/dette technique) et PR #30 (plateformes candidates) sont ouvertes; leurs checks étaient en cours. **Aucune de ces trois PR n'a été fusionnée.**
- Aucune PR ne doit être fusionnée tant que le garde de déploiement moteur/passerelle n'est pas traité par l'administrateur; une fusion déclencherait un déploiement frontend qui pourrait à nouveau échouer. Aucun accès Cloudflare ou Search Console n'est configuré.

## Résultats de validation disponibles

- Phase 1 : rapports de CI indiqués dans `TOOLS-CHANGES.md`; builds, lint, typage, tests des outils et du backend documentés. Profils Playwright Chromium/WebKit et données de mémoire disponibles; aucun iPhone ou téléphone Android matériel testé.
- Phase 2 : banc synthétique local **7/7**, pic observé autour de **85,6 Mio RSS** pour sa fixture; ce résultat n'est ni un test VPS ni une projection d'utilisateurs quotidiens. Réglages de production non appliqués.
- Phase 3 : PR #27 build réussi. Les captures avant/après et mesures sont dans `docs/ux/` de cette branche; tests sur dimensions Playwright, pas sur appareils physiques.
- Phase 4 : dans `feat/platform-audit`, `npm run lint`, `npm run typecheck`, `npm test` **192/192**, `npm run test:i18n` (**97 pages**, 8 langues) passent. Les candidats n'apparaissent ni dans le sitemap ni dans le rendu. Le vérificateur réel n'a pas été lancé.
- Phase 5 : dans `feat/seo-debt`, `lint`, `typecheck`, `npm test` **192/192**, `test:i18n` (**97 pages**, 8 langues) et `check:release` passent. Le build OVH, `test:vercel -- --browser`, smoke SSR et `seo-check` (**82 URL**, zéro orpheline, HTML maximum **200 290 octets**) sont documentés comme réussis. La version finale de cette branche attend ses checks GitHub.
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

La configuration serveur mesurée dans le code conserve ses valeurs par défaut actuelles : maximum 100 opérations et 4 Gio/jour au niveau service, 8 opérations et 1 Gio par identité/IP selon la règle existante, une conversion simultanée et une file limitée. La PR de capacité ajoute des réglages et de la télémétrie, mais ils ne sont pas actifs en production. Il serait inexact d'annoncer une capacité confirmée à plusieurs centaines d'usagers par jour.

Pour les convertisseurs, les tests isolés couvrent des fichiers générés et des parcours Chromium/WebKit; les sorties et les écritures OPFS sont vérifiées. L'OPFS et le sélecteur de fichier du système ne sont pas validés sur téléphone physique. L'ouverture dans Photos, Galerie ou WhatsApp, Safari 26 matériel, Android/Chrome matériel, HEVC/HDR de caméra, permissions réelles et quotas de stockage mobiles restent à tester. Les limites de l'outil sont des bornes applicatives prudentes, pas une garantie de capacité matérielle universelle.

Les mesures LCP/CLS/TBT et taille JS comparatives sont conservées dans `TOOLS-CHANGES.md` et les rapports d'UX de la PR #27. Le JS initial documenté pour les outils locaux augmente de 2,36 % gzip (sous le seuil de 10 %); les pages de contenu ne chargent le moteur qu'après sélection du fichier. Pas de Lighthouse sur téléphone matériel.

## Actions restant au propriétaire

1. **Administrateur OVH — environ 30–60 min, selon l'audit** : examiner l'archive de capacité refusée, les diffs protégés et les scripts versionnés; déployer moteur/passerelle avec retour arrière validé, puis exécuter `sudo /usr/local/libexec/vidfetch-ci/promote.py status`. Ne pas relancer « Re-run all jobs » sur l'ancien artefact; créer un nouveau commit si un nouvel artefact est nécessaire. Sans cette étape, ne pas fusionner les PR frontend restantes.
2. **Capacité VPS — 1–2 h en heures creuses** : exécuter le banc isolé décrit dans `docs/VIDFETCH-CAPACITE.md`, surveiller RAM et erreurs, choisir le profil normal réellement mesuré, configurer le fichier d'environnement, redémarrer avec retour arrière et vérifier le statut. Activer l'alerte avec un canal HTTPS administré.
3. **Téléphones — 1–2 h par modèle** : suivre le protocole de `TOOLS-CHANGES.md` sur iPhone Safari 26 et Android Chrome avec vidéos caméra 30 s, 2 min et 5 min en 1080p/4K, dont HEVC iPhone; vérifier sortie dans Photos/Galerie/WhatsApp et noter temps, mémoire/espace et erreurs.
4. **Relecture native — variable** : faire relire en priorité arabe et indonésien, puis portugais, les phrases signalées dans `docs/RELECTURE-NATIVE.md` et `TOOLS-CHANGES.md` avant de considérer le contenu final.
5. **Instagram/X — aucun délai estimable avant fourniture des médias** : placer uniquement des liens dont les droits sont établis dans `operator/authorized-links.txt`, puis suivre `docs/PUBLISH-INSTAGRAM-X.md`. Ne pas ouvrir de gate sur une simple détection ou une erreur évitée.
6. **Cloudflare — 5–10 min après un déploiement réussi** : purger les pages modifiées, le sitemap et les assets locaux; aucun accès API n'était disponible dans cette mission.
7. **Search Console — 10–20 min après déploiement** : inspecter les URL des nouveaux outils et articles, soumettre `https://vidfetch.app/sitemap.xml` et demander l'indexation prioritaire des 32 outils locaux puis des 12 pages TikTok ajoutées. Aucun compte GSC n'était accessible.
8. **Lancement — selon le calendrier du propriétaire** : publier manuellement les éléments préparés dans `docs/launch/` avec les comptes officiels. Rien n'a été diffusé au nom du propriétaire.

## Revue critique et décisions

- Le garde d'intégrité des bundles moteur/passerelle est une vraie condition de déploiement, pas un échec à contourner. Aucun fichier protégé, secret, compte de plateforme, configuration active Caddy ou Cloudflare n'a été modifié.
- La vérification Instagram/X n'a pas été exécutée faute de lien autorisé disponible; les gates restent fermées. Vague 2 est du contenu de préparation interne et ne prétend à aucun support.
- Aucun changement YouTube n'a été réalisé; les routes restent bloquées.
- Les checks de CI #28–#30 étaient encore en cours à la dernière interrogation. Aucune fusion automatique des PR restées ouvertes n'a été effectuée.
