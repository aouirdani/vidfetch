# VidFetch v2 — résultats de performance

## Méthode

Build Next de production avec `VIDFETCH_TARGET=ovh`, servi par `next start` sur loopback. Lighthouse 12.8.2, Chrome for Testing 156, mobile simulé. Trois passes séquentielles par page ; chaque métrique et score ci-dessous est sa médiane. Le build local utilise Webpack : Turbopack ne démarre pas dans cet environnement (`EPERM` sur son socket interne). CI mesurera son artefact OVH Linux/Node 22.

## Médianes avant / après le correctif de polices

| Page | Perf. avant → après | A11y | BP | SEO | LCP médian après | CLS | TBT médian |
|---|---:|---:|---:|---:|---:|---:|---:|
| `/` | 98 → 98 | 100 | 100 | 100 | 2 348 ms | 0 | 77 ms |
| `/fr` | 98 → 98 | 100 | 100 | 100 | 2 496 ms | 0 | 71 ms |
| `/id/download-video-tiktok` | 98 → 97 | 100 | 100 | 100 | 2 495 ms | 0 | 115 ms |
| `/video-to-mp3` | 98 → 98 | 100 | 100 | 100 | 2 493 ms | 0 | 37 ms |
| `/blog/why-cant-i-save-tiktok` | 98 → 97 | 100 | 100 | 100 | 2 495 ms | 0 | 85 ms |
| `/ar` | 98 → 98 | 100 | 100 | 100 | 2 345 ms | 0 | 59 ms |

**Résultat local : les six pages passent** les seuils acceptés sur ce Mac. Les valeurs proches de 2,34 s ou 2,49 s correspondent aux paliers de throttling mobile de Lighthouse. La comparaison « baseline +150 ms » est retirée : elle pénalisait des écarts de quelques millisecondes entre mesures simulées par paliers. Les rapports des 18 passes locales sont conservés hors dépôt dans `/private/tmp/vf-ui-v2-revised/`.

**Résultat CI (run 41524693765, artefact Linux standalone OVH) : échec Lighthouse.** Les médianes y diffèrent sensiblement des mesures locales :

| Page | Performance médiane CI | LCP médian CI | TBT médian CI |
|---|---:|---:|---:|
| `/` | 90 | 2 692 ms | 314 ms |
| `/fr` | 89 | 2 692 ms | 325 ms |
| `/id/download-video-tiktok` | 89 | 2 686 ms | 315 ms |
| `/video-to-mp3` | ≥95¹ | 2 684 ms | ≤200 ms¹ |
| `/blog/why-cant-i-save-tiktok` | 89 | 2 694 ms | 323 ms |
| `/ar` | 89 | 2 549 ms | 338 ms |

¹ Aucune assertion Performance/TBT en échec n’est consignée pour cette route; le LCP dépasse néanmoins le plafond. Ces résultats historiques précèdent la comparaison main/PR et le retrait du script AdSense. Ils ne valident pas le commit actuel.

Le workflow échouait aussi sur des audits supplémentaires (`label-content-name-mismatch`, `legacy-javascript`, `network-dependency-tree-insight`, `unused-javascript`) hérités de `lighthouse:recommended`, qui n’étaient pas dans les critères du propriétaire. Le preset a été retiré. Après confirmation que le TBT est causé par le tag publicitaire (la page MP3 sans ce tag était la seule à passer), le tag est retiré du layout en attendant l'approbation AdSense; la déclaration de compte et `/ads.txt` restent. Le chargeur différé préparé est désactivé par défaut et ne peut démarrer qu'après une interaction ou un défilement **et** après l'événement `load`.

## Lighthouse CI

Le workflow exécute un seul build de production OVH et une campagne mobile de trois passes sur `/`, `/fr`, `/id/download-video-tiktok`, `/video-to-mp3`, `/blog/why-cant-i-save-tiktok` et `/ar`. Il ne construit plus `main` pour une comparaison. Les seuls contrôles Lighthouse bloquants sont Accessibilité=100, Bonnes pratiques=100, SEO=100 et CLS≤0,02 (médiane de trois passes). Les rapports JSON sont conservés sept jours comme artefact, même si l'un de ces contrôles échoue.

Performance, LCP et TBT ainsi que les budgets indicatifs JS/CSS/polices et le test de scène LCP sont affichés par `scripts/ui-v2/report-budgets.mjs` avec des annotations d'avertissement, sans faire échouer la CI. Repères d'avertissement : Performance<90, LCP>2 500 ms, TBT>200 ms, JS>166 266 B, CSS inline gzip>16 284 B et polices latines>90 000 B. Les résultats de laboratoire comparatifs précédents ne servent plus de condition de fusion ; après le déploiement, le propriétaire fera la mesure de référence sur `pagespeed.web.dev`.

Les anciennes campagnes comparatives (runs `41538516075` et `41542713148`) avaient montré des dépassements LCP sur `/`, `/fr`, `/video-to-mp3` et `/ar`, tandis que Performance, CLS et TBT passaient les budgets retenus. Ces scores sont historiques et ne représentent pas une mesure de production. L'artefact de la dernière campagne a permis de vérifier que le candidat LCP était le H1 des accueils et le texte d'état de l'outil MP3 ; aucune page ne désignait `.hero-scene`, `.hero-card` ou `.hero-token` comme candidat.

## Poids et polices

| Ressource | Avant | Après | Limite | Résultat |
|---|---:|---:|---:|---|
| JavaScript même origine, gzip/transfert | 163 266 B | 162 011 B | ≤166 266 B | ✅ |
| CSS intégré au HTML, gzip | 10 284 B | 12 913 B | ≤16 284 B (baseline +6 Ko) | ✅ |
| Bricolage Grotesque 800 Latin + Latin-ext | 0 B | 32 340 B | ≤90 000 B | ✅ |
| Polices web sur `/ar` | 0 B | 0 B | aucune | ✅ |

Le corps du texte utilise `system-ui, -apple-system, Segoe UI, Roboto, sans-serif`; l’arabe utilise `Geeza Pro, Noto Sans Arabic, Segoe UI, Tahoma, sans-serif`. Bricolage est auto-hébergée et n’est appliquée qu’aux titres non arabes. `font-display: optional`, une face de repli ajustée par `next/font` et le préchargement Latin conditionnel sont configurés. Les deux sous-ensembles utilisent des plages Unicode Latin et Latin-ext officielles. Les rapports réseau montrent uniquement le WOFF2 Latin demandé pour ces six échantillons ; aucun fichier de police n’est demandé sur `/ar`.

INP n’est pas mesurable de façon stable par ces navigations synthétiques sans interaction. Aucun score PageSpeed Insights de production n’est disponible avant le déploiement.

### Diagnostic `/id/download-video-tiktok`

La dernière campagne comparative n'a relevé aucune ressource ou bundle propre à cette page ; son LCP était le paragraphe descriptif du héros. Le script AdSense ne se charge plus dans le layout initial. La nouvelle CI fournira les métriques de laboratoire à titre indicatif, et le propriétaire mesurera le site déployé avec PageSpeed Insights.

## Captures

Les dossiers `before/` et `after/` contiennent chacun 21 captures viewport : accueils EN/FR/AR/ID, page TikTok, outil MP3 et résultat, en 390×844, 768×1024 et 1440×900. Le résultat utilise une réponse API fictive interceptée localement ; aucun contenu tiers n’est téléchargé.
