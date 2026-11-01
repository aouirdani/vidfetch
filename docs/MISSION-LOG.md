# Journal de mission VidFetch

Date affichée en Europe/Paris. Les commits de la branche de travail ne deviennent pas publics avant la procédure de revue prévue pour chaque phase.

## 2026-11-01 — Revert capacité déployé

- PR #31 `revert: capacity until admin session` fusionnée en `31f51121735aacbfee99c29dadee1440b693b734`. Le commit `a906a4969fba1dc3ecea6a0797bd0b27998856f1` a été annulé par un commit revert normal, sans réécriture de l'historique.
- Vérification avant fusion : l'artefact de production CI `3a4f929a7c35b4fe416bf0ec540880c9ed7ffbb9` (run `41298579682`) et l'archive CI de la PR #31 (run `41339925495`, release de merge `fc420e678d73171af8d581adfc098e850c904b0d`) ont exactement les mêmes hashes : moteur `fa0d3d4e15a5a45ca0deb2b35e7ba03adc95c31b87500378068121f291c42287`; gateway `0fa1404530c272b76aaec9aee18125660e8561c744e4ccc1fbb9c7dbee9850e5`.
- CI complète PR #31 réussie (lint, typage, tests Node/backend/gateway/charge/Python, build, Caddy, SEO, i18n et tests des outils). Le push de merge `41343004391` et le job `deploy` ont réussi, sans retour arrière.
- Vérification publique après promotion : `curl https://vidfetch.app/api/health` retourne `release=31f51121735aacbfee99c29dadee1440b693b734`, `frontend.ready=true`, `downloads.available=true`. Le status root sur VPS n'a pas été consulté; le workflow de promotion et l'endpoint public confirment le commit actif.
- Le code de capacité de #26 est retiré de `main`; aucune hausse de quota ni configuration de capacité n'a été appliquée.

## 2026-11-01 — Suite des PR de mission

- PR #29 (`feat/seo-debt`) est en cours de rebase sur le `main` post-revert. Conflits résolus dans le workflow et le journal en conservant les changements SEO et la preuve du déploiement du revert. Le document capacité y devient un compte rendu historique; les fonctionnalités de #26 ne sont pas réintroduites.
- Ordre conservé pour la suite : #29, #27, #30, #28. Chaque PR sera rebasée, testée, relue avant fusion puis vérifiée en production. Les PR suivantes ne sont pas encore intégrées.
- Phase 3 / PR #27 : navigation mobile localisée et captures/audit EN, FR, AR, ID préparés; le build précédent de cette PR était vert. Revalidation requise après rebase.
- Phase 4 / PR #30 : 64 entrées candidates Facebook, Reddit, Vimeo, Dailymotion, toutes non publiées et sans gates; aucune URL au sitemap. Pas de liens opérateur autorisés, aucune vérification de plateforme réelle.
- Phase 5 / PR #29 : CI Node 24 épinglée par SHA, vérifications browser/SEO ajoutées, limites cohérentes et rapport final. Tests locaux connus : lint, typecheck, `npm test` 192/192, `test:i18n` 97 pages/8 langues, SEO 82 URL. Le CI est à relancer après le rebase.
- Phase 6 / PR #28 : contenus de lancement préparés sous `docs/launch/`, non publiés. CI à revérifier après rebase.

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
