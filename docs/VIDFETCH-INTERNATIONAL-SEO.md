# VidFetch — internationalisation et SEO multilingue

Préparation locale des 12–13 octobre 2026. Les dates des articles et de relecture utilisent UTC ; aucune date de publication n’a été inventée. Aucune mise en ligne n’a été effectuée.

Branche : `work/vidfetch-international-seo-20261012`, dérivée de `work/vidfetch-consolidated-20261012` au commit `789c0cc1c5a8a4edddc424830737014f03455e30`. Checkout : `backend/artifacts/international-seo-20261012/checkout`. Le dépôt principal et les deux checkouts précédents sont conservés. Aucun push ni fusion sur main, aucun changement VPS, Raspberry Pi, DNS, Vercel, Supabase ou secrets.

## Architecture

Aucune nouvelle bibliothèque i18n, aucun CMS et aucune dépendance ajoutée. Le projet utilise l’App Router Next.js **16.4.0**, React Context pour transmettre le dictionnaire sélectionné aux composants interactifs, et `Intl` pour nombres et dates. Les traductions sont centralisées dans huit fichiers JSON typés. Le client reçoit le dictionnaire de la langue affichée ; les articles restent dans des composants serveur.

Le layout racine se trouve dans `src/app/(site)/[[...segments]]/layout.tsx`. Il reçoit la langue dans ses paramètres pendant le rendu statique et écrit directement `html lang` et `dir`. Un seul routeur de pages partage les vues accueil, guides, article, légal et plateforme. Il n’existe pas huit copies du code des pages. Cette approche de layout sous segment dynamique est prise en charge par [Next.js](https://nextjs.org/docs/app/api-reference/file-conventions/layout).

Les API et les fichiers de métadonnées restent hors du catch-all : leurs chemins prioritaires ne changent pas. `src/proxy.ts` normalise seulement l’écriture des URL, sans géolocalisation ni cookie de préférence. Les chemins API, auth, download-helper et assets Next sont exclus. Les homes localisées gardent leur slash final ; les URL anglaises utiles gardent leur forme historique.

| Langue | Code HTML/hreflang | Accueil | Guides | Légal | Direction |
|---|---|---|---|---|---|
| Anglais | en | `/` | `/blog` | `/legal` | ltr |
| Français | fr | `/fr/` | `/fr/guides` | `/fr/mentions-legales` | ltr |
| Espagnol | es | `/es/` | `/es/guias` | `/es/aviso-legal` | ltr |
| Portugais brésilien | pt-BR | `/pt/` | `/pt/guias` | `/pt/termos-e-privacidade` | ltr |
| Indonésien | id | `/id/` | `/id/panduan` | `/id/ketentuan-dan-privasi` | ltr |
| Allemand | de | `/de/` | `/de/ratgeber` | `/de/rechtliches` | ltr |
| Italien | it | `/it/` | `/it/guide` | `/it/note-legali` | ltr |
| Arabe | ar | `/ar/` | `/ar/أدلة` | `/ar/الشروط-والخصوصية` | rtl |

## Interface et accès

Les dictionnaires couvrent navigation, footer, formulaire, placeholders, validation, presse-papiers, chargement, challenge, formats, progression, statuts, erreurs, accueil, étapes, FAQ, index éditorial et légal. La marque VidFetch reste identique. Les données du média — titre, auteur et codecs — sont conservées, pas traduites arbitrairement.

Les codes/énumérations/messages techniques des API restent stables. Seule leur présentation est localisée. Les erreurs inconnues donnent un message localisé ; les fenêtres bloquées ont une instruction dédiée. Les labels de format conservent la résolution du petit côté pour les vidéos verticales et les fréquences élevées.

Le sélecteur utilise des liens HTML natifs accessibles. Il conserve l’identité de la page dans chaque langue disponible. En l’absence d’une traduction approuvée de l’article, il renvoie à l’accueil cible. Le changement de langue est volontaire, sans redirection selon le pays. La navigation complète recrée la clé navigateur si nécessaire ; elle ne contourne pas les quotas IP.

Arabe : direction RTL côté serveur, espacements logiques, flèches directionnelles adaptées, radios au clavier inversées horizontalement, champs URL en LTR, isolation des formats/code et ancres Unicode. Le helper de téléchargement reçoit un paramètre décoratif `lang`, sans ticket ni secret dans ce paramètre. Son contrôle de l’opener/origin et sa CSP sont conservés ; ses textes sont échappés.

Le widget reçoit une langue explicite, avec `pt-br` pour le portugais brésilien. Les huit langues sont listées par [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/reference/supported-languages/). La recette locale simule le challenge ; elle ne valide pas le service Turnstile public.

## Métadonnées et hreflang

`src/lib/localized-seo.ts` produit titles/descriptions, canonicals **absolues et propres à chaque URL**, Open Graph, Twitter et textes alternatifs localisés. Le contenu principal est présent dans le HTML serveur. JSON-LD : identité, WebPage, WebApplication, HowTo, FAQ, Breadcrumbs et BlogPosting selon la page, avec la langue du contenu.

`site-pages.ts` centralise disponibilité et indexabilité. Les hreflang ne relient que des versions indexables de la même identité. Autoréférence et réciprocité sont testées ; x-default vise l’anglais correspondant. Les articles en relecture, les versions inexistantes et les pages de fonctionnalité non validée n’ont pas d’alternates trompeurs. Les liens vers des traductions ne sont pas créés par simple substitution de préfixe.

## Sitemap et publication

Dans l’état actuel : **38 pages disponibles dans le build**, dont **16 prêtes pour l’indexation dans le code** : huit accueils et huit pages légales. Cela ne signifie pas qu’elles sont déjà publiques ou indexées.

Les huit index de guides restent noindex tant qu’aucun article n’est réellement publié dans leur langue. Les dix articles anglais restent accessibles, intégralement conservés, mais noindex tant que `published` est null. Les quatre anciennes URL plateformes restent informatives et noindex, sans promesse de téléchargement.

Le sitemap ne contient que les 16 canonicals indexables et leurs annotations linguistiques. Il utilise les dates éditoriales enregistrées, pas la date du build. Les anciennes URL anglaises sont préservées ; les entrées d’articles jamais publiés et de fonctionnalités non validées sont retirées de l’indexation. Robots.txt et les exclusions techniques sont conservés. Les 404 ont un vrai statut 404, une interface localisée, noindex et aucune canonical racine héritée.

L’inventaire exact est dans [VIDFETCH-URL-INDEXATION.md](VIDFETCH-URL-INDEXATION.md), et les compteurs dans [VIDFETCH-CONTENT-STATUS.json](VIDFETCH-CONTENT-STATUS.json).

## Articles : 80 versions sources, sans publication automatique

Les dix fichiers anglais d’origine sont conservés octet par octet. **70 adaptations complètes** sont ajoutées : dix dans chacune des sept autres langues. Chaque version a un identifiant commun, un slug localisé, un titre/description/catégorie propres, des exemples, des sections, une FAQ et les sources primaires de l’original.

| Langue | Articles sources | État rédactionnel | Publication réelle |
|---|---:|---|---:|
| en | 10 | ready existant, fichiers inchangés | 0 date enregistrée |
| fr | 10 | review : relecture linguistique et technique requise | 0 |
| es | 10 | review : relecture linguistique et technique requise | 0 |
| pt-BR | 10 | review : relecture linguistique et technique requise | 0 |
| id | 10 | review : relecture linguistique et technique requise | 0 |
| de | 10 | review : relecture linguistique et technique requise | 0 |
| it | 10 | review : relecture linguistique et technique requise | 0 |
| ar | 10 | review : relecture linguistique et technique requise | 0 |

Les contrôles automatiques vérifient structure, longueur, liens, commandes, calculs et provenance. Ils ne constituent pas une certification de rédaction native. La liste des **70 contenus à relire** est explicitement donnée dans l’inventaire. Faire également relire les dictionnaires, notamment les textes légaux, avant activation publique.

`sourceSha256` conserve l’empreinte de la version anglaise initiale ; `sourceBodySha256` suit son contenu indépendamment des dates de publication. Une traduction approuvée devient indisponible si le corps anglais change sans mise à jour de sa provenance. Les liens Markdown utilisent des identifiants communs ; le rendu résout les liens disponibles dans la langue courante, sans envoyer discrètement vers l’anglais.

### Relecture manuelle d’un article

Après une véritable relecture, un éditeur identifié peut exécuter, dans ce checkout :

```sh
node scripts/i18n/review-guide.mjs --locale=fr --id=mp4-vs-webm --reviewer="Nom du relecteur" --confirm-linguistic-review --confirm-technical-review
```

Le script sauvegarde le fichier précédent, contrôle la provenance et enregistre la relecture du jour UTC. Il laisse la date de publication à null. Une version approuvée peut alors être servie pour recette, toujours noindex sans publication. Aucun script de build ou CI n’approuve les contenus.

Après déploiement autorisé et confirmation que l’article est effectivement public :

```sh
node scripts/ovh/publish-guides.mjs --confirmed-publication --locale=fr --id=mp4-vs-webm
```

La date réelle du jour UTC est enregistrée avec sauvegarde. Tous les fichiers sélectionnés sont validés avant écriture. Le script refuse les traductions non approuvées ou dont la source a changé. Sans locale, il conserve le fonctionnement anglais précédent. Revoir, tester et commiter le diff ; aucun push ni déploiement automatique par ces scripts.

## Pages plateformes

`content/platforms/catalogue.json` contient **11 sujets et 88 slugs préparés** : YouTube vidéo/MP3/Shorts, TikTok vidéo/sans filigrane/MP3, Instagram Reels/vidéo/story, X vidéo/GIF. Chaque sujet possède un brief éditorial distinct.

`platform-pages.ts` et la vue partagée permettent de fournir pour chaque langue une copie originale : metadata, H1/intro, instructions, formats, limites, FAQ et guides liés, avec le même outil. La disponibilité exige preuve de média autorisé, contenu relu, accord de publication et copie locale complète avec dates. Aucun simple flag ne publie une page vide.

**Aucune des nouvelles pages spécialisées n’est publiable aujourd’hui.** Les trois sujets YouTube restent bloqués par l’anti-bot OVH. Les huit autres sujets attendent validation fonctionnelle et rédaction originale adaptée. Pas de promesse de suppression de filigrane, accès aux stories privées, conversion GIF ni contournement de protection. Les quatre routes anglaises historiques restent accessibles comme notices d’indisponibilité, sans indexation.

## Tests et impact du build

Implémentation validée au commit local `4952304018ba8f051b2c4053664066393f3cf0dc`. Les preuves brutes sont conservées dans `backend/artifacts/international-seo-20261012/`, hors Git ; le résumé transportable est dans `backend/validation/international-seo-20261013.json`.

| Contrôle effectivement exécuté | Résultat | Preuve et périmètre |
|---|---|---|
| ESLint | VALIDÉ | `lint-final.log`, exit 0 |
| TypeScript frontend et gateway | VALIDÉ | `typecheck-final.log`, `tsc --noEmit -p backend/gateway/tsconfig.json`, exit 0 |
| Unités et SEO existant/ajouté | VALIDÉ | 131/131, aucune exclusion ; `unit-validated.log` et `unit-final-confirmed-tail.log` |
| Backend HTTP/streaming/processus | VALIDÉ | 17/17, moteurs synthétiques : statuts, concurrence, timeout, déconnexion, backpressure et nettoyage |
| Gateway HTTPS/authentification | VALIDÉ | 2/2, TLS local, propriété des tickets, signatures, rejeu, expiration et indisponibilité ; `checkout/backend/artifacts/secure-tls-*/results.json` |
| File d’attente et expiration | VALIDÉ | 4/4, charge synthétique 1/2/4/8 visiteurs, un moteur simultané ; `checkout/backend/artifacts/secure-tls-4gYZnY/load-results.json` |
| Déploiement/rollback | VALIDÉ | 5/5 tests Python dans des répertoires temporaires ; aucune opération sur le VPS |
| Build OVH macOS / secours Vercel | VALIDÉ | Sans `DATABASE_URL` ; `build-ovh-final-mac.log` et `vercel-build-replacement.log` |
| Secours Vercel HTTP + navigateur | VALIDÉ | 7 groupes de contrôles, quatre traces API sans PostgreSQL ni moteurs, 503 BACKEND_UNAVAILABLE, serveur arrêté ; `checkout/backend/artifacts/vercel-http-4Yu3nE/results.json` |
| Build et release Linux x86_64 | VALIDÉ | Node 22.23.3, Turbopack, réseau désactivé, conteneur limité à 2 CPU/2 GiB ; `linux-release-validated.log` et `linux-release-verification.json` |
| Syntaxe des bundles | VALIDÉ | `node --check` moteur et gateway dans le builder Linux |
| HTML serveur, sitemap et hreflang | VALIDÉ | 38 pages, 16 canonicals indexables, huit langues, autoréférence et réciprocité ; `http-browser-verification.json` |
| Recette SEO anglaise précédente | VALIDÉ | 17 pages historiques, APIs dégradées, dix guides sur mobile, quatre groupes de contrôles ; `legacy-site-validation/verification.json` |
| Mobile, sélecteurs, arabe RTL et outil | VALIDÉ | Huit parcours Chrome, URL en LTR, clavier des formats, vrais 404 localisés, pas de débordement ; même preuve |
| Transfert natif depuis le navigateur | VALIDÉ sur fixtures | Huit fichiers synthétiques de 992 octets, intégrité vérifiée, vrai helper, autorisation et moteurs simulés ; aucun transcodage réel revendiqué |
| Fichiers anglais et travail antérieur | VALIDÉ | Dix sources anglaises et bundle moteur identiques ; 87 empreintes préexistantes et anciens checkouts inchangés ; `bundle-and-english-preservation.json`, `git-preservation-final.json` |
| Recherche de secrets/fichiers interdits | VALIDÉ | Analyse de l’index Git et de la release, aucune anomalie détectée ; ceci ne remplace pas une revue humaine |
| Vidéo/MP3 réels sur cette nouvelle version | NON TESTÉ | Les validations OVH précédentes sont conservées, pas répétées ; aucun accès au VPS dans cette mission |
| Workflow GitHub, HTTPS et Turnstile publics | NON TESTÉ | Préparation locale uniquement, aucune activation ni requête publique |
| Relecture native des 70 articles | NON TESTÉ | Tous restent en review, publication null, hors routage et sitemap |
| Pages YouTube spécialisées | BLOQUÉ | Contrôle anti-bot OVH signalé dans le rapport de référence, sans nouveau test réseau |
| Autres pages plateformes | NON TESTÉ | Architecture et briefs prêts ; fonctionnalités et copie originale restent à valider |

Les échecs intermédiaires ont été diagnostiqués et corrigés : résolution des slugs arabes encodés, format vertical et résolution Webpack de la façade API. Le plugin de remplacement Webpack empêche désormais le résolveur des chemins TypeScript d’inclure les imports dynamiques du moteur dans le secours Vercel. Aucun contournement par fausse URL de base de données ou masquage des traces. Les permissions sandbox/Docker et les réglages des fixtures navigateur ont aussi nécessité des reprises ; ils ne sont pas présentés comme des validations de production.

Les dépendances restent inchangées. La seule modification package concerne `test:i18n`. Le pipeline ajoute installation d’un navigateur sur le runner GitHub puis la recette HTML/RTL après le build OVH. Les permissions, pinning, compte SSH, gates de production, concurrence, drain et rollback restent identiques. Aucun workflow n’a été déclenché.

Les 70 traductions en relecture n’ajoutent pas 70 pages publiques au build : **38 pages de contenu, 43 entrées statiques avec les fichiers spéciaux Next**, quatre API dynamiques. La release Linux du commit d’implémentation contient 1 684 fichiers couverts par le manifeste SHA-256, plus le manifeste lui-même ; toutes les empreintes ont été vérifiées. L’application occupe **79,42 MiB**, contre **75,92 MiB** dans la release de référence `cbbd4fd` : +3,50 MiB. Cela mesure des fichiers de livraison, pas la RAM en production. Les 80 sources Markdown sont présentes pour le rendu serveur et les évolutions éditoriales. Les fichiers récursifs sont inclus dans le tracing pour OVH et le secours Vercel ; les assets restent copiés par le builder Linux. Une compilation macOS n’est pas un artefact de livraison Linux.

Le bundle moteur reste identique (54 094 octets). Le bundle gateway passe de 42 476 à 167 503 octets en incluant les dictionnaires du helper ; aucune dépendance lourde ni modification de quota/concurrence n’est ajoutée. La charge synthétique locale a observé 79,11 MiB de RSS maximale pour la gateway, sans établir une capacité VPS réelle. La navigation mobile anglaise contrôlée a mesuré LCP 344 ms et CLS 0, sur une seule navigation locale avec latence/CPU simulés ; ce n’est pas une mesure terrain. CPU/RAM de production, INP et Core Web Vitals terrain restent NON TESTÉS.

## Ajouter une langue

1. Ajouter le code BCP 47 à LOCALES et sa définition dans LANGUAGES : préfixe stable, nom natif, direction, locale Open Graph, slugs guides/légal. Réserver un préfixe qui ne collisionne pas avec les API et routes historiques.
2. Créer le dictionnaire JSON complet, l’importer dans dictionaries et conserver les mêmes clés/placeholders. TypeScript et tests refusent les clés manquantes.
3. Traduire les contenus dans `content/guides/CODE/` avec les mêmes noms de fichiers/identifiants, slugs naturels et empreintes de l’original. Commencer en review avec publication null.
4. Adapter les briefs/slugs et, après preuve fonctionnelle, la copie locale des plateformes. Ne pas créer automatiquement des pages aux promesses non vérifiées.
5. Vérifier la langue du widget supportée, direction, chiffres, dates, clavier et mobile. Étendre la matrice de recette navigateur.
6. Exécuter lint, TypeScript, unités, build, `test:i18n`, tests backend/gateway et inventaire. Vérifier canonical/hreflang réciproques, vraies 404 et sitemap avant toute publication.

## Avant mise en production

Relire les 70 articles et les textes d’interface ; confirmer les adresses de contact existantes. Résoudre les validations fonctionnelles des plateformes sans contourner leurs protections. Tester la release Linux exacte et le pipeline GitHub réel. Effectuer ensuite la recette publique HTTPS/Turnstile/vidéo/MP3 prévue dans le rapport OVH, avec accord distinct de push, DNS et activation. Préserver Vercel et le Pi comme secours. INP terrain, indexation et trafic public restent non mesurés dans cette préparation locale.
