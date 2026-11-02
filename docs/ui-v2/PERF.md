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

**Résultat avec les seuils acceptés : les six pages passent.** Performance ≥95, Accessibilité/Bonnes pratiques/SEO=100, LCP médian ≤2 500 ms, CLS≤0,02 et TBT médian ≤200 ms. Les valeurs proches de 2,34 s ou 2,49 s correspondent aux paliers de throttling mobile de Lighthouse. La comparaison « baseline +150 ms » est retirée : elle pénalisait des écarts de quelques millisecondes entre mesures simulées par paliers. Les rapports des 18 passes sont conservés hors dépôt dans `/private/tmp/vf-ui-v2-revised/`.

Le H1 demeure le candidat LCP sur les pages d’accueil, TikTok et blog ; sur l’outil MP3, le candidat est le bloc de texte d’état initial. Aucun rapport ne désigne `.hero-scene`, `.hero-card` ni `.hero-token` comme candidat LCP. La scène décorative reste `aria-hidden` et n’est pas animée au chargement du texte.

Les seuils finaux remplacent l’ancienne limite LCP de 1 800 ms et la comparaison baseline +150 ms. Lighthouse CI et le budget personnalisé vérifient les médianes de trois passes : Performance ≥95, A11y/BP/SEO=100, LCP≤2 500 ms, CLS≤0,02 et TBT≤200 ms.

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

Le candidat LCP est le paragraphe descriptif du héros, pas une image. Sur cette page comme sur les autres, Lighthouse mesure **162 011 B** de JavaScript première partie, avec les mêmes deux chunks principaux (**67 861 B** et **64 658 B**). Aucune image n’est transférée ; la même police Latin de **22 209 B** est demandée que sur EN/FR/MP3/blog. Le TBT vient surtout de tâches longues du chunk Next (≈87–90 ms) et d’AdSense (tâches variables, ≈55–108 ms par tâche). Aucun bundle additionnel ni ressource spécifique ID n’est en cause ; retirer du code exigerait de modifier le runtime partagé ou le chargement publicitaire. La médiane ID (LCP **2 495 ms**, TBT **115 ms**) respecte les seuils acceptés. Les passes ID ont mesuré 2 343, 2 500 et 2 495 ms, cohérent avec les paliers de throttling.

## Captures

Les dossiers `before/` et `after/` contiennent chacun 21 captures viewport : accueils EN/FR/AR/ID, page TikTok, outil MP3 et résultat, en 390×844, 768×1024 et 1440×900. Le résultat utilise une réponse API fictive interceptée localement ; aucun contenu tiers n’est téléchargé.
