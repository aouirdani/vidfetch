# VidFetch v2 — résultats de performance

## Méthode

Mesures locales sur le build OVH standalone, servi par `.next/standalone/server.js`, Lighthouse 12.8.2 en preset mobile et Chrome for Testing 156. Trois passes séquentielles par URL ; les chiffres après sont les médianes. La machine de mesure est un Mac Apple Silicon avec émulation mobile Lighthouse. Le build local a utilisé `next build --webpack` : Turbopack ne démarre pas dans cet environnement, même avec les permissions d’exécution, car son processus interne reçoit `EPERM` sur le socket. Le workflow CI mesure l’artefact OVH du pipeline, construit sous Linux/Node 22 avec la commande de production normale.

## Médianes avant / après

| Page | Perf. avant → après | A11y après | BP après | SEO après | LCP avant → après | CLS avant → après | TBT avant → après |
|---|---:|---:|---:|---:|---:|---:|---:|
| `/` | 98 → 97 | 100 | 100 | 100 | 2 335 → 2 645 ms (+13,3 %) | 0 → 0 | 48 → 58 ms |
| `/fr` | 98 → 97 | 100 | 100 | 100 | 2 336 → 2 642 ms (+13,1 %) | 0 → 0 | 49 → 63 ms |
| `/id/download-video-tiktok` | 98 → 96 | 100 | 100 | 100 | 2 189 → 2 642 ms (+20,7 %) | 0 → 0 | 68 → 67 ms |
| `/video-to-mp3` | 98 → 97 | 100 | 100 | 100 | 2 338 → 2 648 ms (+13,3 %) | 0 → 0 | 16 → 42 ms |
| `/blog/why-cant-i-save-tiktok` | 98 → 96 | 100 | 100 | 100 | 2 338 → 2 648 ms (+13,3 %) | 0 → 0 | 45 → 90 ms |
| `/ar` | 98 → 92 | 100 | 100 | 100 | 2 337 → 3 305 ms (+41,4 %) | 0 → 0 | 85 → 100 ms |

**Les seuils obligatoires ne sont pas atteints :** le LCP dépasse 1,8 s sur les six pages, et la page arabe a 92 en Performance au lieu de 95. Les assertions Lighthouse CI sont configurées pour échouer sur ces cas ; la PR ne doit pas être fusionnée tant qu’ils ne sont pas corrigés. Les audits Accessibilité, Bonnes pratiques et SEO sont à 100 sur les six pages ; le CLS est nul et le TBT reste inférieur ou égal à 100 ms.

L’audit LCP désigne le H1, qui reste visible dès le HTML initial, sans animation. Le temps est principalement dans le délai de rendu Lighthouse (environ 2,2 s pour les pages latines et 2,85 s pour l’arabe), pas dans le chargement d’une image. Le serveur standalone et `next start` donnent un résultat comparable. Ce diagnostic est une observation des rapports Lighthouse, pas une mesure de terrain.

## Poids

| Ressource | Avant | Après | Seuil | Résultat |
|---|---:|---:|---:|---|
| JavaScript première partie, transfert compressé | 163 266 B | 161 760 B | maximum 166 266 B (avant +3 Ko) | ✅ |
| CSS inline, gzip | 10 284 B | 12 659 B | maximum 20 000 B | ✅ |
| Polices WOFF2 latines | 0 B | 55 604 B | maximum 90 000 B | ✅ |
| Police WOFF2 arabe | 0 B | 123 688 B, uniquement sur `/ar` | chargement conditionnel | ✅ |

Les tailles sont mesurées sur le HTML et les événements réseau du build standalone. Le budget JS est la somme des transferts des scripts de même origine ; la publicité tierce n’entre pas dans cette limite. Les deux visages latins sont préchargés dans la configuration qui conserve CLS à zéro. Un essai sans préchargement du visage texte a produit CLS 0,171 et Performance 88 sur une passe ; il ne peut pas remplacer la configuration mesurée. Cela reste un écart à la consigne « précharger uniquement la police du H1 » à résoudre avec une solution de métriques de repli validée.

INP n’est pas une mesure stable d’un audit de navigation sans interaction. Aucun score PageSpeed Insights de production n’est ajouté : la branche n’est pas déployée, car les seuils LCP/Performance sont encore en échec.

## Captures

Les dossiers `before/` et `after/` contiennent chacun 21 captures viewport : accueil EN/FR/AR/ID, page TikTok, outil MP3 et écran de résultat, en 390×844, 768×1024 et 1440×900. Le résultat utilise une réponse API fictive interceptée localement ; aucun contenu tiers n’est téléchargé.
