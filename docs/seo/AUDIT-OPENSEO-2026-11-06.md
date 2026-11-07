# Audit OpenSEO — vidfetch.app — 6 novembre 2026

> Les sections initiales ci-dessous décrivent la photographie du 6 novembre. Le [bilan de production de la vague SEO 3](#résultat-de-la-vague-seo-3--vérification-du-7-novembre-2026) détaille les changements livrés et les nouveaux contrôles du 7 novembre.

## Résumé

- Connexion OpenSEO vérifiée par `whoami` et `list_projects` ; projet existant réutilisé.
- Search Console connectée à `sc-domain:vidfetch.app` ; période disponible : 07/10–03/11/2026.
- Crawl complet : 91 URL, dont 82 pages HTML indexables dans les huit langues ; aucun 5xx.
- Score OpenSEO brut : 9/100, fortement pénalisé par un seul lien email Cloudflare répété.
- Le navigateur restitue un `mailto:` fonctionnel : les 82 alertes de liens cassés sont des faux positifs pour le parcours testé.
- Aucun blocage technique critique actuel confirmé ; 18 pages indexables restent non indexées dans Google.
- Inventaire Google : 64 indexées, 18 non indexées ; neuf anciens verdicts `noindex` précèdent les mises à jour.
- Lighthouse mobile : performance 99–100, accessibilité/bonnes pratiques/SEO 100 ; CLS nul.
- Sept mots-clés étudiés dans les pays demandés, avec dix résultats organiques chacun.
- Coût total : **0,61 USD sur 2 USD autorisés** ; le livrable initial était ce rapport seul.

## Périmètre et méthode

Site : <https://vidfetch.app>. Projet OpenSEO `vidfetch`, ID `0289621d-1d2e-411b-b57b-df52dc7f5515`, marché par défaut États-Unis/anglais. Les recherches ont explicitement remplacé ce marché par les pays/langues demandés, sans modifier les réglages du projet.

Audit technique ID `7f4163ed-f97b-43f3-830e-ec3931609482`, lancé le 06/11 à 17:08:17 UTC, terminé à 17:08:51 UTC. `max_pages=1000`, `render_mode=off`, `use_fallback=false` ; crawl terminé sans troncature, zéro rendu ou proxy payant. Les contrôles Lighthouse constituent des appels distincts et payants.

Référence du code consulté : `cadebe3c44ce2fa3a061f5fda59728d859d2f2a4` (`origin/main`). Le site en ligne a aussi été contrôlé en HTTP et dans Chromium. Aucune correction, publication de page, soumission de sitemap, demande d'indexation ou activation d'IndexNow n'a été effectuée. OpenSEO conserve les résultats et a actualisé son inventaire : cela ne modifie pas le site.

Les données ci-dessous proviennent des réponses MCP OpenSEO : `get_site_audit`, `get_audit_issues`, `get_search_performance`, `get_search_console_rows`, `get_indexing_status`, `list_indexing_pages`, `inspect_urls`, `get_google_sitemaps`, `keyword_metrics`, `serp` et `lighthouse`. Les horodatages des mesures payantes sont ceux fournis par OpenSEO. Les résultats Search Console précèdent le dernier déploiement : ils ne mesurent pas exclusivement l'interface actuelle.

## Audit technique

### Couverture

| Langue / préfixe | Pages HTML indexables |
| --- | --- |
| en / sans préfixe | 22 |
| fr | 12 |
| es | 8 |
| pt | 8 |
| id | 8 |
| de | 8 |
| it | 8 |
| ar | 8 |

Le préfixe `/pt` correspond au portugais brésilien (`pt-BR`). Les 82 pages correspondent aux 82 entrées du sitemap. Le crawl découvre 91 URL au total : 90 réponses 2xx et une 404 technique ; aucune 5xx, aucun échec réseau, aucune page bloquée ou limitée par le serveur. Il vérifie aussi 12 ressources et 21 liens externes. Robots et sitemap sont trouvés. Le passage HTTP → HTTPS renvoie 308. Aucun problème de canonical, hreflang, données structurées ou sitemap n'est remonté dans cet audit ; cela décrit les contrôles réalisés, pas une garantie d'absence de défaut.

### Problèmes classés après vérification

| Gravité retenue | Constat | URL et nombre de pages touchées | Interprétation / suite à examiner après revue |
| --- | --- | --- | --- |
| Critique | Aucun blocage actuel confirmé sur les pages publiées | 0 page confirmée | Les 84 lignes « critical » OpenSEO correspondent à 82 liens email et deux catégories pour la même URL 404 ; voir les faux positifs. |
| Important | 18 pages indexables ne sont pas indexées selon Google | 18 URL détaillées dans le tableau d'indexation | Neuf anciens verdicts `noindex`, cinq URL inconnues, deux découvertes et deux explorées non indexées. Vérifier le prochain passage Google avant de conclure à un blocage actuel. |
| Important — suivi | Les neuf verdicts `noindex` sont anciens | `/blog`, sept articles EN, `/fr/guides` ; 9 pages, incluses dans les 18 précédentes | Dernière exploration Google du 18 au 25/10, antérieure aux mises à jour du 29/10 ; crawl actuel : 200 et indexable. Aucun retrait supplémentaire de `noindex` n'est justifié par ces seules données. |
| Mineur | HSTS, CSP et protection contre le clickjacking absents de la réponse publique échantillonnée | `https://vidfetch.app/` : 1 URL testée, 1 origine ; étendue aux autres pages non mesurée | Absences confirmées dans les en-têtes HTTP publics. Le Caddyfile versionné prévoit HSTS : examiner l'écart entre configuration et réponse servie, sans l'attribuer à un composant précis. |
| Mineur | JavaScript inutilisé et diagnostics Lighthouse | `/`, `/id/download-video-tiktok`, `/video-to-mp3`, `/blog/why-cant-i-save-tiktok` : 4 pages | Environ 28–30 KiB de JS inutilisé ; dépendances réseau, bfcache, cache et correspondance nom/libellé à examiner. Les scores agrégés restent élevés ; aucun défaut SEO critique établi par ces diagnostics seuls. |

Les deux lignes d'indexation se recouvrent : **18 pages uniques**, pas 27. Les diagnostics de sécurité sont signalés une fois par origine par OpenSEO : ne pas annoncer 82 pages testées pour ces en-têtes.

### Alertes et faux positifs

| Signal brut | Nombre | Vérification et qualification |
| --- | --- | --- |
| `broken-internal-link` | 82 pages indexables, liste exhaustive en annexe | Toutes visent `/cdn-cgi/l/email-protection`. Le HTML initial contient un lien obfusqué avec fragment et `email-decode.min.js`. Dans Chromium, les liens de contact de `/` et `/fr` deviennent `mailto:abuse@vidfetch.app`. Faux positif confirmé pour ces deux parcours ; même cible dans les 82 alertes. L'accès direct à l'URL technique sans fragment répond bien 404. |
| `broken-page` + `page-404` | 2 lignes, 1 seule URL | Même `/cdn-cgi/l/email-protection`, pas deux pages de contenu manquantes. Le score brut 9/100 ne représente donc pas la proportion de pages éditoriales cassées. Aucun score « corrigé » inventé. |
| `url-uppercase` | 1 URL | `/ar/%D8%A7%D9%84%D8%B4%D8%B1%D9%88%D8%B7-%D9%88%D8%A7%D9%84%D8%AE%D8%B5%D9%88%D8%B5%D9%8A%D8%A9` : l'encodage du texte arabe contient des lettres hexadécimales majuscules ; ce n'est pas une variante de casse latine. Faux positif probable. |
| `llms-txt-missing` | 1 origine | `/llms.txt` absent ; observation distincte des problèmes Google d'indexation, aucune causalité établie. Pas de correction prioritaire déduite. |
| Instagram/X/YouTube et vague 2 en 404 | 4 URL contrôlées hors crawl | `/instagram-reels-downloader`, `/twitter-video-downloader`, `/youtube-video-downloader`, `/facebook-video-downloader` répondent 404 avec `noindex`. Catalogue `content/platforms/catalogue.json` et résolution des routes : pages non publiées/verrouillées. Absences voulues ; ne pas les publier pour améliorer un score. Les autres routes verrouillées n'ont pas été testées individuellement. |
| Routes techniques interdites aux robots | 6 préfixes/règles | `/api/`, `/auth/`, `/download-helper`, `/internal/`, `/tmp/`, `/local-media/download/` dans `src/app/robots.ts`. Exclusions voulues, hors inventaire de contenu indexable. |
| Absence de script AdSense | 2 pages vérifiées en navigateur, politique dans le code | `/` et `/fr` : aucun script `adsbygoogle`. Métadonnée du compte présente dans le HTML de `/`. `ADSENSE_DEFERRED_LOADING_ENABLED=false` dans `src/lib/adsense.ts` : état voulu tant que le compte n'est pas approuvé. |
| Ancienne alerte « No sitemap found » | Ancien état de synchronisation | Le nouveau crawl et la synchronisation trouvent `/sitemap.xml`, sans erreur ; Google l'a lu le 05/11. Alerte ancienne, pas une panne actuelle. |
| Ancien trafic `www` et chemins avec `/` final | Historique Search Console | `https://www.vidfetch.app/` conduit actuellement à l'accueil sans `www`. L'inspection Google de `/` renvoie un canonical utilisateur et Google identiques à `https://vidfetch.app/`. Les anciennes lignes de performances ne suffisent pas à prouver une duplication actuelle. |

Le mécanisme de décodage des emails est décrit dans la [documentation officielle Cloudflare](https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/). La conclusion pour VidFetch repose aussi sur le contrôle réel du DOM, pas seulement sur cette documentation.

## Lighthouse mobile

Une mesure OpenSEO par URL, réalisée le 06/11/2026 ; ce n'est ni une médiane de trois passes, ni une mesure CrUX de terrain. L'API ne fournit pas ici la version de Lighthouse ou tous les détails de l'environnement. Les résultats ne sont pas directement comparables aux anciens runs CI.

| URL | Perf. /100 | Access. /100 | BP /100 | SEO /100 | LCP ms | TBT ms | CLS | Heure UTC |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 99 | 100 | 100 | 100 | 1 439 | 65 | 0 | 17:09:38 |
| `/id/download-video-tiktok` | 100 | 100 | 100 | 100 | 1 157 | 34 | 0 | 17:09:51 |
| `/video-to-mp3` | 100 | 100 | 100 | 100 | 1 170 | 33,5 | 0 | 17:10:05 |
| `/blog/why-cant-i-save-tiktok` | 100 | 100 | 100 | 100 | 1 072 | 35 | 0 | 17:10:20 |

Les quatre mesures respectent LCP ≤ 2 500 ms, CLS ≤ 0,02 et TBT ≤ 200 ms. OpenSEO étiquette certains diagnostics « critical » selon leur score individuel, même avec les catégories à 100 ; cette étiquette n'établit pas à elle seule une gravité critique pour le site. Exemple : cache de `/video-to-mp3`, gain annoncé 100 ms et 0 KiB arrondi. Aucun changement de performance n'est appliqué dans cette mission.

## Search Console — 28 jours

Propriété : `sc-domain:vidfetch.app`. Période **du 07/10 au 03/11/2026 inclus** (28 jours, retard de disponibilité de trois jours). Référence précédente : 09/09–06/10. Les CTR des tableaux sont des pourcentages, comme les renvoie OpenSEO ; les positions sont des moyennes historiques.

### Vue globale et marque

| Période | Clics | Impressions | CTR % | Position |
| --- | --- | --- | --- | --- |
| 07/10–03/11 | 59 | 720 | 8,19 | 7,2 |
| 09/09–06/10 | 0 | 0 | ND | ND |

Le passage de zéro au trafic actuel ne permet pas de calculer une croissance en pourcentage exploitable.

Définition de marque utilisée : contient littéralement `vidfetch`, sans tenir compte de la casse. Les variantes « video fetch » ou « vidsfetch » restent donc dans le groupe sans cette chaîne ; une définition élargie changerait la répartition.

| Groupe de requêtes | Clics | Impressions | CTR % | Position |
| --- | --- | --- | --- | --- |
| Contient `vidfetch` — filtre Search Console | 22 | 74 | 29,73 | 3,8 |
| Sans `vidfetch` — uniquement les 24 requêtes visibles | 7 | 340 | 2,06 | Non agrégée |
| Ensemble des 25 requêtes visibles | 29 | 414 | 7,00 | Non agrégée |
| Écart entre global et requêtes visibles | 30 | 306 | Non interprété | ND |

Il serait incorrect de présenter les 37 clics et 646 impressions obtenus par « global moins marque » comme un total non-marque fiable : les requêtes non restituées empêchent leur attribution. La [documentation Search Console](https://developers.google.com/search/blog/2022/10/performance-data-deep-dive) explique notamment le masquage des requêtes anonymisées et les différences d'agrégation. Aucun total complet non-marque n'est inventé.

### Requêtes visibles — avec et sans marque

| Requête | Contient `vidfetch` | Clics | Impressions | CTR % | Position |
| --- | --- | --- | --- | --- | --- |
| vidfetch | Oui | 22 | 74 | 29,73 | 3,8 |
| video fetch | Non | 7 | 303 | 2,31 | 5,7 |
| convertir video de tik tok | Non | 0 | 1 | 0 | 80 |
| descargar video tiktok mp3 | Non | 0 | 1 | 0 | 73 |
| descargar videos de tik tok mp3 | Non | 0 | 2 | 0 | 73 |
| descargar videos de tiktok mp3 | Non | 0 | 1 | 0 | 72 |
| descargar videos tiktok mp3 | Non | 0 | 1 | 0 | 74 |
| fetch audio | Non | 0 | 1 | 0 | 7 |
| fetch video | Non | 0 | 2 | 0 | 38 |
| fetchtube | Non | 0 | 1 | 0 | 17 |
| fileditch downloader | Non | 0 | 1 | 0 | 10 |
| ko đc | Non | 0 | 1 | 0 | 3 |
| mp3 fetch | Non | 0 | 1 | 0 | 50 |
| mp3 tiktok | Non | 0 | 1 | 0 | 128 |
| mp4 tiktok | Non | 0 | 1 | 0 | 10 |
| pasar de video a mp3 | Non | 0 | 1 | 0 | 91 |
| reel fetch | Non | 0 | 1 | 0 | 55 |
| télécharger vidéo tiktok mp4 | Non | 0 | 1 | 0 | 55 |
| video fatch | Non | 0 | 1 | 0 | 1 |
| video fetch app | Non | 0 | 6 | 0 | 5,3 |
| video fetch download | Non | 0 | 4 | 0 | 6,8 |
| videofrtch | Non | 0 | 1 | 0 | 2 |
| vidsfetch | Non | 0 | 4 | 0 | 18,5 |
| why cant i save videos on tiktok | Non | 0 | 2 | 0 | 8 |
| تحويل الفيديو الى gif | Non | 0 | 1 | 0 | 93 |

### Pages — toutes les lignes retournées

Les variantes de domaine et de slash sont conservées telles que Google les rapporte. Les sommes par page peuvent différer du total par propriété.

| URL | Clics | Impressions | CTR % | Position |
| --- | --- | --- | --- | --- |
| https://www.vidfetch.app/ | 49 | 470 | 10,43 | 6,9 |
| https://vidfetch.app/ | 6 | 178 | 3,37 | 3,7 |
| https://vidfetch.app/de/ | 2 | 12 | 16,67 | 6,7 |
| https://vidfetch.app/pt/ | 2 | 12 | 16,67 | 5,8 |
| https://vidfetch.app/id/ | 1 | 8 | 12,5 | 6,6 |
| https://vidfetch.app/ar/ | 0 | 7 | 0 | 7,7 |
| https://vidfetch.app/ar/%D8%A7%D9%84%D8%B4%D8%B1%D9%88%D8%B7-%D9%88%D8%A7%D9%84%D8%AE%D8%B5%D9%88%D8%B5%D9%8A%D8%A9 | 0 | 2 | 0 | 9 |
| https://vidfetch.app/ar/video-ila-gif | 0 | 1 | 0 | 93 |
| https://vidfetch.app/blog/save-tiktok-phone-gallery | 0 | 3 | 0 | 7 |
| https://vidfetch.app/blog/why-cant-i-save-tiktok | 0 | 19 | 0 | 6,8 |
| https://vidfetch.app/de/rechtliches | 0 | 7 | 0 | 7 |
| https://vidfetch.app/es | 0 | 2 | 0 | 9 |
| https://vidfetch.app/es/ | 0 | 12 | 0 | 9 |
| https://vidfetch.app/es/aviso-legal | 0 | 2 | 0 | 7,5 |
| https://vidfetch.app/es/convertir-video-a-mp3 | 0 | 1 | 0 | 91 |
| https://vidfetch.app/es/tiktok-a-mp3 | 0 | 7 | 0 | 64 |
| https://vidfetch.app/fr/ | 0 | 14 | 0 | 3,8 |
| https://vidfetch.app/fr/mentions-legales | 0 | 2 | 0 | 10 |
| https://vidfetch.app/fr/telecharger-video-tiktok | 0 | 2 | 0 | 32,5 |
| https://vidfetch.app/id | 0 | 4 | 0 | 8,5 |
| https://vidfetch.app/id/ketentuan-dan-privasi | 0 | 4 | 0 | 10 |
| https://vidfetch.app/it/ | 0 | 5 | 0 | 5,8 |
| https://vidfetch.app/it/note-legali | 0 | 2 | 0 | 11 |
| https://vidfetch.app/legal | 0 | 9 | 0 | 7,1 |
| https://vidfetch.app/pt | 0 | 1 | 0 | 9 |
| https://vidfetch.app/pt/termos-e-privacidade | 0 | 3 | 0 | 11,3 |
| https://vidfetch.app/tiktok-to-mp3 | 0 | 6 | 0 | 28,7 |

### Pays

Dix premiers pays par clics, plus les marchés demandés absents de ce groupe ; codes ISO à trois lettres de Google.

| Pays (code Google) | Clics | Impressions | CTR % | Position |
| --- | --- | --- | --- | --- |
| pak | 10 | 71 | 14,08 | 7 |
| idn | 6 | 42 | 14,29 | 7,1 |
| ind | 5 | 85 | 5,88 | 5,9 |
| usa | 5 | 122 | 4,1 | 6,2 |
| phl | 4 | 31 | 12,9 | 4,7 |
| bra | 3 | 20 | 15 | 8,9 |
| can | 3 | 19 | 15,79 | 3,1 |
| gbr | 3 | 42 | 7,14 | 5,7 |
| deu | 2 | 12 | 16,67 | 5,1 |
| nga | 2 | 7 | 28,57 | 4,9 |
| fra | 0 | 15 | 0 | 3,9 |
| mex | 0 | 3 | 0 | 8 |

### Appareils

| Appareil | Clics | Impressions | CTR % | Position |
| --- | --- | --- | --- | --- |
| MOBILE | 38 | 440 | 8,64 | 6,3 |
| DESKTOP | 20 | 267 | 7,49 | 8,9 |
| TABLET | 1 | 13 | 7,69 | 3,6 |

### Indexation et sitemap

L'inventaire OpenSEO a été actualisé après le crawl : 83 URL au total, dont les 82 pages indexables inspectées dans Google et une URL technique exclue. Ce décompte décrit **cet inventaire**, pas toutes les URL historiques de la propriété de domaine. La première lecture avant synchronisation affichait 82 URL non inspectées : il ne fallait pas l'interpréter comme zéro page indexée. La synchronisation OpenSEO a ensuite effectué les 82 inspections gratuites. Le premier appel manuel d'inspection d'un lot de dix a dépassé le délai client ; une inspection unitaire de `/` a réussi. Les tableaux s'appuient sur l'inventaire complet mis à jour.

| État Google / inventaire | Nombre |
| --- | --- |
| Submitted and indexed | 64 |
| Non indexées — total | 18 |
| ↳ Excluded by ‘noindex’ tag | 9 |
| ↳ URL is unknown to Google | 5 |
| ↳ Discovered - currently not indexed | 2 |
| ↳ Crawled - currently not indexed | 2 |
| Non inspectées parmi les 82 | 0 |
| URL technique exclue de l’inventaire éditorial | 1 |

18 URL non indexées, avec l'état renvoyé par Google et sa dernière exploration connue :

| URL | Motif Google | Dernière exploration UTC |
| --- | --- | --- |
| https://vidfetch.app/blog | Excluded by ‘noindex’ tag | 2026-10-18T15:29:50.000Z |
| https://vidfetch.app/blog/720p-1080p-4k | Discovered - currently not indexed | Aucune retournée |
| https://vidfetch.app/blog/backup-your-videos | URL is unknown to Google | Aucune retournée |
| https://vidfetch.app/blog/bitrate-vs-resolution | Excluded by ‘noindex’ tag | 2026-10-25T21:53:46.000Z |
| https://vidfetch.app/blog/h264-h265-av1 | Excluded by ‘noindex’ tag | 2026-10-19T00:49:08.000Z |
| https://vidfetch.app/blog/mp3-vs-m4a | Excluded by ‘noindex’ tag | 2026-10-18T22:16:17.000Z |
| https://vidfetch.app/blog/mp4-vs-webm | URL is unknown to Google | Aucune retournée |
| https://vidfetch.app/blog/reduce-video-size | Excluded by ‘noindex’ tag | 2026-10-18T20:19:40.000Z |
| https://vidfetch.app/blog/save-tiktok-sound-mp3 | Crawled - currently not indexed | 2026-10-30T22:15:07.000Z |
| https://vidfetch.app/blog/video-download-fails | Excluded by ‘noindex’ tag | 2026-10-19T22:23:29.000Z |
| https://vidfetch.app/blog/video-format-smartphone | Excluded by ‘noindex’ tag | 2026-10-18T21:28:59.000Z |
| https://vidfetch.app/blog/video-to-audio | Excluded by ‘noindex’ tag | 2026-10-22T19:25:51.000Z |
| https://vidfetch.app/fr/compresser-video | Discovered - currently not indexed | Aucune retournée |
| https://vidfetch.app/fr/guides | Excluded by ‘noindex’ tag | 2026-10-18T22:31:01.000Z |
| https://vidfetch.app/fr/guides/pourquoi-impossible-enregistrer-tiktok | URL is unknown to Google | Aucune retournée |
| https://vidfetch.app/fr/guides/recuperer-son-tiktok-mp3 | URL is unknown to Google | Aucune retournée |
| https://vidfetch.app/it/tiktok-in-mp3 | URL is unknown to Google | Aucune retournée |
| https://vidfetch.app/pt/tiktok-para-mp3 | Crawled - currently not indexed | 2026-10-30T19:43:11.000Z |

Les neuf anciens verdicts `noindex` concernent des pages désormais indexables selon le crawl du 06/11 : ils décrivent la dernière copie connue de Google, pas un `noindex` actuellement constaté. Les neuf autres exclusions sont des états de découverte/exploration, sans cause technique précise établie par ces seules réponses. Les canoniques Google non nulles de l'inventaire correspondent aux URL inspectées ; aucun décalage constaté dans ces champs. Aucune demande de réindexation n'a été envoyée.

| Sitemap Google | URL soumises | Dernière soumission UTC | Dernière lecture UTC | En attente | Erreurs | Avertissements |
| --- | --- | --- | --- | --- | --- | --- |
| https://vidfetch.app/sitemap.xml | 82 | 2026-11-02T16:47:07.213Z | 2026-11-05T11:05:33.117Z | Non | 0 | 0 |

`/robots.txt` et `/sitemap.xml` répondent 200 en contrôle direct. IndexNow reste non activé ; son absence n'est pas assimilée à une panne de Search Console.

## Mots-clés par pays

Les volumes sont des estimations mensuelles du fournisseur, pas le trafic de VidFetch ; la difficulté est un score fournisseur sur 100, pas une garantie de classement. Les métriques ont été recueillies le 06/11 entre 17:08:37 et 17:08:39 UTC. Aucun CPC, suivi de rang récurrent, suggestion ou recherche de concurrents supplémentaire n'a été demandé.

Pour `keyword_metrics`, le pays ISO a été passé explicitement ; pour `serp`, le nom du pays et la langue ont été passés explicitement. SERP Google sur ordinateur (`device=desktop`). Les sept requêtes exactes sont absentes des requêtes Search Console visibles de la période : **aucune position actuelle du site ne peut en être déduite**. VidFetch est également absent des dix résultats organiques extraits pour chacune ; on ne lui attribue pas arbitrairement une position 11.

| Requête | Pays / langue | Volume mensuel | Difficulté /100 | Page cible existante | Position VidFetch |
| --- | --- | --- | --- | --- | --- |
| tiktok downloader | États-Unis (us) / en | 450 000 | 14 | https://vidfetch.app/tiktok-video-downloader | ND en GSC ; absent du top 10 organique |
| download video tiktok | Indonésie (id) / id | 16 600 000 | 12 | https://vidfetch.app/id/download-video-tiktok | ND en GSC ; absent du top 10 organique |
| baixar vídeo tiktok | Brésil (br) / pt | 135 000 | 24 | https://vidfetch.app/pt/baixar-video-tiktok | ND en GSC ; absent du top 10 organique |
| descargar videos de tiktok | Mexique (mx) / es | 823 000 | 8 | https://vidfetch.app/es/descargar-video-tiktok | ND en GSC ; absent du top 10 organique |
| video to mp3 | États-Unis (us) / en | 110 000 | 18 | https://vidfetch.app/video-to-mp3 | ND en GSC ; absent du top 10 organique |
| compress video | États-Unis (us) / en | 33 100 | 72 | https://vidfetch.app/compress-video | ND en GSC ; absent du top 10 organique |
| convertir vidéo en mp3 | France (fr) / fr | 2 400 | 0 | https://vidfetch.app/fr/convertir-video-en-mp3 | ND en GSC ; absent du top 10 organique |

Priorités suggérées pour la revue : la page française de conversion MP3 (difficulté 0, volume 2 400), puis TikTok au Mexique (8, 823 000) et en Indonésie (12, 16 600 000). Il s'agit d'un tri par adéquation de la page et métriques fournisseur : les volumes très élevés demandent de rester prudent sur le potentiel réellement accessible. `compress video` présente une difficulté nettement supérieure (72). Pour la requête anglaise TikTok, `/tiktok-video-downloader` est la cible spécialisée proposée ; l'accueil conserve son rôle général. Aucun changement de contenu ou de maillage n'est effectué ici.

### Dix premiers résultats organiques actuels

Les premiers appels `depth=10` incluaient des blocs IA/vidéos et ne donnaient pas dix liens organiques. Après un nouveau `dry_run`, des appels `depth=20` ont permis d'en extraire dix par requête. Les tableaux ci-dessous utilisent ces derniers appels, sans mélanger les deux instantanés : des changements d'ordre ont été observés entre les appels. « Position source » est la position mixte renvoyée par OpenSEO ; le rang organique est calculé en retirant les blocs non organiques. Des résultats d'un même domaine peuvent apparaître plusieurs fois. Plusieurs URL fournies sont des redirections opaques Google : leur chemin final n'est pas reconstruit ni inventé, le domaine et le titre sont conservés.

#### « tiktok downloader » — États-Unis, en

Instantané OpenSEO : `2026-11-06T17:38:30.643Z` ; `locationName="United States"`.

| Rang organique | Position source | Domaine | Titre retourné |
| --- | --- | --- | --- |
| 1 | 1 | reddit.com | I built a simple site to download TikTok & Instagram videos ... |
| 2 | 3 | tools.trendsee.io | TikTok Downloader — Save Videos in HD Without Watermark |
| 3 | 4 | tiktokio.world | TikTokio - TikTok Video Download Without Watermark in ... |
| 4 | 5 | robinreach.com | TikTok Video Downloader without watermark |
| 5 | 6 | play.google.com | Video Downloader for Tik Video - Apps on Google Play |
| 6 | 7 | scalar.missouri.edu | Best TikTok Downloaders: 2025 Ultimate List to Save ... |
| 7 | 8 | storytik.app | StoryTik: TikTok Downloader Without Watermark – Free |
| 8 | 9 | savefrommedia.com | TikTok, Facebook & Instagram Video Downloader |
| 9 | 10 | snaptikto.com | snaptik - TikTok Video Downloader Without Watermark |
| 10 | 12 | ssstoks.com | SSSToks — TikTok Video Downloader (No Watermark, HD ... |

#### « download video tiktok » — Indonésie, id

Instantané OpenSEO : `2026-11-06T17:38:46.247Z` ; `locationName="Indonesia"`.

| Rang organique | Position source | Domaine | Titre retourné |
| --- | --- | --- | --- |
| 1 | 1 | ssstik.io | Download Video TikTok Tanpa Watermark HD 1080p & ... |
| 2 | 2 | snaptik.com.pl | Unduh Video TikTok Tanpa Watermark — MP4 HD & 4K |
| 3 | 4 | ssstiktok.me | Unduh Video TikTok HD Tanpa Watermark Free - SSSTikTok |
| 4 | 5 | snaptik.fi | Download Video TikTok HD 1080p & 4K Tanpa Watermark ... |
| 5 | 6 | kol.id | Download Video TikTok Tanpa Watermark Full HD Gratis |
| 6 | 7 | snaptik.app | Download Video Tiktok Tanpa Watermark HD - SnapTik |
| 7 | 9 | play.google.com | Download video no watermark - Aplikasi di ... |
| 8 | 10 | manypage.id | Tiktok Downloader Tanpa Watermark (Kualitas HD Terbaik) |
| 9 | 12 | snaptik.org | Download Video Tiktok Tanpa Watermark |
| 10 | 13 | savefrominternet.com | TikTok Downloader – Free HD Video, Photo & MP3 |

#### « baixar vídeo tiktok » — Brésil, pt

Instantané OpenSEO : `2026-11-06T17:38:51.721Z` ; `locationName="Brazil"`.

| Rang organique | Position source | Domaine | Titre retourné |
| --- | --- | --- | --- |
| 1 | 1 | fastcompanybrasil.com | Como baixar um vídeo do TikTok? Aprenda de maneira ... |
| 2 | 3 | tiktok.com | Ferramenta de transferência do TikTok - Transfere vídeos ... |
| 3 | 4 | play.google.com | TikTok - Videos, Shop & LIVE |
| 4 | 5 | techtudo.com.br | Como baixar vídeo do TikTok com e sem marca d'água no ... |
| 5 | 6 | transcreve.ai | Baixar Vídeos do TikTok em MP4 - Transcreve.ai |
| 6 | 7 | youtube.com | Como Baixar Vídeos do Tik Tok no Computador Sem Usar ... |
| 7 | 8 | tiktokio.com | Baixar video TikTok sem marca d'água em 5s |
| 8 | 9 | canaltech.com.br | Como baixar vídeos do TikTok sem marca d'água |
| 9 | 10 | snapreels.net | Download de vídeo TikTok sem marca d'água |
| 10 | 12 | youtube.com | Updated Tutorial: Download TikTok Videos ... |

#### « descargar videos de tiktok » — Mexique, es

Instantané OpenSEO : `2026-11-06T17:38:59.715Z` ; `locationName="Mexico"`.

| Rang organique | Position source | Domaine | Titre retourné |
| --- | --- | --- | --- |
| 1 | 1 | play.google.com | Descargador Video TT sin Marca - Apps en ... |
| 2 | 3 | youtube.com | Cómo Descargar Videos de TikTok Para ESTADOS ... |
| 3 | 4 | marketing4ecommerce.mx | Cómo descargar un vídeo de TikTok sin marcas de agua |
| 4 | 5 | apps.microsoft.com | Descargar videos TT gratis – sin marca de agua |
| 5 | 6 | flixier.com | Descargador de TikTok en línea |
| 6 | 7 | snaptik.org | Descargar TikTok Sin Marca De Agua |
| 7 | 8 | quora.com | ¿Cómo puedo habilitar o deshabilitar las descargas de mis ... |
| 8 | 9 | robinreach.com | Descargar videos de TikTok sin marca de agua gratis |
| 9 | 10 | capcut.com | Descarga videos de TikTok y haz edición creativa |
| 10 | 12 | marketing4ecommerce.mx | Cómo descargar un vídeo de TikTok sin marcas de agua |

#### « video to mp3 » — États-Unis, en

Instantané OpenSEO : `2026-11-06T17:38:33.594Z` ; `locationName="United States"`.

| Rang organique | Position source | Domaine | Titre retourné |
| --- | --- | --- | --- |
| 1 | 1 | play.google.com | Video to MP3: Video Converter - Apps on Google Play |
| 2 | 4 | youtube.com | How to convert Video to MP3 |
| 3 | 5 | shotstack.io | Video to MP3 Converter |
| 4 | 6 | audiotranscriber.io | Free YouTube to MP3 Converter Online (Fast & Unlimited) |
| 5 | 7 | freeconvert.com | MP4 to MP3 Converter - FreeConvert.com |
| 6 | 8 | play.google.com | Video to MP3 Audio Converter - Apps on Google Play |
| 7 | 9 | apps.microsoft.com | MP3 Converter – Video to MP3 & Audio Extractor |
| 8 | 10 | play.google.com | Video to MP3 Converter・2Audio - Apps on Google Play |
| 9 | 12 | ezgif.com | Video to MP3 Converter — Extract Audio Online |
| 10 | 13 | apowersoft.com | Comprehensive Guide on How to Convert Videos to MP3 |

#### « compress video » — États-Unis, en

Instantané OpenSEO : `2026-11-06T17:38:40.642Z` ; `locationName="United States"`.

| Rang organique | Position source | Domaine | Titre retourné |
| --- | --- | --- | --- |
| 1 | 1 | adobe.com | Reduce video file size: Ultimate guide |
| 2 | 3 | play.google.com | Video compressor - Reduce size - Apps on Google Play |
| 3 | 4 | freefileconvert.com | Video Compressor (Free & Online) |
| 4 | 5 | reddit.com | Video compressor? I need to shrink a 1080p 2GB video file ... |
| 5 | 6 | redpandacompress.com | Free Online Video Compressor – Fast, Private |
| 6 | 7 | videotok.app | Free Video Compressor Online - Compress MP4, MOV ... |
| 7 | 8 | videocandy.com | Compress Video Online |
| 8 | 9 | picsart.com | Free Video Compressor \| Reduce Video File Size Online |
| 9 | 10 | tinywow.com | Compress Video MP4 File Size Online Free |
| 10 | 12 | youtube.com | FREE tool to compress video to a desired size |

#### « convertir vidéo en mp3 » — France, fr

Instantané OpenSEO : `2026-11-06T17:39:03.597Z` ; `locationName="France"`.

| Rang organique | Position source | Domaine | Titre retourné |
| --- | --- | --- | --- |
| 1 | 2 | play.google.com | Mp4 to Mp3 Converter |
| 2 | 3 | kapwing.com | Convertir Vidéo En MP3, MP4, GIF, MOV Gratuitement |
| 3 | 4 | clubic.com | Télécharger Free Video to MP3 Converter (gratuit) Windows |
| 4 | 5 | livestorm.co | Convertisseur vidéo en MP3 - Gratuit et en ligne |
| 5 | 6 | videotranscriber.ai | Convertisseur YouTube vers MP3 Gratuit |
| 6 | 7 | aiseesoft.fr | 3 méthodes pratiques de convertir une vidéo en MP3 - Aiseesoft |
| 7 | 8 | play.google.com | Convertisseur MP3 - MP4 to MP3 – Applications sur ... |
| 8 | 9 | freeconvert.com | Video to MP3 Converter - FreeConvert.com |
| 9 | 10 | vivideo.ai | Convertir une vidéo en MP3 en ligne, gratuit |
| 10 | 12 | movavi.com | Convertisseur vidéo en ligne − Convertir des vidéos en ... |

## Coût et respect du budget

Chaque opération payante a été précédée d'un `dry_run` correspondant au pays, à la langue et à la profondeur utilisés. Les appels réels avaient des plafonds **plus restrictifs** que 2 USD : `max_cost_usd=0.04` par lot de métriques, `0.01` par SERP de profondeur 10, `0.02` par SERP de profondeur 20 et `0.05` par Lighthouse. La somme de ces plafonds vaut 0,61 USD : le plafond global de mission ne dépend donc pas d'un plafond de 2 USD répété indépendamment à chaque appel. Aucun `refresh=true` n'a été demandé.

| Opération | Appels réels | Dépense USD |
| --- | --- | --- |
| Métriques par pays (3 requêtes US groupées, 4 lots nationaux) | 5 | 0,20 |
| SERP initiales, profondeur 10 | 7 | 0,07 |
| SERP complétées, profondeur 20 | 7 | 0,14 |
| Lighthouse mobile | 4 | 0,20 |
| Crawl, Search Console, inspections, dry_run et contrôles locaux | Gratuits | 0,00 |
| Total mission | 23 appels payants | 0,61 |
| Plafond autorisé | Global | 2,00 |
| Budget non utilisé |  | 1,39 |

Les 23 appels payants renvoient `cached=false` ; coût comptabilisé à partir des champs `costUsd`, pas d'une estimation mensuelle du compte. Les coûts Lighthouse (0,20 USD) sont inclus malgré l'hypothèse initiale de gratuité. Les clés, emails personnels, identifiants de compte Google et valeurs IndexNow ne sont pas reproduits dans ce rapport.

## Annexe — 82 URL concernées par l'alerte du lien email

Toutes sont en 200 et indexables dans l'inventaire du crawl. Cette liste fixe le périmètre exact de l'alerte répétée ; la 404 technique `/cdn-cgi/l/email-protection` est une URL supplémentaire, hors sitemap.

| Langue | URL |
| --- | --- |
| ar | https://vidfetch.app/ar |
| ar | https://vidfetch.app/ar/%D8%A7%D9%84%D8%B4%D8%B1%D9%88%D8%B7-%D9%88%D8%A7%D9%84%D8%AE%D8%B5%D9%88%D8%B5%D9%8A%D8%A9 |
| ar | https://vidfetch.app/ar/daght-video |
| ar | https://vidfetch.app/ar/qass-video |
| ar | https://vidfetch.app/ar/tahmil-video-tiktok |
| ar | https://vidfetch.app/ar/tahwil-video-ila-mp3 |
| ar | https://vidfetch.app/ar/tiktok-mp3 |
| ar | https://vidfetch.app/ar/video-ila-gif |
| de | https://vidfetch.app/de |
| de | https://vidfetch.app/de/rechtliches |
| de | https://vidfetch.app/de/tiktok-video-herunterladen |
| de | https://vidfetch.app/de/tiktok-zu-mp3 |
| de | https://vidfetch.app/de/video-in-gif |
| de | https://vidfetch.app/de/video-in-mp3-umwandeln |
| de | https://vidfetch.app/de/video-komprimieren |
| de | https://vidfetch.app/de/video-schneiden |
| en | https://vidfetch.app/ |
| en | https://vidfetch.app/blog |
| en | https://vidfetch.app/blog/720p-1080p-4k |
| en | https://vidfetch.app/blog/backup-your-videos |
| en | https://vidfetch.app/blog/bitrate-vs-resolution |
| en | https://vidfetch.app/blog/h264-h265-av1 |
| en | https://vidfetch.app/blog/mp3-vs-m4a |
| en | https://vidfetch.app/blog/mp4-vs-webm |
| en | https://vidfetch.app/blog/reduce-video-size |
| en | https://vidfetch.app/blog/save-tiktok-phone-gallery |
| en | https://vidfetch.app/blog/save-tiktok-sound-mp3 |
| en | https://vidfetch.app/blog/video-download-fails |
| en | https://vidfetch.app/blog/video-format-smartphone |
| en | https://vidfetch.app/blog/video-to-audio |
| en | https://vidfetch.app/blog/why-cant-i-save-tiktok |
| en | https://vidfetch.app/compress-video |
| en | https://vidfetch.app/legal |
| en | https://vidfetch.app/tiktok-to-mp3 |
| en | https://vidfetch.app/tiktok-video-downloader |
| en | https://vidfetch.app/trim-video |
| en | https://vidfetch.app/video-to-gif |
| en | https://vidfetch.app/video-to-mp3 |
| es | https://vidfetch.app/es |
| es | https://vidfetch.app/es/aviso-legal |
| es | https://vidfetch.app/es/comprimir-video |
| es | https://vidfetch.app/es/convertir-video-a-mp3 |
| es | https://vidfetch.app/es/cortar-video |
| es | https://vidfetch.app/es/descargar-video-tiktok |
| es | https://vidfetch.app/es/tiktok-a-mp3 |
| es | https://vidfetch.app/es/video-a-gif |
| fr | https://vidfetch.app/fr |
| fr | https://vidfetch.app/fr/compresser-video |
| fr | https://vidfetch.app/fr/convertir-video-en-mp3 |
| fr | https://vidfetch.app/fr/couper-video |
| fr | https://vidfetch.app/fr/guides |
| fr | https://vidfetch.app/fr/guides/enregistrer-tiktok-galerie-iphone-android |
| fr | https://vidfetch.app/fr/guides/pourquoi-impossible-enregistrer-tiktok |
| fr | https://vidfetch.app/fr/guides/recuperer-son-tiktok-mp3 |
| fr | https://vidfetch.app/fr/mentions-legales |
| fr | https://vidfetch.app/fr/telecharger-video-tiktok |
| fr | https://vidfetch.app/fr/tiktok-en-mp3 |
| fr | https://vidfetch.app/fr/video-en-gif |
| id | https://vidfetch.app/id |
| id | https://vidfetch.app/id/download-video-tiktok |
| id | https://vidfetch.app/id/ketentuan-dan-privasi |
| id | https://vidfetch.app/id/kompres-video |
| id | https://vidfetch.app/id/konversi-video-ke-mp3 |
| id | https://vidfetch.app/id/potong-video |
| id | https://vidfetch.app/id/tiktok-ke-mp3 |
| id | https://vidfetch.app/id/video-ke-gif |
| it | https://vidfetch.app/it |
| it | https://vidfetch.app/it/comprimere-video |
| it | https://vidfetch.app/it/convertire-video-in-mp3 |
| it | https://vidfetch.app/it/note-legali |
| it | https://vidfetch.app/it/scaricare-video-tiktok |
| it | https://vidfetch.app/it/tagliare-video |
| it | https://vidfetch.app/it/tiktok-in-mp3 |
| it | https://vidfetch.app/it/video-in-gif |
| pt | https://vidfetch.app/pt |
| pt | https://vidfetch.app/pt/baixar-video-tiktok |
| pt | https://vidfetch.app/pt/comprimir-video |
| pt | https://vidfetch.app/pt/converter-video-para-mp3 |
| pt | https://vidfetch.app/pt/cortar-video |
| pt | https://vidfetch.app/pt/termos-e-privacidade |
| pt | https://vidfetch.app/pt/tiktok-para-mp3 |
| pt | https://vidfetch.app/pt/video-para-gif |

## Vérification de la livraison

Branche : `docs/seo-audit-2026-11-06`. Diff attendu par rapport à `main` : le seul fichier `docs/seo/AUDIT-OPENSEO-2026-11-06.md`. Rapport relu contre les réponses MCP : 82 URL, 64 + 18 verdicts Google, 7 mots-clés / 5 pays, 70 résultats organiques, 4 mesures Lighthouse et 0,61 USD. Les contrôles sont documentaires ; aucun build ou test applicatif n'est nécessaire pour ce fichier seul. PR ouverte sans fusion ; les corrections attendent la revue.


## Suivi — vague SEO 3 (préparation du 07/11/2026)

La vague `feat/seo-wave-3` utilise cet audit comme état initial. Elle ajoute les trois guides TikTok en id/pt-BR/es, puis en de/it/ar pour assurer le bloc Guides dans les huit langues : 18 adaptations, 24 nouveaux chemins avec les six index locaux, soit 106 URL attendues. Les 70 autres traductions en revue restent non publiées. Les pages MP3 ES et FR, le maillage local, le lien d’abus non obfusqué et les en-têtes applicatifs sont renforcés. Le HTML initial de l’accueil contenait déjà les sept OG locales alternatives : leur contrôle est étendu, sans présenter ce constat comme une panne corrigée.

À cette étape, la validation locale comprend 196 tests Node réussis, lint, typecheck, build OVH local Webpack et seo-check sur 106 URL sans orphelines. La CI Linux, la fusion, la vérification publique et le nouvel audit OpenSEO gratuit restent à effectuer. Aucun résultat après déploiement n’est revendiqué ici. Le coût de la mission d’audit initial reste 0,61 USD ; le crawl de suivi sera exécuté sans rendu ni proxy payants.


## Résultat de la vague SEO 3 — vérification du 7 novembre 2026

La [PR #38](https://github.com/aouirdani/vidfetch/pull/38) a été fusionnée après la [CI complète verte](https://github.com/aouirdani/vidfetch/actions/runs/42319792700), puis activée par le [run main 42354097509](https://github.com/aouirdani/vidfetch/actions/runs/42354097509), release `f09273569ca7b94859f413d24211d35faf83cbd9`.

Un contrôle HTTP a ensuite confirmé que Cloudflare transformait aussi les adresses écrites en texte dans les pages légales. La [PR #39](https://github.com/aouirdani/vidfetch/pull/39) étend donc l'exclusion à ces paragraphes. Elle est fusionnée après la [CI verte du complément](https://github.com/aouirdani/vidfetch/actions/runs/42360231821) et activée par le [run main 42362083325](https://github.com/aouirdani/vidfetch/actions/runs/42362083325). Release publique vérifiée : `7a8da1996057a18c63b27bbe1289555b87ec2b99`.

### Changements livrés

- Les trois guides TikTok existent dans les huit langues : neuf adaptations id/pt-BR/es demandées pour les grands marchés, plus neuf en de/it/ar pour fournir le bloc Guides local sur chacun des huit accueils. Total : 18 nouveaux articles, six nouveaux index de guides et 106 URL indexables. Les 70 autres traductions en revue restent fermées.
- Slugs locaux, BlogPosting, hreflang réciproque, sitemap et liens MP4/MP3 locaux ; trois guides depuis chaque accueil et chaque page TikTok. Les guides FR renvoient aussi vers le convertisseur MP3 local.
- Texte et FAQ MP3 espagnols renforcés pour les requêtes observées ; title/H1 français alignés et étapes pratiques ajoutées, sans changement des formats ni des limites du moteur.
- Mailto de signalement présent dans le HTML initial ; adresses légales protégées elles aussi. Cloudflare consomme les commentaires `email_off` après traitement : le contrôle public vérifie donc le lien final et l'absence d'ancres techniques.
- En-têtes applicatifs HSTS, SAMEORIGIN, Referrer-Policy et CSP uniquement Report-Only. La politique déclare les sources Turnstile, workers et WebAssembly ; la conversion locale et son téléchargement sont vérifiés en production. Les transferts TikTok de la CI utilisent des réponses simulées, sans téléchargement d'un média tiers pour cet audit.
- Les OG alternatives suivent exactement les versions existantes : sept autres locales pour les pages proposées dans les huit langues. Ces sept balises existaient déjà sur l'accueil avant la vague ; leur contrôle a été renforcé.

### Vérification publique

Contrôle navigateur : `2026-11-07T11:34:40.317Z`. L'API publique annonce la release attendue, le frontend prêt et les téléchargements disponibles, comme avant la vague. Le vérificateur SEO a parcouru **106 URL publiques**, sans JavaScript pour l'analyse du HTML : HTTP 200, indexabilité, canonical, hreflang réciproque, OG, sitemap, FAQ/JSON-LD, liens internes et absence de pages orphelines. Les en-têtes et le mailto brut sont contrôlés sur chaque URL ; aucune ancre `/cdn-cgi/l/email-protection` ne subsiste dans ce périmètre.

Dans Chromium à 390 px, les huit accueils et seize pages TikTok ont chacun trois guides locaux, sept OG alternatives et aucun débordement horizontal. Une vidéo synthétique de deux secondes a été convertie en MP3 et téléchargée via le parcours navigateur : **49083 octets**, durée **2.038617 s**, zéro requête d'envoi de média ou vers un tiers pendant la conversion. L'enregistrement du service worker de téléchargement est actif ; sa portée reste `/local-media/download/` et ne couvre pas la page de conversion. Le sélecteur natif de sauvegarde a été désactivé dans ce test headless pour exercer le téléchargement navigateur.

La validation locale et la CI couvrent aussi les huit langues/RTL, 24 transferts simulés, 26 sorties locales vérifiées par ffprobe et huit sorties OPFS. Les tests des contacts couvrent les 24 paragraphes publics des huit langues et l'échappement HTML. Aucun changement du gateway ou des moteurs n'a été livré.

### Lighthouse CI déjà exécuté, sans nouvel appel OpenSEO payant

Médianes de trois passes mobiles du run PR #38 `42319792700`, artefact `lighthouse-0e690b56c77a3c844d3db5197d44747a32eeb97f`. Ces mesures Linux CI ne sont pas directement comparables à la mesure OpenSEO unitaire de l'audit initial.

| Page | Performance | Accessibilité | Bonnes pratiques | SEO | LCP médian ms | TBT médian ms | CLS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 94 | 100 | 100 | 100 | 2702 | 162 | 0 |
| `/ar` | 94 | 100 | 100 | 100 | 2717 | 192 | 0 |
| `/blog/why-cant-i-save-tiktok` | 95 | 100 | 100 | 100 | 2704 | 126.5 | 0 |
| `/fr` | 95 | 100 | 100 | 100 | 2720 | 143 | 0 |
| `/id/download-video-tiktok` | 95 | 100 | 100 | 100 | 2715 | 145.5 | 0 |
| `/video-to-mp3` | 96 | 100 | 100 | 100 | 2717 | 123.5 | 0 |

Les critères bloquants du workflow sont verts. Performance/LCP/TBT restent des avertissements, conformément aux critères retenus avant cette vague ; aucun seuil n'a été abaissé pour la fusion. Le LCP CI autour de 2,7 s est conservé ici comme observation.

### Audit OpenSEO gratuit de suivi — accès à rétablir

Le 07/11, le serveur MCP OpenSEO local répond **HTTP 401** à `whoami`, `list_projects` et au `dry_run` de `start_site_audit`. La présence de la clé configurée dans l'environnement a été vérifiée sans afficher sa valeur. La nouvelle vérification après déploiement est elle aussi refusée. Le service demande une connexion OAuth ou une clé OpenSEO valide. La reconnexion a été demandée ; aucune réponse de rétablissement n'était disponible au moment de ce bilan.

Paramètres préparés : projet `0289621d-1d2e-411b-b57b-df52dc7f5515`, `start_url=https://vidfetch.app`, `max_pages=1000`, `render_mode=off`, `use_fallback=false`, `dry_run=true` avant toute exécution. **Aucun audit de suivi n'a été créé**, aucun rendu ni proxy payant n'a été lancé. Après reconnexion, refaire le dry-run, confirmer le coût gratuit, lancer le crawl sans rendu/fallback puis consigner son identifiant, sa couverture, son score et ses alertes.

Le contrôle public indépendant vérifie 106 URL et l'absence de liens internes cassés ou de pages orphelines. Il ne remplace pas un résultat OpenSEO : le dernier score OpenSEO disponible demeure **9/100 sur l'état du 06/11**, avec 91 URL explorées et 82 indexables. Aucun score amélioré ni disparition d'alertes dans OpenSEO n'est revendiqué avant son nouveau crawl.

Le suivi ne mesure pas encore un gain de position ou d'indexation. Les chiffres Search Console de l'audit restent ceux du 07/10–03/11. Les 404 des plateformes verrouillées et les exclusions techniques robots.txt restent intentionnelles.

### Coût cumulé

Audit initial et recherches du 06/11 : **0,61 USD**. Cette vague et ses contrôles locaux/CI : **0 USD de crédits OpenSEO supplémentaires**. Les tentatives MCP ont été refusées avant création d'audit. Total consommé de la mission : **0,61 USD sur 2 USD autorisés**. Aucun nouveau lookup de mots-clés, SERP ou Lighthouse payant n'a été lancé.
