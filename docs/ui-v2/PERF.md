# VidFetch v2 — résultats de performance

## Méthode

Build Next de production avec `VIDFETCH_TARGET=ovh`, servi par `next start` sur loopback. Lighthouse 12.8.2, Chrome for Testing 156, mobile simulé. Trois passes séquentielles par page ; chaque métrique et score ci-dessous est sa médiane. Le build local utilise Webpack : Turbopack ne démarre pas dans cet environnement (`EPERM` sur son socket interne). CI mesurera son artefact OVH Linux/Node 22.

## Médianes avant / après le correctif de polices

| Page | Perf. avant → après | A11y | BP | SEO | LCP baseline → après (Δ; max autorisé) | CLS | TBT |
|---|---:|---:|---:|---:|---:|---:|---:|
| `/` | 98 → 98 | 100 | 100 | 100 | 2 335 → 2 348 ms (+13; max 2 485) | 0 | 77 ms |
| `/fr` | 98 → 98 | 100 | 100 | 100 | 2 336 → 2 496 ms (+160; max 2 486) | 0 | 71 ms |
| `/id/download-video-tiktok` | 98 → 97 | 100 | 100 | 100 | 2 189 → 2 495 ms (+306; max 2 339) | 0 | 115 ms |
| `/video-to-mp3` | 98 → 98 | 100 | 100 | 100 | 2 338 → 2 493 ms (+155; max 2 488) | 0 | 37 ms |
| `/blog/why-cant-i-save-tiktok` | 98 → 97 | 100 | 100 | 100 | 2 338 → 2 495 ms (+157; max 2 488) | 0 | 85 ms |
| `/ar` | 98 → 98 | 100 | 100 | 100 | 2 337 → 2 345 ms (+8; max 2 487) | 0 | 59 ms |

**Verdict : NO-GO.** Les six pages passent Performance ≥95, Accessibilité/Bonnes pratiques/SEO =100, LCP absolu ≤2 500 ms et CLS ≤0,02. Quatre dépassent la marge LCP baseline +150 ms : `/fr` de 10 ms, ID de 156 ms, MP3 de 5 ms et l’article de 7 ms. Le TBT médian de la page ID est 115 ms, au-dessus de 100 ms. Les rapports bruts des 18 passes sont conservés hors dépôt dans `/private/tmp/vf-ui-v2-revised/`.

Le H1 demeure le candidat LCP sur les pages d’accueil, TikTok et blog ; sur l’outil MP3, le candidat est le bloc de texte d’état initial. Aucun rapport ne désigne `.hero-scene`, `.hero-card` ni `.hero-token` comme candidat LCP. La scène décorative reste `aria-hidden` et n’est pas animée au chargement du texte.

Les seuils révisés remplacent la cible uniforme précédente de 1 800 ms, inférieure aux LCP de départ. Lighthouse CI fixe le plafond absolu à 2 500 ms ; le script de budget calcule la médiane des trois passes et impose également `min(2 500 ms, baseline URL + 150 ms)`, ainsi que les seuils médians Performance/A11y/BP/SEO/CLS/TBT.

## Poids et polices

| Ressource | Avant | Après | Limite | Résultat |
|---|---:|---:|---:|---|
| JavaScript même origine, gzip/transfert | 163 266 B | 162 011 B | ≤166 266 B | ✅ |
| CSS intégré au HTML, gzip | 10 284 B | 12 913 B | ≤16 284 B (baseline +6 Ko) | ✅ |
| Bricolage Grotesque 800 Latin + Latin-ext | 0 B | 32 340 B | ≤90 000 B | ✅ |
| Polices web sur `/ar` | 0 B | 0 B | aucune | ✅ |

Le corps du texte utilise `system-ui, -apple-system, Segoe UI, Roboto, sans-serif`; l’arabe utilise `Geeza Pro, Noto Sans Arabic, Segoe UI, Tahoma, sans-serif`. Bricolage est auto-hébergée et n’est appliquée qu’aux titres non arabes. `font-display: optional`, une face de repli ajustée par `next/font` et le préchargement Latin conditionnel sont configurés. Les deux sous-ensembles utilisent des plages Unicode Latin et Latin-ext officielles. Les rapports réseau montrent uniquement le WOFF2 Latin demandé pour ces six échantillons ; aucun fichier de police n’est demandé sur `/ar`.

INP n’est pas mesurable de façon stable par ces navigations synthétiques sans interaction. Aucun score PageSpeed Insights de production n’est disponible : la branche n’est pas déployée tant que les seuils ci-dessus et la CI ne sont pas verts.

## Captures

Les dossiers `before/` et `after/` contiennent chacun 21 captures viewport : accueils EN/FR/AR/ID, page TikTok, outil MP3 et résultat, en 390×844, 768×1024 et 1440×900. Le résultat utilise une réponse API fictive interceptée localement ; aucun contenu tiers n’est téléchargé.
