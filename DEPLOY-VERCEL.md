# VidFetch — déploiement Vercel manuel

Préparation commencée le 11 octobre et finalisée le 12 octobre 2026 (Europe/Paris) sur la branche `release/vidfetch-vercel-20261011`, depuis `main` à `d572cf89d790d73b7102d2fb4e308977f79cafbb`. L'identifiant exact du commit de livraison est fourni dans le compte rendu final et consultable avec `git log -1 --format=%H`.

## État et limites de cette version

Next.js **16.4.0**, ESLint Next **16.4.0**, PostCSS **8.5.23**. Les pages, métadonnées, sitemap, robots, manifest et image sociale sont disponibles. Le domaine attendu dans le code est `vidfetch.app` ; son association au projet Vercel doit être vérifiée dans votre interface, sans changer le DNS si cette association existe déjà.

Le backend Pi reste un service indépendant sur loopback. Le frontend Vercel n'y a aucun accès. Le mode dégradé est désormais le **mode par défaut**, même sans `VERCEL`, `VERCEL_ENV` ou `VIDFETCH_TARGET`. Un simple `npm run build` ne nécessite aucune `DATABASE_URL`. Il affiche l'indisponibilité des extractions et des téléchargements vidéo/MP3 et désactive leurs contrôles. Les fonctions Next n'importent ni la base ni les moteurs : santé frontend HTTP 200 avec `downloads.available=false`, autres appels média HTTP 503 JSON `BACKEND_UNAVAILABLE`. Cette réponse précède la lecture et la validation du corps. Les méthodes non prévues renvoient HTTP 405. Aucun fichier vidéo ne traverse Vercel.

Les fonctionnalités Node avec base réelle restent conservées derrière l'opt-in explicite `VIDFETCH_TARGET=node`, à réserver aux hébergements Node locaux. La base est créée uniquement à son premier usage ; les imports de modules ne réclament plus de credentials. Ne pas définir cet opt-in sur Vercel et ne pas ajouter une fausse URL de base pour faire passer le build. Les variables et données Supabase existantes restent inchangées.

La passerelle HTTPS authentifiée, les sessions, la protection des tickets et l'isolation des sorties des moteurs restent à réaliser et valider selon [l'architecture préparée](backend/preproduction/ACCESS-ARCHITECTURE.md). Modifier une variable ne suffit pas à activer ce futur accès.

## Vérifier les déclenchements Git avant le push

La lecture GitHub a trouvé l'intégration `cloudflare-workers-and-pages` sur le dernier commit, avec un build échoué. Aucun déploiement ni statut Vercel n'est visible. Cela **ne prouve pas** l'absence de connexion Vercel ; aucun projet local `.vercel` ni accès CLI Vercel n'est disponible.

Dans Vercel : projet → **Settings → Environments → Production → Branch Tracking**. Vérifier la branche de production. Dans Cloudflare, vérifier aussi la branche suivie par le projet déjà connecté. La branche de livraison doit rester hors production si vous voulez une mise en ligne exclusivement manuelle. Une Preview peut être créée par le mécanisme Git existant. Ne pas pousser `main` ni fusionner la branche pour ce déploiement manuel. [Déploiements Git Vercel](https://vercel.com/docs/git).

## Paramètres à vérifier manuellement

| Paramètre | Configuration de cette version |
| --- | --- |
| Framework Preset | Next.js |
| Root Directory | Racine du dépôt (`.` ; laisser vide si l'interface affiche cette racine) |
| Node.js Version | 22.x |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | Next.js default, Override désactivé ; le build produit `.next` |

Aucun `vercel.json`, rewrite ou proxy vers le Pi n'est nécessaire. Ne pas sélectionner `out`, `public` ou `.next/standalone` comme output personnalisé. Le mode dégradé ne dépend plus de l'exposition des variables système Vercel. [Configuration des builds](https://vercel.com/docs/builds/configure-a-build).

## Variables : noms uniquement

| Nom | Utilisation |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | URL canonique publique ; conserver celle du domaine existant, cohérente entre Preview et Production. |
| `VERCEL` / `VERCEL_ENV` | Variables système Vercel ; empêchent l'activation des moteurs locaux si présentes, mais ne sont pas requises pour le mode dégradé. |
| `VIDFETCH_TARGET` | Facultative ; ne pas sélectionner le mode Node sur Vercel. Le mode dégradé est déjà celui par défaut. |
| `DATABASE_URL` | Conserver si déjà configurée pour les services Supabase/PostgreSQL ; cette version Vercel ne l'utilise pas. |
| `NEXT_PUBLIC_API_ORIGIN` | Ne pas renseigner une adresse Pi ou une ancienne origine de téléchargement ; cette version Vercel l'ignore et compile une origine vide. |
| `NEXT_PUBLIC_DOWNLOADS_UNAVAILABLE` | Indicateur compilé par Next config ; ne pas tenter de le remplacer dans les réglages Vercel. |

Conserver les autres variables Supabase existantes sans modifier leurs valeurs. Aucun nouveau secret n'est requis pour ce mode. Les chemins des binaires, cookies, paramètres SSH, mot de passe PostgreSQL local et archives du Pi ne doivent pas être importés sur Vercel. Les variables `NEXT_PUBLIC_*` sont publiques et sont intégrées au build ; tout changement utile exige une nouvelle compilation. [Variables d'environnement Vercel](https://vercel.com/docs/environment-variables).

## Déployer d'abord en Preview

1. Ouvrir le projet Vercel existant lié à `aouirdani/vidfetch`. Ne pas importer un second projet s'il existe déjà. Vérifier la branche de production, les paramètres ci-dessus et les variables Preview/Production. Noter le déploiement de production actuellement marqué **Current** pour un éventuel retour arrière.
2. Après le push autorisé, ouvrir **Deployments**. Si le push a créé une Preview sur la branche de livraison, vérifier sa branche et son SHA. Si vous avez changé des variables ou des paramètres depuis ce build, choisir **… → Redeploy**, puis ouvrir le nouveau résultat.
3. Si aucune Preview n'existe, choisir **Deployments → Create Deployment**, renseigner le nom complet `release/vidfetch-vercel-20261011` ou le SHA de livraison. Si un même SHA apparaît sur plusieurs branches, sélectionner cette branche de livraison. Vérifier la cible **Preview**, puis confirmer **Create Deployment**. Si l'interface propose Production, annuler et revoir Branch Tracking. [Créer depuis une référence Git](https://vercel.com/docs/git#creating-a-deployment-from-a-git-reference).
4. Pour la correction de `DATABASE_URL is required`, créer une Preview sur le **nouveau SHA**, ou ouvrir le déploiement automatique correspondant et choisir **… → Redeploy** en désactivant l'utilisation du cache de build si nécessaire. Redéployer seulement l'ancien SHA ne récupère pas la correction. Ne pas ajouter de valeur factice de `DATABASE_URL` et conserver Supabase.
5. Attendre **Ready** et examiner les logs : Next.js 16.4.0, pages et trois routes API, aucune installation yt-dlp par `scripts/setup-media.mjs`, aucun accès DB requis. Les dépendances natives installées par npm ne doivent pas apparaître dans les fonctions média ; leurs traces sont contrôlées par le test local.
6. Vérifier la Preview selon les contrôles ci-dessous. Cette mission n'autorise aucune promotion en production ni changement de branche de production.

## Vérification après votre déploiement

- Accueil, quatre pages plateformes et `/legal` : HTTP 200, un H1, navigation et présentation mobile correctes ; `/une-page-inexistante` : 404.
- Message d'indisponibilité visible, boutons Extract/Paste/exemples désactivés, badge **Engine unavailable**. Une URL partagée peut être affichée dans le champ sans déclencher d'extraction.
- `/api/health` : HTTP 200, `ok=true`, `engine.ytDlp=null`, `engine.ffmpeg=false`, `downloads.available=false`. Cela atteste le frontend, pas la santé du Pi.
- POST `/api/fetch-info`, POST `/api/download`, GET `/api/download?ticket=test` et GET `/api/download?status=test` : HTTP 503 et `code=BACKEND_UNAVAILABLE`, cache désactivé. DELETE `/api/download` : HTTP 405.
- `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`, `/icon.svg`, `/og-image.jpg` : HTTP 200 ; image 1200 × 630 et canonicals cohérents avec le domaine configuré. `/api/stats` doit rester 404.
- Console et onglet Network : aucune erreur JavaScript, aucune requête vers une IP privée, loopback, port 8788 ou ancienne origine de téléchargement. Les logs Vercel ne doivent présenter aucune tentative moteur/base ni secret.
- Après promotion, vérifier **Current** et le domaine existant dans **Settings → Domains**, puis refaire les contrôles sur le domaine public. Ces vérifications distantes seront faites par vous : elles n'ont pas été exécutées par Codex.

## Retour arrière

Dans **Deployments**, sélectionner le précédent déploiement de production validé et ouvrir **… → Instant Rollback**, puis confirmer. Vérifier **Current**, le domaine et les pages. Le rollback réassigne les domaines à un build existant, sans modifier le Pi, Supabase ou Git. Il conserve les variables compilées de l'ancien build. Selon l'offre, les cibles de rollback disponibles peuvent être limitées au déploiement de production précédent. Ne pas supprimer ce déploiement de secours. [Instant Rollback](https://vercel.com/docs/instant-rollback).

## Validation locale et alertes restantes

Les résultats précis figurent dans [backend/REPORT.md](backend/REPORT.md). `npm audit --omit=dev` ne signale aucune vulnérabilité après mise à jour. L'audit complet conserve neuf alertes exclusivement dans l'outillage de développement : cinq hautes autour de braces/fast-glob/ESLint et quatre modérées autour du vieux esbuild de Drizzle Kit. npm propose des rétrogradations majeures ; elles ne sont pas appliquées. Ne pas exposer de serveur de développement esbuild ; éviter les motifs glob non fiables. Réévaluer ces outils lorsqu'un correctif compatible sera publié. Ces dépendances ne figurent pas dans les trois traces de fonctions API Vercel validées.

Les journaux, sauvegardes, archives personnelles et bundles restent dans `backend/artifacts/` ou `backend/backups/`, exclus du dépôt public. Un clone neuf peut reconstruire le bundle backend avec esbuild 0.25.12 et vérifier son empreinte ; il ne doit pas redéployer le Pi automatiquement.
