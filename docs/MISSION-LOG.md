# Journal de mission VidFetch

Date affichée en Europe/Paris. Les commits de la branche de travail ne deviennent pas publics avant la procédure de revue prévue pour chaque phase.

## 2026-11-01 — Revert capacité déployé

- PR #31 `revert: capacity until admin session` fusionnée en `31f51121735aacbfee99c29dadee1440b693b734`. Le commit `a906a4969fba1dc3ecea6a0797bd0b27998856f1` a été annulé par un commit revert normal, sans réécriture de l'historique.
- Vérification avant fusion : l'artefact de production CI `3a4f929a7c35b4fe416bf0ec540880c9ed7ffbb9` (run `41298579682`) et l'archive CI de la PR #31 (run `41339925495`, release de merge `fc420e678d73171af8d581adfc098e850c904b0d`) ont exactement les mêmes hashes : moteur `fa0d3d4e15a5a45ca0deb2b35e7ba03adc95c31b87500378068121f291c42287`; gateway `0fa1404530c272b76aaec9aee18125660e8561c744e4ccc1fbb9c7dbee9850e5`.
- CI complète PR #31 réussie (lint, typage, tests Node/backend/gateway/charge/Python, build, Caddy, SEO, i18n et tests des outils). Le push de merge `41343004391` et le job `deploy` ont réussi, sans retour arrière.
- Vérification publique après promotion : `curl https://vidfetch.app/api/health` retourne `release=31f51121735aacbfee99c29dadee1440b693b734`, `frontend.ready=true`, `downloads.available=true`. Le status root sur VPS n'a pas été consulté; le workflow de promotion et l'endpoint public confirment le commit actif.
- Le code de capacité de #26 est retiré de `main`; aucune hausse de quota ni configuration de capacité n'a été appliquée.

## 2026-11-01 — Correction de parité de release après #29

- PR #29 a fusionné en `10e64aa37740165edb88951891cda7057c177661`; sa CI build était verte, mais le job deploy `41348552488` a été refusé par `promote.py` avec `Engine/gateway artifact changed; separate administrator review required`. La production reste sur `31f51121735aacbfee99c29dadee1440b693b734`; `/api/health` confirme que la release n'a pas changé. Premier refus depuis le revert, aucun retour arrière.
- Comparaison des archives CI: le moteur correspond à la production (`fa0d3d4e…`), la passerelle diffère (`a0828b4e…` vs `0fa14045…`). Le diff du bundle correspond aux nouvelles chaînes `faq6a` des huit dictionnaires; `backend/gateway/helper.ts` importe ces messages dans le bundle de la passerelle. La copie localisée des limites reste sur les pages TikTok du catalogue. La PR corrective #32 restaure uniquement ces huit chaînes d'accueil à leur texte précédent, générique et exact, pour préserver la parité moteur/passerelle sans toucher aux moteurs ni au garde.
- PR #32 fusionnée en `a095f61c929e5dc7e06dcb97e405e7bde60e94da`; CI complète [run 41350562445](https://github.com/aouirdani/vidfetch/actions/runs/41350562445) et déploiement [run 41352178106](https://github.com/aouirdani/vidfetch/actions/runs/41352178106) verts. Archive PR #32 comparée avant fusion à la release active: moteur `fa0d3d4e15a5a45ca0deb2b35e7ba03adc95c31b87500378068121f291c42287`, passerelle `0fa1404530c272b76aaec9aee18125660e8561c744e4ccc1fbb9c7dbee9850e5`, hashes identiques.
- `curl https://vidfetch.app/api/health` confirme la release `a095f61c929e5dc7e06dcb97e405e7bde60e94da`. Échantillon de production: `/`, `/id/`, `/tiktok-video-downloader`, `/fr/convertir-video-en-mp3` et `/blog` répondent 200 et `index, follow`; canonical absolu auto-référent et hreflang présents (17 sur les groupes complets, 19 sur le groupe outils). `/sitemap.xml` répond 200 et contient les liens hreflang.
- Aucun accès SSH/root ou secret utilisé.

## 2026-11-01 — Correction de parité après le déploiement de #27

- PR #27 a fusionné en `9b7307b054150c7decec66f607f5f54b8d342719`; CI build verte. Le déploiement `41356141209` a été refusé par la garde `Engine/gateway artifact changed; separate administrator review required`. `/api/health` confirme que la production reste sur `a095f61c929e5dc7e06dcb97e405e7bde60e94da`; aucune release n'a été promue ni rollbackée.
- L'archive CI confirme moteur identique (`fa0d3d4e15a5a45ca0deb2b35e7ba03adc95c31b87500378068121f291c42287`) mais passerelle modifiée (`b5ff75d9c96684d002b75cfe153f527eac695a8a773a36757084480ec48aa0d1` au lieu de `0fa1404530c272b76aaec9aee18125660e8561c744e4ccc1fbb9c7dbee9850e5`). Le diff de passerelle montre uniquement le nouveau champ `menuLabel` dans les huit JSON; `backend/gateway/helper.ts` embarque ces dictionnaires.
- La PR corrective déplace les huit libellés de menu vers `src/i18n/navigation-labels.ts`, importé seulement par le frontend, et restaure les dictionnaires partagés. Aucun moteur, quota, endpoint ni garde de promotion ne change. Vérifier l'égalité exacte des hashes sur l'archive CI corrective avant fusion, puis contrôler la production avant de reprendre #30.

## 2026-11-01 — Suite des PR de mission

- PR #29 fusionnée en `10e64aa`; son premier déploiement a été refusé à cause de la FAQ partagée incluse au bundle passerelle. PR corrective #32 fusionnée et déployée en `a095f61c`, parité artefact exacte vérifiée.
- Ordre de travail repris : #27, #30, #28 après la correction corrective de déploiement. Aucun retour arrière de production; un refus de garde a été diagnostiqué et résolu.
- Phase 3 / PR #27 : rebasée sur `a095f61c`; les conflits de journal et de workflow ont été résolus. Le premier CI post-rebase a révélé FFmpeg installé après `test:i18n`; ordre corrigé dans `81f98ad`, puis rebase sur #32. Le CI complet post-correction et post-rebase `41352202260` est vert. Revue critique prête avant fusion.
- Phase 4 / PR #30 : 64 entrées candidates Facebook, Reddit, Vimeo, Dailymotion, toutes non publiées et sans gates; aucune URL au sitemap. Pas de liens opérateur autorisés, aucune vérification de plateforme réelle.
- Phase 5 / PR #29 : CI complète PR verte [run 41345482406](https://github.com/aouirdani/vidfetch/actions/runs/41345482406); deploy de son commit initial refusé par le garde, réparé par #32. Les limites détaillées restent sur les pages outils TikTok; la FAQ générique partagée conserve son ancien texte pour garder le bundle protégé identique.
- Phase 6 / PR #28 : contenus de lancement préparés sous `docs/launch/`, non publiés. CI à revérifier après rebase.

## 2026-11-02 — Parité du menu et déploiement de #27

- PR corrective #33 fusionnée en `0d96be8ac5e20612b49c762b4d08371ca2b667d2`. Son CI complet [run 41357995688](https://github.com/aouirdani/vidfetch/actions/runs/41357995688) est vert. L'archive de release exacte de la CI a été comparée à la release production `3a4f929`: moteur `fa0d3d4e15a5a45ca0deb2b35e7ba03adc95c31b87500378068121f291c42287`, passerelle `0fa1404530c272b76aaec9aee18125660e8561c744e4ccc1fbb9c7dbee9850e5`; les deux sont identiques. Les libellés du menu mobile résident maintenant dans `src/i18n/navigation-labels.ts`, hors dictionnaires partagés du gateway.
- Le déploiement du merge commit, [run 41359508528](https://github.com/aouirdani/vidfetch/actions/runs/41359508528), a réussi sans retour arrière. `curl https://vidfetch.app/api/health` retourne `release=0d96be8ac5e20612b49c762b4d08371ca2b667d2`, `frontend.ready=true`, `downloads.available=true`.
- Contrôle public par `curl`: `/`, `/tiktok-video-downloader`, `/ar/tahmil-video-tiktok` et `/blog` répondent 200; `/id/` répond à une seule 301 vers `/id`, puis 200. Les pages testées contiennent `meta robots=index, follow`, canonical absolu auto-référent, HTML lang correct et hreflang réciproques (vérifiés sur la page `/id`). Aucun en-tête `X-Robots-Tag` restrictif observé. L'arabe sert `lang=ar` et `dir=rtl`.
- Le `promote.py status` via SSH n'a pas été exécuté : l'accès SSH/root n'est pas configuré dans cette session. L'endpoint de santé public et le job de promotion réussi confirment cependant le commit actif; aucune clé ni secret n'a été consulté.
- PR #30 `feat/platform-audit` rebasée sur `0d96be8` et CI complète relancée [run 41359529906](https://github.com/aouirdani/vidfetch/actions/runs/41359529906), verte. Revue critique: uniquement catalogue de candidats verrouillés, documentation, parsing/tests et journal; aucun moteur, passerelle, quota ni contenu rendu n'est ajouté/modifié par ces candidats. Les 64 routes restent `published:false`, sans gates, sans sitemap ni liens. Aucun lien de média autorisé fourni; aucun test plateforme réelle n'a été effectué. Revue/contrôles finaux requis avant fusion.

## 2026-11-02 — Déploiement de #30

- PR #30 fusionnée en `6bc01461736d89522d7585de5c3bcf42f03c210a`; CI de production [run 41416541552](https://github.com/aouirdani/vidfetch/actions/runs/41416541552) et son job `deploy` réussis, aucun rollback.
- `curl https://vidfetch.app/api/health` annonce exactement `release=6bc01461736d89522d7585de5c3bcf42f03c210a`, `frontend.ready=true`, `downloads.available=true`.
- Contrôle public: accueil 200, `index, follow`, canonical absolu, hreflang 8 langues + x-default; sitemap 200; les URL candidates `/facebook-video-downloader` et `/reddit-video-mp3` répondent 404 et sont absentes du sitemap. Aucun `X-Robots-Tag` restrictif observé. Aucun test de plateforme réelle effectué.
- Les textes de campagne restent des brouillons; aucun message n'a été publié. Aucun accès SSH/root, Cloudflare API ou Search Console utilisé.

## 2026-11-01 — Préparation du revert capacité

- PR #31 `revert: capacity until admin session`, branche `revert/capacity-until-admin-session`, commit initial `303def85819016d40eeab77472855a0f85613ec5`; revert Git normal de `a906a4969fba1dc3ecea6a0797bd0b27998856f1`, sans réécriture d'historique.
- Artefact officiel CI de la release active `3a4f929a7c35b4fe416bf0ec540880c9ed7ffbb9`, workflow `41298579682`, téléchargé depuis GitHub. Empreintes manifestes de référence: moteur OVH `fa0d3d4e15a5a45ca0deb2b35e7ba03adc95c31b87500378068121f291c42287`; passerelle `0fa1404530c272b76aaec9aee18125660e8561c744e4ccc1fbb9c7dbee9850e5`.
- Production avant revert: `curl https://vidfetch.app/api/health` renvoie `ok`, `frontend.ready=true`, release `3a4f929a7c35b4fe416bf0ec540880c9ed7ffbb9`, downloads disponibles.
- Décision: attendre l'archive exacte construite par le run CI de la PR et comparer les deux hashes au manifeste de production avant fusion. Aucun accès root/SSH utilisé.

## 2026-11-01 — Phase 1, convertisseurs locaux

- Reprise sur `feat/local-tools`, commit de synchronisation `b21d2786`; PR #24 est ouverte, en brouillon, et aucun changement n’a été poussé sur `main`.
- Contrôles du commit : CI GitHub verte ([run 41293587862](https://github.com/aouirdani/vidfetch/actions/runs/41293587862)); build OVH et build Next standard, lint, typage, 190 tests unitaires, backend (17), passerelle (3), charge (5), SEO 82 URL, i18n 97 pages, Caddy et conversions passent.
- Émulation ajoutée dans `scripts/local-tools/test-device-profiles.mjs`, résultat `docs/LOCAL-TOOLS-DEVICE-EMULATION.json`: Pixel 7/Chromium à CPU ×4 et 1,6 Mbit/s, iPhone 15/WebKit sans bridage CPU supporté. Les quatre outils produisent des sorties vérifiées par ffprobe; aucune requête externe ni corps média n’est observé.
- Aucun téléphone physique, Safari 26 matériel, Android/Chrome matériel, HEVC/HDR, gestionnaire de téléchargement natif ou applications Photos/Galerie/WhatsApp disponibles. Les plafonds mobiles sont encore des bornes applicatives, pas des garanties de mémoire physique.
- `npm run test:vercel` a été exécuté après le build correspondant : les contrôles de santé/API passent, puis son ancienne fixture attend `/youtube-video-downloader` en 200 alors que YouTube est volontairement verrouillé et la route renvoie 404. Le workflow OVH ne lance pas ce script. Aucun changement YouTube n’a été fait; réparation prévue en phase 5.
- Revue critique pré-fusion : GO sous les contrôles exécutés. Les 32 routes sont au registre/sitemap avec contenu SSR, tests d’indexation par Caddy; les outils s’exécutent uniquement sur fichiers choisis, moteur paresseux, OPFS/file streaming et tests sans corps réseau; pas de changement d’API serveur, des deux moteurs protégés, des pages TikTok ou du comportement YouTube. Diff relu sur limites, codecs, droits, dépendances épinglées/licences, nettoyage OPFS, sitemap/hreflang, erreurs traduites et absence de pages orphelines. Performance de laboratoire reste sous les budgets documentés. Les validations physiques restent humaines, sans bloquer les parcours d’émulation demandés.
- CI finale du commit `eedaadb9` : [run 41295843330](https://github.com/aouirdani/vidfetch/actions/runs/41295843330), tous les jobs réussis. PR #24 `CLEAN`, toujours en brouillon à ce point du journal.
- Exception indépendante de la CI : `npm run test:vercel` échoue sur sa liste historique qui exige YouTube en 200. Réparation prévue en phase 5, sans rendre cette plateforme accessible.
- Décision : préparer la PR #24 à la fusion après cette CI; n’effectuer aucune poussée directe sur `main`. Vérification de la promotion et du statut actif du serveur restent après fusion.
- Après fusion de la PR #24 : squash commit `3a4f929a7c35b4fe416bf0ec540880c9ed7ffbb9`, workflow [41298579682](https://github.com/aouirdani/vidfetch/actions/runs/41298579682) build et déploiement verts. `/api/health` en production annonce exactement cette release; un échantillon des pages outils, accueil, blog, sitemap et 404 est cohérent. `seo-check` distant vérifie les 82 URL; son dernier audit des liens échoue seulement sur une URL de protection e-mail Cloudflare ajoutée à la volée (`/cdn-cgi/l/email-protection`), à corriger en phase 5.
- Vérification d'accès opérateur : la tentative SSH non interactive à l'OVH est refusée (`Permission denied (publickey,password)`). Les secrets SSH du workflow n'ont pas été consultés. Aucun jeton API Cloudflare ni secret GSC n'est configuré ; purge CDN et Search Console restent aux actions finales du propriétaire.

## 2026-11-01 — Phase 2, capacité (préparation)

- Branche `feat/capacity`, basée sur la release frontend active `3a4f929a`. Aucune modification des fichiers protégés générés `backend/vidfetch-ovh.cjs` et `backend/vidfetch-gateway.cjs`.
- La taille du format annoncée par le frontend sert désormais à calculer une réservation initiale (10 %, marge bornée à 1–16 Mio); l'annonce n'est pas fiable. La passerelle augmente atomiquement cette réserve pendant le flux et bloque les octets excédentaires quand les plafonds IP/identité ou globaux seraient atteints. L'échec moteur libère les octets non utilisés. File configurable jusqu'à 32 entrées/10 min, concurrence moteur configurable avec défaut 1, quotas/rates configurables avec valeurs par défaut inchangées.
- Compteurs quotidiens anonymes ajoutés et rapport/alertes préparés à 80 % du quota, >5 % d'erreur (à partir de 20 requêtes), ou 3 indisponibilités. Rapport sans URL/IP; webhook HTTPS optionnel documenté sans secret.
- Banc local `npm run load:isolated`: fixture MP4/AAC générée via ffmpeg, relayée par serveur synthétique sur loopback; stop à 512 Mio de RAM libre. Dernière mesure : fixture 396 790 octets, clients 1/2/4/8, 1 moteur simultané, pic RSS 85,4 Mio. Ce n'est pas une mesure VPS ni une projection de capacité journalière.
- Vérification locale : build complet OVH (Webpack), lint, typecheck, 191/191 tests Node, backend 17/17, passerelle 5/5, banc synthétique 7/7 (pic RSS 85,6 Mio), tests OVH Python 81 (15 ignorés faute de Docker ou Linux), `seo-check` 82 URL et `test:i18n` (97 pages / 8 langues / SSR et transferts) verts. `check:release` trouve 0 problème. Au premier lancement simultané, le garde RAM du banc s'est arrêté comme prévu; le lancement isolé a passé.
- Bloqué uniquement pour l'application sur VPS : pas d'accès SSH/sudo. Ne pas annoncer une capacité « centaines/jour » : quotas effectifs actuels (100 global/jour, 4 Gio global/jour, 8 opérations/identité/jour et concurrence 1) restent appliqués. Poursuivre les phases suivantes, puis remettre au propriétaire les commandes et valeurs proposées après mesure serveur.
## 2026-11-01 — Phase 4, audit des plateformes candidates

- Préparation de candidats internes Facebook, Reddit, Vimeo et Dailymotion : 64 variantes catalogue (MP4 et MP3 × 8 langues), toutes `published: false` et trois gates à `false`. Le runtime refuse aussi ces plateformes car le parseur et les moteurs ne les déclarent pas compatibles; ouvrir les seules gates dans une copie de fixture ne crée donc aucune route.
- Ajout de `docs/PLATFORM-ELIGIBILITY.md` avec les liens/résumés des conditions officielles et les risques à examiner avant tout test/publication. Les pages candidates sont exclues du rendu, du maillage et du sitemap. YouTube n'a pas été modifié.
- Extension du vérificateur opérateur aux plateformes candidates; il ne contourne pas les protections et n'a pas été exécuté. Aucun fichier `operator/authorized-links.txt` disponible, donc Instagram/X restent verrouillés et l'absence de médias autorisés est consignée comme arrêt obligatoire de leur validation réelle.
- Validation après rebase sur le merge commit #33 `0d96be8`: CI complète [run 41398222743](https://github.com/aouirdani/vidfetch/actions/runs/41398222743) verte. L'archive a exactement les hashes moteur et passerelle de production. PR #30 fusionnée en `6bc01461736d89522d7585de5c3bcf42f03c210a`, déploiement et vérification de production à suivre.

## 2026-11-01 — Phase 6, kit de lancement préparé

- Création de brouillons distincts pour Product Hunt, Show HN, l'article technique du blog et son adaptation Dev.to, r/InternetIsBeautiful et AlternativeTo, sous `docs/launch/`.
- Les textes distinguent conversion locale de fichiers personnels et analyse serveur de liens TikTok, précisent les limites, le watermark incrusté et l'indisponibilité YouTube, et n'affichent ni avis ni statistiques. Instagram/X ne sont pas présentés comme vérifiés.
- Aucun message n'a été publié. Avant publication, confirmer que la release publique correspond à ces capacités et utiliser les comptes du propriétaire.

## 2026-11-02 — Interface v2, branche `feat/ui-v2`

- Réimplémentation des trois références dans les composants Next.js existants : jetons visuels, typographie locale, formulaires/résultats/cartes, navigation, vues d'accueil et plateformes, et scène décorative 3D en CSS. Aucun changement aux URL, textes SEO, JSON-LD, hreflang, logique API, moteurs ni fichiers `ENGINE_FILES`.
- Captures avant/après de 7 états en 3 dimensions (21 par lot), rapport de performance et base enregistrés sous `docs/ui-v2/`. Les polices latines pèsent 55 604 octets WOFF2 combinés; Noto Kufi Arabic (123 688 octets) n'est préchargée que sur `/ar`.
- Vérifications locales : lint, typecheck, `seo-check` (82 URL), `test:i18n` (97 pages / 8 langues), `npm test` (192/192) et `git diff --check` passent. Les captures parasites réécrites par le test i18n ont été restaurées.
- Lighthouse 12.8.2, build standalone OVH local, Chrome 156, mobile, trois passes médianes : Performance 96–97 sur pages latines, 92 en arabe; Accessibilité, Bonnes pratiques et SEO 100 partout; CLS 0; TBT 58–100 ms. Le LCP du H1 reste entre 2,64 s (latin) et 3,30 s (arabe), supérieur à la cible 1,8 s. Les assertions LHCI sont strictes et échoueront en conséquence. Budgets JS, CSS et polices passent.
- Le build a été fait avec Webpack car Turbopack ne démarre pas dans cet environnement (`EPERM` sur son socket interne). Aucun matériel iPhone/Android ni score PSI post-déploiement n'est accessible ici. La production n'a pas été modifiée.
- Revue des polices : désactiver le préchargement d'Onest pour ne précharger que Bricolage a produit sur une passe mobile CLS 0,171 et Performance 88. Le préchargement est rétabli pour préserver CLS 0 sur la configuration mesurée; la consigne de précharger uniquement la fonte du H1 reste à résoudre proprement.
- Décision : pas de fusion ni de déploiement tant que le LCP n'est pas réduit sous 1,8 s et que Performance arabe n'atteint pas 95. La CI Lighthouse constitue un garde-fou de régression et signale actuellement ces deux écarts; résultat complet à joindre à la PR pour correction ciblée.

## 2026-11-02 — PR #35, première correction polices et mesure

- Remplacement d'Onest et de la fonte arabe web par les piles système. Bricolage Grotesque 800 est servi en deux WOFF2 Latin/Latin-ext sous OFL, `font-display: optional`, via `next/font/local` avec fallback métrique; le lien de préchargement n'est rendu que hors `/ar`. Contrôle réseau Lighthouse : une fonte sur les pages latines, aucune sur l'arabe.
- À ce stade, Lighthouse CI et `scripts/ui-v2/assert-budgets.mjs` utilisaient les médianes des trois passes avec une limite baseline+150 et TBT≤100. Ces deux seuils ont ensuite été remplacés après acceptation du propriétaire (entrée suivante).
- Build OVH local, lint, typecheck, `seo-check` (82 URL), `test:i18n` (97 pages / 8 langues), tests Node (192/192) passent. Captures `docs/ui-v2/after/` régénérées.
- Lighthouse mobile médian : Performance 97–98; A11y/BP/SEO100; CLS0. À l'ancien seuil relatif, FR +160, ID +306, MP3 +155 et blog +157; TBT ID 115. CSS 12 913 B gzip (+2 629 B), JS 162 011 B, polices latines 32 340 B. Aucune scène 3D n'est candidate LCP.
- La CI de l'ancien commit a échoué à son assertion Lighthouse, selon l'ancien seuil. Aucune production n'a été modifiée. PSI production et appareil physique non testés.

## 2026-11-02 — PR #35, seuils finaux acceptés

- Le propriétaire a remplacé la comparaison LCP au baseline par LCP médian ≤2 500 ms et a relevé le TBT médian ≤200 ms; les autres assertions restent P≥95, A11y/BP/SEO=100 et CLS≤0,02. Les deux configurations (`.lighthouserc.cjs`, `scripts/ui-v2/assert-budgets.mjs`) appliquent ces limites aux médianes de trois passes.
- Diagnostic `/id/download-video-tiktok` : même JS première partie que les autres pages (162 011 B, chunks principaux 67 861 B et 64 658 B), aucune image, et même WOFF2 latin de 22 209 B. Le candidat LCP est le paragraphe descriptif. Les longues tâches observées viennent du chunk Next partagé (87–90 ms) et d’AdSense variable (55–108 ms); aucune optimisation spécifique ID à faible risque identifiée.
- Les 6 pages passent localement les nouveaux seuils, avec Performance 97–98, LCP 2 345–2 496 ms, CLS0 et TBT médian ≤115 ms. `assert-budgets` passe sur les 18 rapports. Build, lint, typecheck, `seo-check` (82), `test:i18n` (97) et `npm test` (192/192) sont verts.
- Commit de seuils/docs à pousser sur la PR #35; CI GitHub du nouveau commit à suivre. Pas de sortie de brouillon, fusion ou production avant CI verte et revue critique.

## 2026-11-02 — PR #35, vérification des seuils en CI

- Le commit `14c618d` a échoué sur Lighthouse CI parce que Lighthouse CLI refuse `preset: "mobile"`. Correctif poussé dans `8e17511` : `emulatedFormFactor: "mobile"`.
- Le run CI `41524693765` a ensuite passé lint, typecheck, tests Node/backend, tests OVH, build Linux standalone, Caddy, SEO et HTML serveur. Lighthouse a échoué sur le commit `8e17511`: P médian 89–90 sur cinq routes, LCP médian 2 549–2 694 ms sur les six routes, et TBT médian 314–338 ms sur cinq routes. `/video-to-mp3` n'a pas d'échec de P/TBT consigné, mais LCP 2 684 ms dépasse le seuil. Voir `docs/ui-v2/PERF.md`.
- Retrait du preset d'assertions `lighthouse:recommended` en cours pour ne garder que les catégories et métriques demandées; il ajoutait des exigences hors critères. Cela ne résout pas les dépassements de P/LCP/TBT observés.
- L'écart local/CI s'observe uniformément sur les routes et le chargement publicitaire du `<head>` est une piste, non une cause confirmée. Aucun changement publicitaire n'est appliqué sans traces plus précises.
- **NO-GO** : PR #35 reste en brouillon; aucune fusion ni production. Il faut d'abord confirmer les tâches bloquantes dans les traces LHR et obtenir une nouvelle CI entièrement verte.

## 2026-11-02 — PR #35, retrait AdSense et comparaison main/PR

- Selon les données Lighthouse communiquées par le propriétaire, la page `/video-to-mp3`, seule page sans AdSense, est la seule à passer le TBT. Retrait du `<script adsbygoogle>` du layout. Le meta `google-adsense-account` reste sur les mêmes pages éligibles `showsAds`; `public/ads.txt` est inchangé.
- Les huit textes `ADVERTISING_PRIVACY` disent maintenant qu'aucune publicité n'est actuellement affichée. `src/i18n/messages` n'a pas été modifié. Un chargeur qui attend une interaction/scroll et l'événement `load` est préparé, contrôlé par `ADSENSE_DEFERRED_LOADING_ENABLED = false`.
- La CI Lighthouse compare désormais, dans le même job Linux/Node 22, `main` et la PR sur les six mêmes URL et trois passes médianes. Elle contrôle Accessibilité/Bonnes pratiques/SEO à 100, CLS≤0,02, Performance PR≥90 et ≥main−2, LCP≤main+150ms, TBT≤main+50ms; le preset `lighthouse:recommended` est retiré.
- Validation locale : build OVH, lint, typecheck, `npm test` 192/192, `seo-check` 82 URL et `test:i18n` 97 pages vertes. Le comparateur a passé un fixture synthétique aux bornes exactes. Les mesures comparatives Linux de la nouvelle CI restent à obtenir; pas de sortie de brouillon, fusion ni production avant résultat vert et revue critique.
- Le run `41530076247` a bien construit `main`, mais Lighthouse a appliqué par erreur le plancher P≥90 à la référence historique (`/` médiane 89, `/fr` 87, `/id` 88, blog 89). Les pages MP3/AR n'ont pas échoué à ce premier garde. Le plancher a été déplacé exclusivement dans le comparateur PR; la nouvelle CI doit encore valider l'ensemble.
2026-11-02 — PR #35 comparative Lighthouse run 41533804636 built main and PR and completed both six-page, three-pass mobile collections. The custom comparator then failed before metrics evaluation because it searched for `lhr-*.json`; Lighthouse CI writes `*.report.json`. Updated both report-discovery sites to the actual LHCI naming convention and clarified `docs/ui-v2/PERF.md` with the relative main/PR budgets and failed-run cause. Awaiting a fresh full CI run; PR remains draft and unmerged.
2026-11-03 — Run 41538516075 passed tests/builds and produced comparable reports, then failed the intended budget: `/` LCP median PR 2,722 ms vs main 2,428 ms (+294 ms, limit +150 ms). Run 41542713148 provided all medians: Performance/CLS/TBT thresholds pass, but LCP regresses on `/` (1,820→2,676 ms), `/fr` (2,357→2,660), `/video-to-mp3` (1,962→2,753), `/ar` (1,959→2,604); `/id` and blog improve. Artifact retention initially missed the hidden report directories, so `include-hidden-files` is now enabled. PR remains draft pending LCP diagnosis and CI.
2026-11-03 — À la demande du propriétaire, suppression du build/compare `main` de Lighthouse sur PR #35. Les seuls contrôles Lighthouse bloquants sont Accessibilité/Bonnes pratiques/SEO=100 et CLS≤0,02 (médiane de 3 passes). Performance/LCP/TBT et budgets CSS/JS/polices/3D sont rapportés en avertissements ; les JSON sont conservés en artefact. Une seule CI complète doit passer avant sortie du brouillon et fusion. La mesure de référence PageSpeed Insights est laissée au propriétaire après déploiement.


## 2026-11-07 — Vague SEO 3, préparation

- Référence : audit OpenSEO du 06/11 (PR #37), 82 pages indexables, score brut 9/100 lié au lien email Cloudflare. Branche `feat/seo-wave-3`, base `cadebe3`.
- Trois guides TikTok adaptés en id, pt-BR et es ; même trio ajouté en de/it/ar pour proposer des guides dans la langue sur chacun des huit accueils. 18 nouvelles adaptations, slugs locaux et provenance des sources conservée ; 70 autres traductions restent en revue et inaccessibles. Inventaire attendu : 106 URL indexables, 34 articles et huit index de guides.
- Accueils : trois guides TikTok prioritaires et index local. Pages TikTok MP4/MP3 : trois guides pertinents dans la langue. Chaque nouvelle adaptation cite les deux outils TikTok locaux. Les guides FR pointent aussi vers le convertisseur local MP3, déjà présent parmi les outils de l’accueil FR.
- `/es/tiktok-a-mp3` : title/H1/intro et FAQ centrés sur le téléchargement audio, une vidéo par demande, 192 kbps, sans promesse de chanson complète ou de traitement par lots. `/fr/convertir-video-en-mp3` : title/H1 alignés, explication des étapes et du traitement sur appareil, M4A toujours disponible.
- Le lien d’abus conserve son mailto en HTML initial dans les huit langues, entouré de la directive Cloudflare `email_off`. Le libellé est échappé ; pas de dépendance au JavaScript pour obtenir l’adresse.
- OG : les sept balises étaient déjà présentes dans le HTML public. Calcul à partir du même ensemble que hreflang et contrôle explicite de toutes les versions, sans doublons.
- En-têtes applicatifs : HSTS (un an), SAMEORIGIN, Referrer-Policy et CSP Report-Only. Les sources Turnstile, workers blob, WebAssembly et service worker même origine sont prévues ; aucune CSP bloquante ajoutée.
- Validation à ce stade : lint, typecheck et 196/196 tests Node réussis ; contrôle de sortie sans secret réussi. Le build Turbopack local reste empêché par une ouverture de port interdite ; build OVH local Webpack et seo-check sur 106 URL réussis, sans orphelines ; contrôle Turbopack Linux à effectuer par la CI. Les huit langues passent sur 106 pages, avec 24 transferts simulés ; les outils locaux passent avec 26 sorties ffprobe et huit sorties OPFS. Les nouveaux guides portent la date de publication du 07/11, jour de cette livraison. PR #38 ouverte ; pas encore de fusion ni de déploiement pour cette vague.
- Après CI entièrement verte : revue du diff, fusion, contrôle de l’activation OVH et des 106 URL publiques ; audit OpenSEO avec rendu et proxy payants désactivés. Le bilan de production et son audit seront ajoutés au rapport, sans nouvel appel payant.


## 2026-11-07 — Vague SEO 3, complément contacts légaux

- PR #38 fusionnée après CI verte `42319792700` ; main `f092735` en cours de validation/déploiement (`42354097509`).
- Le contrôle HTTP public avant activation a confirmé trois autres ancres Cloudflare dans `/legal`, générées à partir des adresses textuelles legal/privacy/abuse. Le correctif du seul footer aurait laissé huit pages légales signalées.
- Même exclusion Cloudflare appliquée aux paragraphes contenant nos adresses publiques, avec échappement du texte et sans lien HTTP technique. Les tests couvrent les 24 paragraphes de contact des huit langues et l’échappement HTML. Aucun réglage Cloudflare ou serveur modifié. Validation et bilan public de ce complément à suivre.
- HTTP public après PR #38 : Cloudflare consomme les commentaires `email_off`, mais conserve bien le mailto en clair et ne génère plus d’ancre technique sur l’accueil. `seo-check` contrôle donc le lien final plutôt que la conservation des commentaires ; les tests du composant vérifient séparément le balisage envoyé à Cloudflare.


## 2026-11-07 — Pages de confiance et guides, PR 1 en préparation

- Plan PR #40 accepté avec revue : G17 TikTok 9:16 ; G25 remplacé par split video into parts, US/en 480/D14, adéquation 3. Rangs figés pour les deux lots de guides. Mots-clés des dix traductions France/fr vérifiés ; données nulles/absentes distinguées. Coût de ces appels : 0,12 USD sous deux budgets de 0,50 USD.
- Question groupée adressée au propriétaire avant la PR sur identité, pays, droit, lancement, auteur, relecture et délais. À ce stade sans réponse : 48 sources de confiance préparées, mais aucune publiée ; champs conservés et exclus des routes/menus/sitemap. Les guides à signature incomplète devront eux aussi rester non publiés.
- /legal et équivalents restent indexables ; résumé de confidentialité fondé sur le code, durées des journaux d’infrastructure laissées à compléter. CMP Google préparée et désactivée ; éléments AdSense protégés inchangés.
- Build local, lint, typecheck, tests du verrou/CMP et seo-check sur 106 URL réussis. Contrôles CI et production à suivre, aucun succès anticipé. SHA-256 moteur fa0d3d4e15a5a45ca0deb2b35e7ba03adc95c31b87500378068121f291c42287 et passerelle 0fa1404530c272b76aaec9aee18125660e8561c744e4ccc1fbb9c7dbee9850e5 identiques à l’archive publique 7a8da19.

- PR 1, correctif de performance : CI 42377588512 entièrement verte hors Lighthouse (FR 94, ID 94, AR 93 ; A11y/BP/SEO 100, CLS 0). Nouveau commit, aucun re-run : dictionnaire client limité aux 62 libellés interactifs au lieu des 159 champs ; textes complets de navigation/pages conservés côté serveur, aucun dictionnaire partagé modifié. Pied de page hors écran différé par la règle existante. Types des traducteurs d’erreurs/formats réduits sans changement de leur code émis. Bundles reconstruits et SHA-256 toujours égaux à la production. Seuil P95 maintenu.

- PR1, correction complémentaire : le run42409386772 valide tous les contrôles hors Lighthouse, avec médianes P94 EN/AR et P95 sur les quatre autres routes. Analyse des rapports : requêtes RSC de préchargement et travail d’hydratation. Navigation globale rendue en liens HTML natifs, préchargement des liens de contenu désactivé. Même Lighthouse12.6.1 en local : AR98/100/100/100, CLS0, aucune requête RSC automatique ; build local webpack (Turbopack local refuse son port de sous-processus malgré l’autorisation demandée). Nouvelle CI Linux nécessaire, aucun seuil modifié.

- Contrôle du 7 novembre 23h UTC : le run42418980472 reste bloqué par Lighthouse (médianes EN94, FR93, ID92, audio94, AR93), sans déploiement. Cause isolée dans la route commune : le chargement dynamique depuis un composant serveur ne séparait pas réellement le code client des outils locaux. Deux frontières client conservent le SSR et séparent les modules ; Tailwind analyse désormais les sources frontend. Reproduction Linux exacte : image Node22.23.3, npm ci/package-lock et Turbopack ; Lighthouse12.6.1 AR100 et outil audio99, autres catégories100, CLS0. Les106URL et les huit langues/transferts passent sur ce build ; le sélecteur de fichiers reste dans le HTML serveur. Nouveau commit et nouvelle CI, aucun seuil abaissé ni job relancé à l’identique. Dates de /legal et des futures pages de confiance alignées sur la révision substantielle du7novembre ; le sitemap du blog ignore les brouillons.

- Lot guides 1–15 préparé : 15 sources EN, 23 captures UI WebP, mesures publiques contrôlées, rendu des tableaux/procédures/images et refus de publication sans auteur/À propos. Tous en brouillon tant que les informations demandées ne sont pas fournies. Tests ciblés8/8 ; build, lint, typecheck verts. PR à ouvrir après fusion et vérification de la PR1.

- Validation locale du lot1 terminée :203/203tests complets, seo-check106URL, i18n8langues et15brouillons404. Complément G19 : première image présentée0,300s dans les deux modes, paquets de référence à PTS négatif conservés en copie ; preuve détaillée ajoutée sans affirmer que la copie commence toujours visiblement à l’image clé précédente.
- Le run42425986465 a signalé un seul test unitaire obsolète : il attendait encore le30octobre pour /legal après sa révision réelle du7novembre. Attente mise à jour, autres dates inchangées ; nouveau commit sans re-run. Les contrôles Linux fonctionnels et mesures de séparation des modules restent ceux consignés ci-dessus.

### 2026-11-08 — Hydratation et validation PR 1

Le run 42427153089 passe les contrôles fonctionnels, SEO et i18n, mais échoue sur Lighthouse (médianes 92–94 ; autres catégories 100, CLS 0). Aucune fusion ni activation en production. Les mêmes fichiers réseau et réglages Lighthouse donnent 99–100 dans le build Linux local ; le rapport CI montre notamment une tâche React de 251 ms contre 77 ms localement. Nouvelle correction : frontières Suspense SSR pour séparer en-tête, contenu, pied de page et formulaire, et liens HTML natifs dans les vues éditoriales. Seuils Lighthouse inchangés. Vérification avant commit : lint, typecheck et 54 tests ciblés réussis.

Le run 42519840674 passe les 201 tests et les contrôles backend/déploiement, puis le smoke test sans JavaScript détecte une frontière Suspense trop large sur le contenu principal. Retrait de cette frontière et de celles entourant les composants dynamiques ; conservation des frontières synchrones en-tête/pied de page/contenu secondaire et des liens natifs. Le site reste intégralement rendu côté serveur. Pas de déploiement ni de retour arrière en production.

### 2026-11-08 — HTML allégé et contexte limité au formulaire

Le run42526535827 passe les contrôles fonctionnels, SEO et i18n, mais Lighthouse reste à92–94en médiane. Aucune fusion ni activation. Les frontières Suspense ajoutées sont retirées : un contrôle supplémentaire a détecté que la FAQ pouvait rester masquée sans JavaScript. Le smoke test vérifie désormais la visibilité réelle du H1 et de la FAQ.

Le fournisseur i18n est limité au formulaire de téléchargement et ses résultats via FetchFormSection ; les vues statiques, outils locaux et navigation ne reçoivent plus ce contexte. La CSS est une feuille externe partagée plutôt qu’une copie dans le HTML et une seconde dans le flux RSC. Mesures du même build Linux : HTML décompressé AR220430→94820octets, audio192768→67158, guide188028→62418. Dix pages sans JavaScript (FAQ comprise) et trois parcours interactifs passent, sans erreur de rendu ni débordement mobile. Lint, typage et16tests ciblés passent. La comparaison Webpack reste une expérience locale ; le compilateur de production reste Turbopack. Aucun réglage d’audit ni seuil modifié. OpenSEO whoami/list_projects revalidés gratuitement ; les crawls de suivi attendent les déploiements effectifs.

Le run 42530438280 valide les tests, le smoke sans JavaScript, Caddy et les 106 URL SEO, puis détecte un contexte manquant sur la page 404 localisée. Le fournisseur est rétabli uniquement autour du contenu 404 (le composant not-found utilise useI18n), sans le réintroduire sur les pages indexables. Nouveau commit, aucun re-run. Les 203 tests du lot complet de guides passent localement après les changements précédents.

Les huit 404 localisées passent sur le build Linux corrigé, ainsi que les dix pages SSR et trois parcours interactifs. La suite Python complète des déploiements (environ 12 minutes) est déplacée après Lighthouse dans le même job CI ; elle reste obligatoire avant la publication de l’archive et toute activation. Cette modification raccourcit le retour sur un échec Lighthouse, sans supprimer de contrôle ni changer les seuils.

### 8 novembre 2026 — Comparaison du compilateur

Le run 42532490308 passe les tests, le smoke SSR, Caddy, les 106 URL SEO et les huit langues/404. Les médianes Lighthouse sont EN 96, FR 95, ID 94, audio 96, guide 97, AR 94 ; A11y/BP/SEO 100 et CLS 0. Les deux routes à 94 bloquent la fusion ; aucun déploiement.

Le build utilise maintenant le [mode Webpack officiellement supporté par Next.js](https://nextjs.org/docs/app/getting-started/installation), sans changer la version de Next ni les seuils. Sur le build Linux avec CSS partagée : dix pages SSR/FAQ sans JavaScript, trois parcours interactifs et huit 404 localisées passent. Lighthouse local AR : 99/100/100/100, LCP 2,204 s, TBT 30 ms, CLS 0. Ce résultat local ne remplace pas la CI à venir. Les deux bundles backend reconstruits conservent exactement leurs SHA-256 de production respectifs. Aucun changement de dépendance ou de fichier de verrouillage.

### 9 novembre 2026 — Correction du run main après PR #41

La PR #41 a été fusionnée en24e59b7 après CI42534045962 entièrement verte et comparaison de l’archive9095a3c9 : les deux bundles correspondent exactement à la production7a8da19. Les18audits PR ont P≥95 (médianes96–97), autres catégories100 et CLS0. Le run main42536307108 valide les contrôles fonctionnels/SEO/i18n mais échoue sur FR94 (96/94/94), avant tout déploiement. Le benchmark du runner main est environ2063 contre2543–2654 sur les passes FR de la PR. Aucun retour arrière de production ; la release active reste7a8da19.

Nouveau commit de correction : les titres mobiles utilisent les polices système, Bricolage reste sur ordinateur ; son préchargement est limité aux écrans d’au moins768px. Suppression de la déclaration next/font redondante avec les faces CSS déjà auto-hébergées. Contrôles locaux : lint, typage,37tests ciblés ; dix pages SSR/FAQ, trois parcours et huit404 ; zéro requête de police en390px et police Bricolage conservée en1280px, sans débordement. Lighthouse local FR99/100/100/100, LCP2,213s,TBT27ms,CLS0. Nouveau run main requis ; aucun « Re-run all jobs », aucune modification des seuils, des annonces ou des bundles backend. Le correctif poursuit la première phase sans ouvrir le lot de guides avant vérification de production.

### 9 novembre — Clarté des formulaires dans les huit langues

La revue du lot relève six anciens supportedHint qui citaient YouTube sans préciser son indisponibilité. FORM_COPY couvre maintenant les huit langues : TikTok est la seule plateforme vérifiée, YouTube est indisponible ; les pages TikTok décrivent seulement le lien public ou le message de partage. Ces libellés restent hors des dictionnaires partagés ; aucun avis de relecture humaine n’est ajouté. Douze tests ciblés passent, et la passerelle reconstruite conserve exactement son SHA-256 de production. Les informations d’éditeur/auteur restent à compléter, les nouveaux guides restent non publiés.

Les deux libellés du formulaire sont sélectionnés côté serveur pour la langue courante, au lieu d’embarquer les huit copies dans le navigateur. Le vieux supportedHint de dictionnaire n’est plus transmis au client. Douze tests ciblés et le typage passent ; la passerelle reconstruite conserve son SHA-256 exact.

### 9 novembre — Phase 1 déployée et auditée

Main `eef2a305ae928b10ea0523975d35d552ba9a5e6f` déployé à00:29:55UTC, CI42538063318 entièrement verte. SEO public106URL, cinq guides existants, cinq brouillons404 et cinq vues mobiles passent ; contacts en clair, index/follow/canonical/hreflang corrects, aucune annonce active ni CMP. Les bundles de l’archive déployée conservent leurs SHA de production. Lighthouse main : médianes95–97, autres catégories100,CLS0 ; les passes isolées94 sont conservées. Zéro retour arrière réel.

OpenSEO audit7e4470c3-3b0e-41c0-bcb8-2aa743722796 terminé à08:14:12UTC : santé100/100,114pages parcourues,106indexables,0critique,0avertissement,31informations (dont24changements prévus sur les pages légales), coût0USD, rendu/proxy désactivés. Preuves sous docs/seo/evidence/2026-11-09-pr1-*. Le lot suivant peut maintenant être ouvert ; ses quinze guides restent non publiés faute d’auteur et d’À propos publiable. Aucun envoi à Google.


## 14 novembre 2026 — Reprise éditeur réel (PR 1, avant fusion)

Reprise de #41/#42 déjà fusionnées depuis un worktree isolé. Éditeur et hébergeur centralisés ; adresse postale vide masquée ; contact général et trois contacts spécialisés préservés et exclus de l’obfuscation.48pages complètes en8langues, mentions légales complétées, aucune juridiction/rétention/délai de retrait inventé. Performance/LCP/TBT avertissements ; A11y/BP/SEO100/CLS≤0,02 restent bloquants. Aucun diff moteur/passerelle/dictionnaires/AdSense/Caddy/ENGINE_FILES.

SEO local154URL réussi, licences200/noindex et autres réponses contrôlées. SHA-256 locaux : moteur fa0d3d4e15a5a45ca0deb2b35e7ba03adc95c31b87500378068121f291c42287 ; passerelle 0fa1404530c272b76aaec9aee18125660e8561c744e4ccc1fbb9c7dbee9850e5 (références respectives conservées ; ces deux programmes ont des hashes distincts). Archive CI exacte à vérifier avant fusion.

OpenSEO dry-run et crawl gratuit,0USD chacun : audit ec3b93eb-b0a1-41fd-a7a8-c1c936c21c24,100/100,24warnings externes,7infos,0critique. Il porte sur la production antérieure. Accès GSC expiré/révoqué signalé ; aucune soumission ni dépense payante. Dernier main échoué uniquement sur Performance arabe94 avant déploiement ; zéro rollback de cette mission.

Fusion interdite tant que l’éditeur n’a pas confirmé réception des tests contact@,legal@,privacy@,abuse@. Pas de reviewedBy/reviewedAt renseignés, pas de déclaration de relecture humaine. CI complète, revue critique finale et vérification post-déploiement à consigner.


## 14 novembre 2026 — Branche technique de relecture (sans publication)

119guides : reviewedBy/reviewedAt null, aucune relecture attestée. Gate strict published+nom exact+vraie date ; prêt/ancienne approbation/publicationRequested ne suffisent plus.34anciennes pages et8index fermés ;112URL locales contrôlées. Dates de première publication historiques conservées même lors d’une relecture ultérieure ; dateModified doit couvrir la relecture réelle.

Prévisualisation privée 127.0.0.1:4184, boucle locale uniquement, noindex/nofollow/no-store,144fiches.29textes du plan rédigés ;G27 fiche non aboutie (source TikTok actuelle non lisible, aucun test de compte attesté). Anciens essais repris avec leur date et leur portée, pas revendiqués comme relecture humaine. Dossier et inventaire complets dans docs/seo.15EN déjà main ;14EN+10FR seulement dans une bibliothèque depuis la branche locale d6b6812, à reprendre en lots≤5.

Build/SEO112URL/i18n réussis ; tests ciblés82réussis ; suite complète en cours. Aucun changement des fichiers moteur/passerelle/dictionnaires/AdSense/Caddy/ENGINE_FILES.0USD supplémentaire, aucune soumission Google. Fusion des pages de confiance attend encore les4boîtes e-mail ; cette branche ne certifie aucun guide relu.


Revue critique technique avant ouverture de la branche : aucun ancien flag ne contourne la garde ; dates calendaires et provenance contrôlées ; première date de publication historique préservée ; sources et liens effectifs recontrôlés pour chaque futur guide. seo-check impose2–4liens contextuels, signature Person/À propos et les deux destinations espagnoles. Les prévisualisations échappent le HTML via le même GuideBody, n’écoutent que127.0.0.1 et ne donnent aucune approbation.205tests locaux finaux réussis sous Node22. Les données de relecture du test sont uniquement des fixtures en mémoire/temporaire, jamais les119fichiers sources.

PR#43 : captures mobiles48pages+8mentions et menus réussis ;24mesures Lighthouse CI : Performance médiane97–99, A11y/BP/SEO100,CLS0 ; dernière suite de déploiement encore en cours au moment de cette note. Les captures sont locales, pas une vérification de production. Résultats CI complets et archive à ajouter avant fusion.


## 14 novembre — CI des pages de confiance verte, archive contrôlée

PR#43 ae78e46 : run43579679947 entièrement vert, y compris la suite de déploiement.24mesures Lighthouse : médianes97–99, A11y/BP/SEO100,CLS0.48pages+8mentions mobiles et menus validés. Archive2ea0c28c9094b25dd57f7258f7889c11c10d13d1 SHA256 c462185e8f7f6f739ea87ec1e914be2f53bba550edd2fd670f2ef6aabf6b77b7 ; hashes moteur et passerelle inchangés et ENGINE_FILES intact. Aucun blocage technique relevé pour43 ; confirmation des4boîtes e-mail toujours manquante. Aucune fusion ni activation.

PR#44 technique en brouillon :205tests locaux,112URL SEO, i18n et build verts ; CI indépendante encore en cours.144prévisualisations mobiles privées vérifiées (200/H1/images/largeur).G27 a été rédigé depuis le rendu public officiel TikTok (redirection www.tiktok.com/support/faq_detail?id=7543597460594285112&category=web_account), lu le14novembre. Aucun export de compte réel testé ; cette limite est explicite dans le brouillon et le dossier.30textes de travail, toujours0relecture attestée et0nouveau guide publié.

Les24warnings OpenSEO sont le même lien officiel TikTok signalé DNS dans24guides ; pas une preuve de24liens distincts définitivement cassés. Lecture gratuite des problèmes,0USD ; total de reprise0USD. Aucun envoi à Google.
