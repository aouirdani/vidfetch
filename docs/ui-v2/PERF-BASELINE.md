# VidFetch v2 — baseline Lighthouse

Mesure effectuée avant toute modification visuelle, sur le build de production local (`VIDFETCH_TARGET=ovh npm run build`, puis `next start`). Lighthouse 12.8.2, preset mobile par défaut, émulation réseau/CPU Lighthouse, trois passes séquentielles par URL. Les valeurs ci-dessous sont les médianes ; le CLS et le TBT sont exprimés en points et millisecondes.

| URL | Perf. | Accessibilité | Bonnes pratiques | SEO | LCP (ms) | CLS | TBT (ms) |
|---|---:|---:|---:|---:|---:|---:|---:|
| `/` | 98 | 100 | 100 | 100 | 2 335 | 0 | 48 |
| `/fr` | 98 | 100 | 100 | 100 | 2 336 | 0 | 49 |
| `/id/download-video-tiktok` | 98 | 100 | 100 | 100 | 2 189 | 0 | 68 |
| `/video-to-mp3` | 98 | 100 | 100 | 100 | 2 338 | 0 | 16 |
| `/blog/why-cant-i-save-tiktok` | 98 | 100 | 100 | 100 | 2 338 | 0 | 45 |
| `/ar` | 98 | 100 | 100 | 100 | 2 337 | 0 | 85 |

INP n'est pas mesuré de manière fiable par un audit de navigation synthétique sans interaction utilisateur ; il sera contrôlé par les tests d'interaction de la refonte et les données de terrain après déploiement.

## Poids initiaux

Médianes relevées dans les événements réseau Lighthouse, origin local seulement. Le build OVH active `inlineCss`, donc il n'y a pas de requête de feuille CSS : la taille CSS provient des balises `<style>` intégrées au HTML généré.

| Ressource | Avant (gzip / transfert) | Méthode |
|---|---:|---|
| JavaScript initial du même origin | 163 266 octets | Somme des `transferSize` des requêtes Script Lighthouse |
| CSS initial | 10 284 octets gzip | 54 019 octets inline gzip mesurés sur `.next/server/app/index.html` |
| Polices | 0 octet | Police système ; aucun fichier font transféré |

La page d'accueil transfère environ 540 Ko au total dans Lighthouse, dont environ 286 Ko de ressources tierces (publicité). Le HTML statique non compressé est d'environ 197 Ko. Ce sont des postes à surveiller durant la refonte, en particulier pour le LCP.

## PageSpeed Insights en production

L'API publique a été appelée pour `https://vidfetch.app/` en mobile, mais a répondu `Quota exceeded for quota metric 'Queries' and limit 'Queries per day'`. Aucun score PSI de production n'est donc inventé. Les mesures de terrain PSI restent à refaire quand le quota sera disponible.

Les rapports Lighthouse bruts des trois passes sont conservés temporairement dans `/private/tmp/vf-ui-base-*.json` sur la machine de travail ; les chiffres ci-dessus sont le relevé durable.
