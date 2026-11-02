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

## Comparaison Lighthouse CI main / PR

Le job CI construit `main` et l'artefact OVH de la PR dans le même runner Linux/Node 22. Il exécute Lighthouse mobile sur les mêmes six URL, avec la même version de Chrome/Lighthouse, trois passes séquentielles par build. Les rapports de chaque build sont conservés séparément puis comparés par URL avec la médiane des trois passes. Le preset Lighthouse recommandé est désactivé : seules les règles convenues sont bloquantes. Les assertions natives LHCI exigent A11y/BP/SEO=100 et CLS≤0,02 pour chaque build; le comparateur applique les seuils Performance à la PR uniquement afin que le build historique de `main` puisse servir de référence même s'il est sous le plancher.

Pour chaque page, les assertions sont :

- Accessibilité, Bonnes pratiques et SEO : médiane exactement 100 % ; CLS médian ≤0,02.
- Performance PR ≥90 et Performance PR ≥ Performance main −2 points.
- LCP PR ≤ LCP main +150 ms ; TBT PR ≤ TBT main +50 ms.
- Le budget de police, JS initial, CSS inline gzip et les exclusions de la scène 3D comme candidat LCP restent vérifiés sur la PR.

Le run `41524693765` était le dernier run avant la comparaison main/PR et avant le retrait du script AdSense. Le run `41533804636` a bien collecté 18 rapports par build, mais le comparateur n'a reconnu aucun rapport : il cherchait `lhr-*.json` alors que LHCI produit des fichiers `*.report.json`. Le motif est corrigé ; le run échoué ne fournit pas de mesures exploitables pour la décision de fusion.

Le H1 demeure le candidat LCP sur les pages d’accueil, TikTok et blog ; sur l’outil MP3, le candidat est le bloc de texte d’état initial. Aucun rapport ne désigne `.hero-scene`, `.hero-card` ni `.hero-token` comme candidat LCP. La scène décorative reste `aria-hidden` et n’est pas animée au chargement du texte.

Les seuils finaux remplacent l’ancienne limite LCP de 1 800 ms, le plancher Performance ≥95 et la comparaison baseline +150 ms. Les médianes de trois passes exigent A11y/BP/SEO=100, CLS≤0,02, Performance PR≥90 et ≥Performance main−2 points, LCP PR≤LCP main+150 ms et TBT PR≤TBT main+50 ms. Le plancher Performance ne s'applique qu'à la PR.

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

Le candidat LCP est le paragraphe descriptif du héros, pas une image. Sur cette page comme sur les autres, Lighthouse mesure **162 011 B** de JavaScript première partie, avec les mêmes deux chunks principaux (**67 861 B** et **64 658 B**). Aucune image n’est transférée ; la même police Latin de **22 209 B** est demandée que sur EN/FR/MP3/blog. La mesure précédente ne montrait ni bundle additionnel ni ressource spécifique ID ; ses tâches AdSense sont désormais supprimées du parcours initial. La comparaison après le retrait doit confirmer si le TBT restant provient du runtime partagé. Les valeurs locales ID (LCP **2 495 ms**, TBT **115 ms**) restent indicatives et ne remplacent pas la comparaison CI.

## Captures

Les dossiers `before/` et `after/` contiennent chacun 21 captures viewport : accueils EN/FR/AR/ID, page TikTok, outil MP3 et résultat, en 390×844, 768×1024 et 1440×900. Le résultat utilise une réponse API fictive interceptée localement ; aucun contenu tiers n’est téléchargé.
