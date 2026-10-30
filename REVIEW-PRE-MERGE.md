# Revue avant fusion — seo/refonte

**Verdict : NO-GO pour une fusion automatique immédiate, tant que l’application coordonnée des redirections Caddy et Cloudflare n’est pas confirmée ; les trois défauts de code/validation trouvés ont été corrigés et la CI finale est verte.**

Revue du 30 octobre 2026, comparaison `origin/main` = `4fc94dd7` et code final `a84171ec`. Travail exclusivement sur `seo/refonte`, sans fusion, sans push sur main, sans modification de serveur ni de règle Cloudflare en production. Les seules requêtes vers le site en ligne ont été des lectures de pages publiques.

## Tableau des neuf vérifications

| Vérification | État | Conclusion |
|---|---|---|
| 1. Disparition du noindex en production | ⚠️ | La cause applicative est corrigée et le proxy public testé n’en réintroduit pas ; fichier Caddy actif et règles privées Cloudflare non consultables depuis le dépôt. |
| 2. Artefact et Caddy réels | ✅ | Build standalone Linux x64/Node 22.23.3 via le script CI, image enveloppe de test, vrai Caddy 2.11.7/TLS local ; 50 URL et variantes contrôlées. La CI teste désormais aussi son véritable artefact après build. |
| 3. Conservation des URL | ✅ | 31 routes éditoriales existantes conservées : 24 en 200, 7 accueils slash en 301 vers leur équivalent ; sept fichiers publics identiques et accessibles. |
| 4. Hygiène du diff | ✅ | Aucun changement d’extraction, conversion, quotas, dépendances, lockfile, contenu légal, analytics/cookies/CSP ni suppression de fichier. Changements d’en-têtes limités au SEO et documentés. |
| 5. Honnêteté et limites | ⚠️ | Aucun retrait de filigrane ni support YouTube garanti dans le contenu exposé ; limites du moteur identifiées, mais unités MB/Mo/MiB et précision des explications varient. Overrides réels du VPS non lus. |
| 6. Traductions et RTL | ⚠️ | Aucun placeholder ni débordement mobile trouvé sur les 50 pages, RTL et URL de formulaire LTR corrects ; relecture native indépendante non réalisée. |
| 7. Produit et tests | ⚠️ | 183 tests applicatifs, backend/passerelle/charge, conversion réelle de fixtures et 24 parcours navigateur passent ; deux scripts historiques hors CI échouent déjà sur main. Aucune vidéo TikTok tierce réellement téléchargée. |
| 8. JSON-LD | ✅ | 50 pages validées contre le vocabulaire schema.org ; 24 FAQ identiques au texte rendu, breadcrumbs vers de vraies URL, aucune note/avis/statistique d’utilisateurs. Cela ne garantit pas des rich results Google. |
| 9. Performance | ⚠️ | JS gzip +0,09 %, LCP stable, CLS nul ; médiane TBT +12 %/+13 % sur deux pages, soit environ 5 ms : signalé, non corrigé pour ce seul résultat de laboratoire. |

## Corrections bloquantes commitées

| Commit | Problème confirmé | Correction et preuve |
|---|---|---|
| `ae327022` — `fix(seo-review): canonicalize host and trailing slash in one redirect` | `https://www.vidfetch.app/id/` passait par deux 301 avant le 200. HTTP + slash pouvait également cumuler les étapes. | Caddy normalise le chemin avant la redirection de domaine/protocole, dans une `route` qui impose l’ordre des directives. Query conservée. Curl derrière le vrai Caddy : une 301 puis 200. |
| `7216e5f6` — `fix(seo-review): audit external origins and every localized tool form` | `seo-check` lançait toujours son propre Next : il ne pouvait pas auditer Caddy ni l’artefact Docker. Les transferts navigateur outils ne couvraient que EN/FR. | Mode origine externe avec Host, SNI et CA explicites, sans désactiver la vérification TLS ; rejet d’autres directives restrictives. Transferts et erreurs de quota vérifiés sur les 16 outils, plus les huit accueils. |
| `a84171ec` — `fix(seo-review): require real Caddy indexing checks after release build` | Le test Python d’indexation publique était ignoré avant build en CI. Avec un build présent, il attendait encore 20 URL, le blog noindex et des 308. | Fixture explicite de 50 URL, aucune page éditoriale noindex ; suppression de la réécriture des anciens slashes dans le test ; 301 attendues. Étape CI obligatoire après build, exécutant **l’app contenue dans l’archive de release**, avec échec si un prérequis manque. Réseau Docker compatible Linux. |

[CI finale réussie sur a84171ec](https://github.com/aouirdani/vidfetch/actions/runs/41049428575), job deploy ignoré. Le nouveau contrôle `Public indexing through real Caddy and the actual release artifact` et le contrôle SEO ont tous deux été exécutés avec succès. Le rapport n’extrapole pas un succès à partir d’un test ignoré.

## 1. Origine exacte du noindex et parité d’environnement

Dans main, `content/guides/*.md`, par exemple `video-download-fails.md:8`, contenait `published: null`. Le texte était accessible, mais `isPublishedGuide` (`src/lib/guides.ts:34`) renvoyait faux. `src/lib/site-pages.ts:8–9` utilisait cette condition pour les articles et pour l’index du blog. `localizedMetadata`, `src/lib/localized-seo.ts:20`, produisait donc `{ index: false, follow: true }`. Le sitemap excluait ces routes. La PR fixe explicitement leur publication au 29 octobre 2026 ; ce n’est pas la date du build. Les trois nouveaux guides FR ont une publication explicitement demandée et un hash du corps EN contrôlé, sans faux relecteur humain.

Lecture publique pendant cette revue : `https://vidfetch.app/blog` → 200, meta `noindex, follow`, aucun `X-Robots-Tag` restrictif observé, `cf-cache-status: DYNAMIC`. Cela confirme la cause applicative actuellement exposée. Derrière le Caddy public et l’artefact de la PR : `index, follow`, 200, aucun en-tête restrictif.

L’indexabilité du contenu **ne dépend pas du hostname ni d’une variable d’environnement Next** : elle vient des statuts/dates des catalogues. `SITE.url` est fixé à `https://vidfetch.app`. Voici les variables réellement pertinentes au chemin de livraison :

| Variable/mode | Valeur déterminable dans les sources | Effet SEO / limite de conclusion |
|---|---|---|
| `VIDFETCH_TARGET` | `ovh` dans le script CI et le modèle `deploy/ovh/web.env.example` | Standalone et API OVH. Le Dockerfile historique utilise `node` et ne représente pas ce déploiement. |
| `NEXT_PUBLIC_SITE_URL` | `https://vidfetch.app` au build CI et dans le modèle runtime | Pas de choix noindex ; canonical principal fixe. |
| `VIDFETCH_CONNECTION_READY` | `0` au build CI ; runtime réel conservé par le déploiement, valeur du fichier privé non lue | Contrôle les téléchargements, pas les robots des pages. Le modèle contient 0, ce n’est pas une preuve de sa valeur active sur le VPS. |
| `NEXT_PUBLIC_DOWNLOADS_UNAVAILABLE`, `NEXT_PUBLIC_SECURE_GATEWAY` | Injectés respectivement à `0` et `1` pour OVH dans `next.config.ts` | Configuration du formulaire ; pas d’indexabilité. |
| `VIDFETCH_ROBOTS_HEADER` | Défaut `noindex, nofollow` dans les anciens modèles `deploy/ovh/launch/Caddyfile.proxied` et `Caddyfile.downloads-approved.example` | **Aucun usage dans les Caddyfiles publics media** ; ne pas activer un modèle de préproduction par erreur. Valeur réelle et fichier Caddy actif inconnus. |
| `CF_PAGES_BRANCH`, `VIDFETCH_PRODUCTION_BRANCH` | `scripts/build-pages.mjs:114–117` marque les previews non-main en noindex (`main` par défaut) | Chemin Cloudflare Pages distinct du proxy Cloudflare → OVH ; ce script n’est pas appelé dans la livraison OVH. |
| `VERCEL`, `VERCEL_ENV` | Non configurés par la construction OVH | Changent la cible des API ; ne réintroduisent pas une meta noindex du blog. |

Les quatre fichiers env versionnés sont uniquement des modèles : `.env.example`, `deploy/ovh/web.env.example`, `deploy/ovh/media/gateway.env.changes.example`, `backend/preproduction/funnel/private.env.example`. Aucun vrai `.env` n’a été ajouté ni lu en production. Les clés Turnstile/signature et autres secrets restent hors du rapport.

Inventaire complet, main **et** PR : [directives-main.md](docs/seo-review/directives-main.md), [directives-pr.md](docs/seo-review/directives-pr.md). On y retrouve metadata Next, generateMetadata, headers et protections des modèles serveur. `src/proxy.ts` ne fait que normaliser les slashes. Restent volontairement noindex : erreurs 404 ; `/_next/*` ; routes techniques API/auth/helper/internal selon le proxy ; previews et modèles privés. Les 70 anciennes traductions de guides en attente ne sont pas servies, donc pas des pages publiques à réindexer. Aucun des 50 documents du sitemap n’est noindex.

**Limite importante :** la CI met à jour l’application via l’archive ; elle n’installe ni ne recharge les Caddyfiles ni les règles de la zone Cloudflare. Supprimer un noindex d’un modèle du dépôt ne prouve pas que ce modèle est le fichier actif du VPS.

## 2. Test réel, protocole et résultats

Il n’existe pas d’« image Docker du pipeline OVH » : `.github/workflows/deploy.yml` appelle `scripts/ovh/build-release.mjs` et déploie une archive standalone. Le `Dockerfile` historique vise une autre architecture (`VIDFETCH_TARGET=node`), installe les moteurs et n’a pas été utilisé comme substitut à la production.

Pour le test demandé, une **image enveloppe** a été construite sous Linux x64, Node **22.23.3**, en exécutant `npm ci --ignore-scripts` puis le véritable `scripts/ovh/build-release.mjs`, `VIDFETCH_TARGET=ovh`, ready=0, URL officielle, sans secrets. Le runtime ne reçoit que `release/app` et démarre `node server.js`. L’image de revue est `vidfetch-seo-review:pr` ; la source applicative est `cb818f57`. Les trois corrections de revue ne modifient aucun fichier `src`, `content`, `backend`, dépendance ou config Next depuis ce commit : même code applicatif. La CI finale reconstruit et teste, elle, l’artefact de `a84171ec`.

Écart explicite avec le runner GitHub : l’enveloppe de construction locale est Debian bookworm, le runner CI est Ubuntu 24.04 ; architecture, version Node, commandes, flags et chemin standalone sont identiques. Aucun résultat de `next dev` n’est utilisé.

Vrai Caddy **2.11.7**, image épinglée `sha256:f2a1290d0463aad60660d4ec134943f183ee2a5f6c3eb7bf32dd984f2f020772`, configuration dérivée de `deploy/ovh/media/Caddyfile.public-dl`. Seuls écarts locaux : issuer ACME remplacé par `tls internal`, socket admin désactivée, upstream remplacé par le conteneur frontend, ajout de la seule IP de passerelle Docker à l’allowlist des clients. Les ports 31480/31443 sont liés à **127.0.0.1**. Les matchers privés, headers, limites de requêtes et routes médias ne changent pas. Le certificat racine public local est utilisé avec `--cacert`, sans `-k`.

Résultats curl et parcours :

- Les 50 URL canoniques → 200, meta robots `index, follow`, aucun `X-Robots-Tag` restrictif ; title/H1/texte présents sans JavaScript.
- `/id/` et les six autres anciennes formes slash → 301 vers l’accueil canonique, puis 200. La requête `/id/` n’est donc pas attendue en 200 direct dans la nouvelle politique.
- `/robots.txt` et `/sitemap.xml` → 200 ; URL inexistante → **404 et noindex**, exception intentionnelle à la règle d’indexation.
- HTTP, www et slash combinés : une 301 puis un 200 après correction, query conservée, aucune boucle avec `--max-redirs 5`.
- Les endpoints techniques gardent 503/404/noindex selon leur contrat, sans rendre de média ni de secret accessible.

Preuves : [curl-results.json](docs/seo-review/curl-results.json), [assets.json](docs/seo-review/assets.json). Le contrôle externe complet termine par :

```text
SEO CHECK PASS: 50 URLs; HTTP 200, robots, title/description, H1, canonicals, reciprocal hreflang, lang/RTL, OG, JSON-LD/FAQ, sitemap dates, SSR text, internal links, 301 and 404.
```

Rejouer le même audit contre une origine de test déjà démarrée :

```sh
SEO_CHECK_BASE_URL=https://127.0.0.1:31443 SEO_CHECK_HOST=vidfetch.app SEO_CHECK_CA_FILE=/private/tmp/seo-review/root.crt npm run seo-check
```

Pour curl, Host/SNI et la résolution locale sont conservés :

```sh
curl --cacert /private/tmp/seo-review/root.crt --noproxy '*'   --connect-to vidfetch.app:443:127.0.0.1:31443   -H 'Host: vidfetch.app' -I https://vidfetch.app/blog
curl --cacert /private/tmp/seo-review/root.crt --noproxy '*'   --connect-to www.vidfetch.app:443:127.0.0.1:31443   --connect-to vidfetch.app:443:127.0.0.1:31443   -IL --max-redirs 5 'https://www.vidfetch.app/id/?review=1'
```

## 3. Aucune URL existante perdue

Ancien sitemap : 20 entrées. Registre des routes publiques main : **31**, car le blog et ses dix articles existaient déjà en noindex. Nouveau registre et sitemap : **50**. Le [tableau complet et les nouvelles routes](docs/seo-review/urls.md) inclut aussi les ressources publiques stables. Les corps Markdown des dix anciens guides ont été comparés : inchangés ; seuls metadata, dates et maillage ajoutés par la vue évoluent. Les accueils et métadonnées sont volontairement refondus, donc leur texte n’est pas censé rester identique.

| Avant (main) | Après (PR) | Attendu |
|---|---|---|
| `/` | `/` | 200 |
| `/blog` | `/blog` | 200 |
| `/legal` | `/legal` | 200 |
| `/blog/720p-1080p-4k` | `/blog/720p-1080p-4k` | 200 |
| `/blog/backup-your-videos` | `/blog/backup-your-videos` | 200 |
| `/blog/bitrate-vs-resolution` | `/blog/bitrate-vs-resolution` | 200 |
| `/blog/h264-h265-av1` | `/blog/h264-h265-av1` | 200 |
| `/blog/mp3-vs-m4a` | `/blog/mp3-vs-m4a` | 200 |
| `/blog/mp4-vs-webm` | `/blog/mp4-vs-webm` | 200 |
| `/blog/reduce-video-size` | `/blog/reduce-video-size` | 200 |
| `/blog/video-download-fails` | `/blog/video-download-fails` | 200 |
| `/blog/video-format-smartphone` | `/blog/video-format-smartphone` | 200 |
| `/blog/video-to-audio` | `/blog/video-to-audio` | 200 |
| `/tiktok-video-downloader` | `/tiktok-video-downloader` | 200 |
| `/tiktok-to-mp3` | `/tiktok-to-mp3` | 200 |
| `/fr/` | `/fr` | 301 → 200 |
| `/fr/mentions-legales` | `/fr/mentions-legales` | 200 |
| `/fr/telecharger-video-tiktok` | `/fr/telecharger-video-tiktok` | 200 |
| `/fr/tiktok-en-mp3` | `/fr/tiktok-en-mp3` | 200 |
| `/es/` | `/es` | 301 → 200 |
| `/es/aviso-legal` | `/es/aviso-legal` | 200 |
| `/pt/` | `/pt` | 301 → 200 |
| `/pt/termos-e-privacidade` | `/pt/termos-e-privacidade` | 200 |
| `/id/` | `/id` | 301 → 200 |
| `/id/ketentuan-dan-privasi` | `/id/ketentuan-dan-privasi` | 200 |
| `/de/` | `/de` | 301 → 200 |
| `/de/rechtliches` | `/de/rechtliches` | 200 |
| `/it/` | `/it` | 301 → 200 |
| `/it/note-legali` | `/it/note-legali` | 200 |
| `/ar/` | `/ar` | 301 → 200 |
| `/ar/الشروط-والخصوصية` | `/ar/الشروط-والخصوصية` | 200 |


Les sept fichiers de `public/` répondent 200 et gardent le même blob Git. Robots, sitemap et manifest restent disponibles. Les routes API authentifiées ne sont pas des pages à exiger en 200 sans requête valide. Les URL de chunks hashés ne sont pas des permaliens éditoriaux ; la compatibilité des anciens onglets lors d’un déploiement reste celle du mécanisme Next existant, non modifié ici.

## 4. Hygiène du diff

Le diff code avant ajout du rapport porte sur 50 fichiers, 2342 insertions et 274 suppressions. Les autres fichiers ajoutés sont uniquement ce rapport et ses preuves. Aucun fichier existant supprimé.

Hors contenu/head/i18n/tests SEO, les changements conservés et justifiés sont :

- `deploy/ovh/Caddyfile`, `media/Caddyfile.public`, `media/Caddyfile.public-dl` : suppression du noindex global du modèle général, canonisation HTTP/www/slash en une 301. Les headers de sécurité et le refus d’accès direct à l’origine sont conservés.
- Tests Caddy, fixtures, workflow : vérifier ces headers, redirections et le véritable artefact ; pas de nouveau droit de déploiement. Le job deploy reste conditionné à `refs/heads/main` et n’a pas tourné pour la PR.
- `src/components/VideoCard.tsx` : alt descriptif et lazy loading de la vignette seulement ; aucune modification de téléchargement/conversion.
- `src/components/FetchForm.tsx` : espace explicite avant les formes de lien uniquement ; endpoint, validation, auth, body et gestion de requêtes inchangés.
- `package.json` : ajout du script `seo-check` seulement ; **dépendances et package-lock identiques** à main.

Aucun diff dans les moteurs, quotas, API, politique de confidentialité, textes légaux, AdSense/analytics, cookies ou CSP. Le titre légal allemand a été raccourci dans le générateur de metadata, pas dans son texte juridique. Les menus/pieds de page légaux suivent les nouveaux liens comme le reste du site. `check:release` ne détecte aucun secret/fichier privé, et aucune vraie configuration env n’a été commitée. Aucun changement non justifié n’a été identifié à annuler.

## 5. Honnêteté : occurrences et valeurs réellement configurées

[Inventaire cité champ par champ : content-claims.md](docs/seo-review/content-claims.md) — **334 champs/paragraphes correspondants**, avec statut publié, dictionnaire dynamique, candidat non servi ou brouillon. Les textes sont cités intégralement et l’analyse distingue reconnaissance d’URL, restriction, question et capacité. Les noms YouTube dans les sources techniques des guides ne sont pas une promesse de téléchargement.

Sur le contenu exposé : les FAQ disent que VidFetch conserve le rendu de la plateforme et ne retire pas un filigrane incrusté. Les mentions HD/4K sont des questions ou explications, sans création d’une qualité absente. YouTube est refusé dans le formulaire avant vérification/requête ; Instagram/X sont reconnus sans garantie. Les anciens objets `src/lib/seo.ts`, des candidats de catalogue et brouillons comportent encore du marketing non applicable, mais ne sont ni routés ni publiés. Ne pas les réactiver en supposant qu’ils prouvent une capacité actuelle.

Nuance conservée : « verified on our hosting » dans le copy historique décrit la validation annoncée par le produit ; cette revue n’a pas téléchargé de TikTok tiers réel. Les tests transfèrent des médias synthétiques et vérifient le vrai ffmpeg/yt-dlp sur une source locale. Un opérateur doit refaire un essai avec une vidéo dont il possède les droits pour conclure sur la disponibilité actuelle du fournisseur.

| Valeur | Source réelle | Portée / formulation à retenir |
|---|---|---|
| 256 × 1024² octets = **256 MiB** | `backend/server.ts:20`, `gateway/main.ts:30` | Le gateway peut abaisser cette borne via `VIDFETCH_PUBLIC_MAX_MIB` (1–256). Mode Pi/Funnel : 16 par défaut. Runtime OVH actif non lu. |
| 30 minutes | `backend/server.ts:20,168` | Limite de durée **déclarée** lorsque `info.duration` est connue ; ce n’est pas une promesse de succès de tous les médias de 30 minutes. |
| 10 minutes par opération | `backend/server.ts:19,117` | Timer du travail ; metadata/first byte/idle ont aussi des délais plus courts. |
| MP3 192 kbps | `backend/server.ts:199` : `libmp3lame -b:a 192k` | Vrai encodage, pas un renommage ; le test local contrôle les pistes et le résultat. |
| 8 réservations/jour par IP **et** propriétaire ; 1 GiB chacun | `backend/gateway/ledger.ts:37–45` | Jour UTC ; les échecs ne remboursent pas le compteur de nombre, seulement les octets inutilisés. « Jusqu’à 8 » n’est pas une garantie de huit succès. |
| 100 réservations/jour et 4 GiB pour le service | même source | Capacité globale partagée ; les huit par utilisateur peuvent être limités plus tôt. |
| File par défaut 2, attente 180 s | `backend/gateway/main.ts:33–36` | Activée par env et configurable, donc valeurs actives à vérifier côté opérateur. |
| Débit de flux OVH par défaut 2048 KiB/s | `backend/gateway/main.ts:31` | Différent du débit d’encodage MP3 ; env configurable entre 32 et 2048. |

Les huit accueils utilisent la même FAQ de limite 256 MiB / 30 minutes déclarées / 10 minutes. Les nouvelles pages utilisent souvent MB/Mo au lieu de MiB et ne détaillent pas toutes les quotas et délais chiffrés : **pas de valeur numérique contradictoire repérée, mais unités et niveau de détail ne sont pas strictement identiques**. À harmoniser après décision éditoriale, sans modifier les quotas dans cette PR. « Each connection »/« chaque connexion » devrait être clarifié en IP et propriétaire ; « ready for any player » sur la page MP3 EN est trop absolu pour une compatibilité universelle. Ces formulations existaient déjà et sont signalées sans modification non bloquante.

## 6. Traductions et arabe

Contrôle du DOM réellement servi : 50 pages, zéro placeholder `{{…}}`, TODO/lorem ou clé `{variable}` visible, aucun débordement horizontal à 390 px. Aucun paragraphe entier anglais/français oublié n’a été repéré dans les douze outils localisés. Les emprunts « TikTok downloader », noms de formats, systèmes et menus restent intentionnels ; cela ne constitue pas une certification de rédaction native.

Arabe : `lang=ar`, `dir=rtl`, texte et en-tête alignés dans le sens attendu, logo à droite, sélecteur à gauche, ordre DOM des langues conservé. Champ URL et codes d’exemples en LTR ; les nombres observés restent lisibles. Les URL intégrées dans les paragraphes n’ont pas toutes un `bdi` individuel : amélioration typographique à examiner, non corrigée. [Capture accueil](docs/seo-review/ar-home.png), [sélecteur](docs/seo-review/ar-selector.png), [résultats DOM](docs/seo-review/visual.json).

Phrases à relire en priorité, laissées telles quelles :

| Langue | Citation / point à faire relire |
|---|---|
| en | « Each connection can make up to 8 downloads per day » : nommer précisément le quota, et atténuer « ready for any player ». |
| fr | « la durée déclarée à 30 minutes » : formulation technique exacte mais peu naturelle ; préciser ce qui est déclaré par la source. |
| es | « TikTok downloader » en H1 d’accueil : emprunt volontaire pour la requête, à valider pour le public hispanophone visé. |
| pt-BR | « Rolo da câmera » : vérifier la terminologie iOS actuelle selon les appareils ciblés et la cohérence avec Fotos/Arquivos. |
| id | « Satu operasi berjalan sekaligus » : tournure rigide ; relecture prioritaire de cette FAQ et des paragraphes techniques sur les formats. |
| de | « Kontingente » : exact mais administratif ; vérifier si le public comprend mieux « Nutzungslimits ». |
| it | « per contenuto multimediale » : vocabulaire lourd pour une action simple ; certaines explications de codecs semblent issues d’un guide. |
| ar | « لكل وسيط » : terme technique peu orienté utilisateur ; relire aussi « حصص استخدام » et la ponctuation autour des URL. |

Le compteur de texte principal atteint 1133 mots sur l’outil MP3 italien en incluant tous les titres/liens ; le corps éditorial calculé sans UI était annoncé sous 1100. Ce dépassement de présentation et le ton parfois très technique sont des choix éditoriaux non bloquants, à laisser au propriétaire.

## 7. Produit, tests exécutés et limites

- Lint et typecheck : PASS ; 183 tests applicatifs : PASS, 0 ignoré.
- Backend 17, gateway 3, charge/file 5 : PASS.
- Vrai test média sur vidéo originale synthétique de deux secondes : MP4, fusion vidéo+audio et MP3 via moteurs réels : PASS. Le premier essai a échoué faute de binaire yt-dlp dans le worktree, puis le binaire déjà installé a permis le test ; aucun média TikTok/YouTube n’a été téléchargé.
- Navigateur : huit accueils avec vérification des endpoints/erreurs, et **seize outils** avec transferts synthétiques MP4/MP3 puis erreur de quota en langue locale. Les assertions contrôlent `/api/fetch-info`, `/api/download` et le corps `url/type/format_id`. PASS, sans chargement tiers.
- Sélecteurs : équivalents dans les huit langues ; fallback vers accueil seulement si traduction de guide absente. Les liens de plateforme, header/footer et contenus restent dans les 50 URL validées.
- Suite Python complète locale : exécutée, 81 tests dont 4 ignorés ; elle a révélé la fixture d’indexation périmée. Après correction, le sous-ensemble concerné repasse (2 tests). La CI finale a rejoué toute sa chaîne et le contrôle post-build obligatoire : PASS. [Preuve CI](docs/seo-review/ci-final.json).
- **Tests historiques non verts, déjà cassés sur main** : `scripts/smoke-browser.mjs` attend `/Download your videos/` alors que main affiche déjà « Download online videos » ; `test:vercel -- --browser`, sur builds génériques séparés main et PR, attend 200 pour `/youtube-video-downloader`, déjà 404 sur main. Les quatre premières vérifications API Vercel passent avant cet échec. Aucune réactivation de YouTube ni suppression d’assertion pour les faire passer. À réviser dans un travail de maintenance distinct.
- Les scripts manuels nécessitant secrets de préproduction, fenêtres d’exposition ou vidéos tierces autorisées n’ont pas été lancés contre les services réels. Les anciens scripts de smoke/site contiennent aussi des hypothèses historiques de plateformes et ne remplacent pas la nouvelle couverture.

## 8. JSON-LD et éligibilité Google

50 documents validés avec le vocabulaire officiel `https://schema.org/version/latest/schemaorg-current-https.jsonld` : JSON parsable, types/propriétés existants, contrats Organization/WebSite/WebApplication/Offer/FAQPage/BlogPosting/Breadcrumb présents. Le publisher référencé se résout bien vers Organization. 24 FAQPage contiennent 119 questions et réponses identiques au DOM ; 42 BreadcrumbList pointent vers les URL existantes ; 16 BlogPosting ont leurs dates, langue et auteur/éditeur. Aucun `aggregateRating`, `review`, `ratingCount`, `numberOfUsers` ni statistique d’interaction inventée. [Résultats complets](docs/seo-review/schema-results.json).

Il faut distinguer validité schema.org et éligibilité à un résultat enrichi : Google réserve l’affichage FAQ aux sites gouvernementaux/santé faisant autorité et demande une note ou un avis pour son résultat logiciel. Il ne faut pas inventer ces données pour satisfaire l’outil. Le HowTo existant ne promet pas non plus un affichage spécial. Sources : [FAQ/HowTo](https://developers.google.com/search/blog/2023/08/howto-faq-changes), [SoftwareApplication](https://developers.google.com/search/docs/appearance/structured-data/software-app).

## 9. Performance mobile comparée

Lighthouse **13.6.0**, Chrome headless 156, trois répétitions alternées main/PR, médiane, emulation mobile, CPU ×4 et réseau simulé ~1,6 Mbit/s/RTT 150 ms. Builds de production **OVH Webpack identiques en cible et dépendances**, servis localement avec le même Node/Chrome ; ce ne sont ni des mesures terrain Cloudflare ni des mesures du TTFB mondial. Domaines AdSense/Turnstile bloqués pour comparer le produit. D’autres tests Docker tournaient sur le poste : la dispersion du TBT interdit de présenter 5 ms comme une causalité démontrée.

Next 16 n’affiche plus ici de colonne First Load JS ; les octets viennent des dix scripts initiaux réellement référencés dans chaque HTML, avec leur gzip, en complément des builds réussis.

| Page | LCP main → PR | CLS main → PR | TBT main → PR | Signal >10 % |
|---|---|---|---|---|
| `/` | 818 → 822 ms | 0 → 0 | 46.0 → 51.5 ms | TBT +12.0 % |
| `/fr/tiktok-en-mp3` | 820 → 815 ms | 0 → 0 | 41.0 → 39.0 ms | Aucun |
| `/blog/mp4-vs-webm` | 817 → 814 ms | 0 → 0 | 39.0 → 44.0 ms | TBT +12.8 % |
| `/id/download-video-tiktok` | N/A → 821 ms | N/A → 0 | N/A → 41.0 ms | Nouvelle page : baseline 404, comparaison non valide |

JS initial : **609168 → 609182 octets bruts (+0,002 %)**, **190967 → 191146 octets gzip (+0,094 %)** sur les trois pages comparables. La nouvelle page ID charge le même ensemble. LCP : aucune hausse >10 % ; CLS : nul. TBT accueil +12,0 % (+5,5 ms), article +12,8 % (+5 ms), avec recouvrement des plages de mesure ; scores Lighthouse 100. Ces seuils sont signalés sans correction opportuniste non justifiée. [Toutes les répétitions et tailles](docs/seo-review/performance.json).

## Décisions du propriétaire et condition de levée du NO-GO

**O1 — déploiement coordonné, bloquant pour l’exigence d’une seule 301.** En ligne, la lecture de `http://www.vidfetch.app/id/` a donné `308 → https://www.vidfetch.app/id/`, puis `301 → https://vidfetch.app/id/`, puis 200. La première réponse porte `Server: cloudflare` : cela prouve le passage par le CDN, pas quelle couche a généré la 308. Je ne l’attribue donc pas à une règle précise sans accès à l’origine et à la zone. Le correctif Caddy donne une seule 301 dans le test ; il reste à vérifier que la chaîne publique n’ajoute pas d’étape. La fusion ne recharge pas non plus ce Caddyfile. Il faut confirmer avant fusion qui applique la configuration publique corrigée, et comment les règles Cloudflare HTTP/www/slash sont coordonnées ; sinon le critère de production annoncé reste faux malgré la CI verte. Ce n’est pas un risque de perte de contenu ni un noindex constaté dans les headers actuels.

Je n’ai ni accès aux règles privées de la zone, ni vérifié le pointeur Caddy actif ou les env privés du VPS, et n’ai rien modifié en production. Pour lever O1, l’administrateur peut lire `systemctl cat vidfetch-caddy.service`, vérifier le fichier résolu sous `/etc/vidfetch/public-https-test/current` (chemin par défaut du toolkit), puis utiliser Cloudflare Trace/Redirect Rules et exécuter les commandes curl ci-dessous. Ne pas transmettre de clé, cookie ou fichier env entier : communiquer uniquement les variables non secrètes de limites et les statuts/Location/X-Robots.

Cloudflare documente séparément [Always Use HTTPS](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/always-use-https/) et les [Single Redirects](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/) ; plusieurs couches peuvent donc se cumuler. La disponibilité des expressions dépend du plan : je ne propose pas une règle prête à coller sans voir la configuration réelle.

**N1–N5 — non bloquants, laissés inchangés :** relecture native prioritaire ar/id et phrases du tableau ; harmonisation MiB/MB et précision quotas ; libellés historiques « any player »/« connection » ; scripts de smoke/Vercel antérieurs à réparer séparément ; suivi du signal TBT relatif et vérification terrain avec ads/CDN réels. `publicationRequested` expose les trois nouveaux articles FR sans prétendre à une relecture humaine : confirmer ce choix éditorial. Les anciens catalogues non servis ne doivent pas être réactivés sans revue.

## Checklist post-déploiement

- [ ] Vérifier la release réellement activée et les fichiers Caddy/règles Cloudflare convenus, sans ouvrir les endpoints techniques ni modifier les protections d’origine.
- [ ] Purger dans Cloudflare les HTML concernés, anciennes formes slash, `/robots.txt` et `/sitemap.xml` si une ancienne réponse persiste. La lecture actuelle était DYNAMIC, mais les règles de cache privées n’ont pas été inspectées.
- [ ] Rejouer sur le domaine public : 200, `index, follow`, aucun header restrictif sur accueil, `/blog`, un article EN/FR, `/id/download-video-tiktok`, `/pt/baixar-video-tiktok`, un outil arabe ; 404 réelle sur une URL absente.
- [ ] Tester toutes les variantes HTTP/www/slash, query incluse, avec une seule 301 et aucun rebond :

```sh
curl -IL --max-redirs 5 'http://www.vidfetch.app/id/?review=1'
curl -IL --max-redirs 5 'https://www.vidfetch.app/fr/tiktok-en-mp3/?review=1'
curl -IL --max-redirs 5 'https://vidfetch.app/id/'
curl -I https://vidfetch.app/blog
```

- [ ] Soumettre **https://vidfetch.app/sitemap.xml** dans Google Search Console. Il doit contenir 50 URL canoniques, pas les anciennes variantes slash.
- [ ] Dans Inspection de l’URL, utiliser **Tester l’URL en direct**, examiner robots/canonical/hreflang/HTML et demander l’indexation des représentants prioritaires ci-dessous, selon les quotas de Google :

1. `https://vidfetch.app/blog`
2. `https://vidfetch.app/id/download-video-tiktok` et `/id/tiktok-ke-mp3`
3. `https://vidfetch.app/pt/baixar-video-tiktok` et `/pt/tiktok-para-mp3`
4. `https://vidfetch.app/es/descargar-video-tiktok` et `/es/tiktok-a-mp3`
5. `https://vidfetch.app/blog/why-cant-i-save-tiktok`
6. `https://vidfetch.app/blog/save-tiktok-sound-mp3`
7. `https://vidfetch.app/blog/save-tiktok-phone-gallery`
8. `https://vidfetch.app/fr/guides/pourquoi-impossible-enregistrer-tiktok` et les deux autres nouveaux articles FR.

- [ ] Vérifier ensuite outils DE/IT/AR et accueils localisés, dont `https://vidfetch.app/ar/tahmil-video-tiktok` et `/ar/tiktok-mp3`.
- [ ] Refaire un essai fonctionnel avec une vidéo TikTok publique appartenant à l’opérateur, MP4 puis MP3, vérifier le fichier et les messages. Les tests de cette revue ne constituent pas une validation du fournisseur tiers en temps réel.
- [ ] Recontrôler les anciens statuts noindex et fournir l’export de l’URL historiquement bloquée si le signal GSC persiste ; aucune URL éditoriale du nouveau sitemap n’est bloquée par robots dans le test.
