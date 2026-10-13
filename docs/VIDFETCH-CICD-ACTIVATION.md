# VidFetch — préparation CI/CD OVH, 13 octobre 2026

## 1. Résultat et périmètre

**VALIDÉ : infrastructure CI dédiée préparée et testée. NON TESTÉ : exécution réelle sur GitHub Actions et première activation du frontend public par ce pipeline.** Aucun push, fusion, dispatch, secret GitHub ou variable GitHub n'a été créé. Les deux verrous d'activation restent fermés.

Branche locale : `work/vidfetch-cicd-20261013`, dérivée de `a9103d474056469882a7f9dbc64fed98dc364e84`. Checkout : `backend/artifacts/cicd-20261013/checkout`. Le dépôt principal reste sur `work/vidfetch-secure-connection-20261012`, avec les **87 empreintes de fichiers de travail antérieurs identiques**. Les branches et checkouts précédents sont conservés.

La release publique reste **`689c592141287a1ca1e45569a89e5d76f18133ed`**, sur **127.0.0.1:3001**. Authentification Basic, noindex, sitemap fermé et médias 503 sont conservés. Full (strict) est **confirmé par l'utilisateur dans la mission** ; aucun tableau de bord Cloudflare n'a été consulté ou modifié ici. Les certificats restent vérifiés par des clients TLS stricts.

Le déploiement préparé est volontairement limité au **frontend en mode test**. Le moteur 8788 et la passerelle 8789 restent installés séparément ; leurs bundles sont compilés et testés dans la release mais jamais activés par ce pipeline. Une modification de leurs empreintes bloque la promotion et exige une revue administrative distincte.

## 2. Architecture et fichiers

```text
push main / workflow_dispatch
  → runner GitHub ubuntu-24.04, Node 22.23.3
  → npm ci --ignore-scripts, contrôles qualité, build Linux
  → archive + manifeste SHA-256, artefact GitHub conservé 7 jours
  → environnement Production, branche main uniquement
  → SSH vidfetch-deploy, clé dédiée, clé hôte épinglée
  → commande forcée, réception bornée, vérification root
  → vérification seule OU activation du frontend 3001
  → santé HTTP locale + TLS Caddy/auth/noindex/médias fermés
  → restauration de la release précédente en cas d'échec
```

| Fichier | Fonction |
|---|---|
| `.github/workflows/deploy.yml` | Déclencheurs main/manuels, contrôles, build, transfert, garde et résumé |
| `scripts/ovh/deploy.sh` | Client SSH exact, secrets temporaires 0600, hôte vérifié, verify/receive |
| `deploy/ovh/ci/dispatch.py` | Commande SSH forcée, limites et réception sans écrasement |
| `deploy/ovh/ci/promote.py` | Vérification privilégiée, garde, frontend seul, santé et rollback |
| `deploy/ovh/ci/release-lib.py` | Validation d'archive et bascule atomique, reprise du code déjà testé |
| `deploy/ovh/ci/rollback.py` | Récupération manuelle administrateur, inaccessible via le sudo CI |
| `deploy/ovh/ci/install.py` | Installation initiale avec sauvegardes ; ne pas relancer sur cet hôte déjà préparé |
| `deploy/ovh/ci/sudoers` | Unique permission sudo du compte CI |
| `deploy/ovh/ci/caddy-frontend-dependency.conf` | Dépendance Wants du frontend |
| `deploy/ovh/ci/exercise-vps.py` | Recette d'une unité temporaire isolée, aucun pointeur public modifié |
| `deploy/ovh/ci/audit.py` | Audit de cette intervention, permissions, empreintes et services |
| `deploy/ovh/tests/test_ci_frontend.py` | 13 tests supplémentaires de promotion, sécurité et échecs |
| `backend/validation/cicd-20261013.json` | Synthèse des résultats et empreintes des preuves privées |

Aucun changement des pages, traductions, contenus, dépendances npm, moteurs, variables applicatives ou code de téléchargement. Les scripts historiques de promotion complète sont conservés, mais le compte CI n'a plus le droit sudo de les appeler.

## 3. Changements réellement appliqués au VPS

Le compte existant **vidfetch-deploy**, UID 993, a été réutilisé. Mot de passe verrouillé ; home et `.ssh` contrôlés par root. Le CI se connecte sans root. Aucun changement de configuration sshd, aucune modification du pare-feu ou paquet installé sur le VPS.

Éléments ajoutés :

- `/usr/local/libexec/vidfetch-ci/` : helpers root ; aucun script d'une archive n'est exécuté comme root.
- `/var/lib/vidfetch-deploy/ci-incoming/` : seul nouvel emplacement accessible en écriture au compte CI.
- `/opt/vidfetch-ci-web/{releases,staging}` : releases immuables, preuves de réception et état transactionnel contrôlés par root.
- `/etc/vidfetch/ci-web-test-guard.json` : empreintes privées de **17 fichiers** de configuration protégés.
- Clé publique CI dans `authorized_keys`, avec `restrict` et commande forcée. L'ancien fichier était vide et a été sauvegardé.
- Sudoers remplacé après sauvegarde et validation `visudo` : seul `promote.py` est autorisé ; pas de shell, systemctl, éditeur ou gestionnaire de paquets arbitraire.

Le frontend conserve son pointeur `/opt/vidfetch-web-preproduction-20261013/current`. Aucun pointeur public ni ancienne release n'a changé.

**Correction systemd nécessaire :** l'unité Caddy exigeait le frontend via `Requires`, ce qui couplait son arrêt à une intervention sur le frontend. La seule ligne fonctionnelle modifiée dans l'unité sauvegardée conserve `Requires=vidfetch-https-test-ingress.service`. Un drop-in ajoute `Wants=vidfetch-web-preproduction-20261013.service`. `BindsTo` du garde réseau est préservé. Les listes de dépendances ne peuvent pas être vidées par un simple drop-in : une première tentative a été détectée comme inefficace, puis corrigée dans l'unité principale. `daemon-reload` a été exécuté ; **Caddy et le frontend public n'ont pas été redémarrés**.

Sauvegarde root privée : **`/var/backups/vidfetch-cicd-20261013-z0yl3sf8`**. Elle contient les anciens authorized_keys, sudoers, unité Caddy, empreintes/PID initiaux et versions intermédiaires corrigées. Les fichiers personnels, secrets applicatifs, certificats, bases de la passerelle et releases précédentes sont conservés.

## 4. Clé dédiée, identité du serveur et permissions

La nouvelle clé **ED25519 CI** est distincte de la clé personnelle. Empreinte publique CI :

`SHA256:Fa9zYCynonnHfKxbDT/FdbHshaac1SET3oNqN00YXkQ`

Empreinte ED25519 du VPS, relue via la connexion administrative déjà approuvée :

`SHA256:l1ccoE35ige/4AStJSjcEOWpjz80vTibVcNtYBgLBZ4`

Sur le Mac uniquement, dans un répertoire 0700 exclu de Git :

- `backend/artifacts/cicd-20261013/private/vidfetch_actions_ed25519` : clé privée, **0600**, sans passphrase pour le runner automatique.
- `backend/artifacts/cicd-20261013/private/vidfetch_actions_ed25519.pub` : clé publique.
- `backend/artifacts/cicd-20261013/private/known_hosts` : identité du VPS épinglée, **0600**.

La clé privée n'a pas été transférée au VPS, publiée, affichée ou journalisée. Les identifiants Basic et la clé de signature de la passerelle ne sont pas nécessaires au CI.

**Contrôles réels :** connexion CI réussie ; shell, commande sudo arbitraire, SFTP et redirection de port refusés ; mauvais host key refusé ; compte CI sans écriture dans l'application, `/etc/vidfetch`, les unités systemd, ses propres authorized_keys ou les helpers. Le mot de passe global SSH et les méthodes de récupération restent inchangés.

## 5. Fonctionnement du pipeline et garde-fous

Chaque push sur `main` déclenche le workflow ; les secrets ne sont utilisés que par le job de transfert après réussite du build, pour `aouirdani/vidfetch` et `refs/heads/main`. Aucun événement pull_request_target, workflow_run ou exécution de PR avec les secrets. Actions épinglées par SHA, permissions `contents: read`, checkout sans persistance du token, runner GitHub hébergé.

Contrôles inclus : ESLint, TypeScript, tests unitaires/frontend/SEO, backend, TLS/auth/tickets/concurrence de la passerelle, file bornée, scripts Python, scanner de secrets, build Next standalone et bundles, navigateur Chromium, HTML serveur et huit langues. Compilation côté GitHub, jamais sur le VPS. Les assets `.next/static`, `public` et contenus des guides sont inclus.

Un groupe de concurrence commun et `cancel-in-progress: false` empêchent deux runs simultanés. Un verrou fichier supplémentaire côté VPS refuse une seconde promotion. Avec la politique GitHub par défaut, un nouveau run peut remplacer un run encore en attente ; le run actif n'est pas annulé. Éviter une rafale de pushes pendant la première recette. Cette file n'est pas une garantie d'exécuter tous les commits intermédiaires. [Concurrence GitHub](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).

Modes manuels :

| `operation` | Effet |
|---|---|
| `validate` (défaut) | Qualité/build/SEO uniquement ; aucun SSH |
| `verify` | Sur main : transfert et validation root, sans activation ni redémarrage ; garde d'activation peut rester fermé |
| `deploy` | Sur main : nécessite variable GitHub `VIDFETCH_DEPLOY_ENABLED=true` **et** garde root approuvé |

Réception limitée à **350 MiB par archive**, espace uploads borné à environ **700 MiB avant nouvelle réception**, délai de réception 600 s, extraction limitée à 20 000 entrées et 1 200 MiB. SHA-256 de transport puis de chaque fichier ; rejet des chemins sortants, symlinks, fichiers spéciaux, `.env`, permissions privilégiées et manifests incomplets. Refus si moins de 3 GiB libres avant préparation. Une archive du même commit peut être réutilisée uniquement si son contenu est identique.

**Aucune purge automatique** des anciennes releases, uploads ou preuves. Les bornes arrêtent les futurs déploiements si le stockage devient insuffisant : prévoir une inspection et autorisation de nettoyage ultérieures. Aucun écrasement d'une release différente au même identifiant.

Promotion : journal d'intention persistant → symlink atomique → redémarrage du seul frontend → contrôle `/api/health` du commit exact, accueil 200 et download 503 → contrôle TLS de Caddy, Basic 401, noindex, médias 503, sitemap 404 → pointeur précédent conservé. Échec : restauration atomique et nouvelle vérification de l'ancienne release. Une restauration elle-même défaillante laisse le journal pour récupération manuelle. Une coupure électrique/SIGKILL n'est pas assimilée à un rollback automatique garanti.

**Cloudflare renvoie actuellement 403 aux requêtes HTTP issues du VPS lui-même**, avec `cfOrigin;dur=0`. Ce constat ne précise pas la règle Cloudflare responsable. Aucune règle n'a été modifiée. Le helper teste donc **Caddy en loopback avec SNI vidfetch.app et vérification de certificat complète**, sans désactiver TLS ni accepter 403 comme succès. La recette publique depuis le Mac passe. Le comportement HTTP depuis une IP de runner GitHub demeure NON TESTÉ ; un test public externe est requis après le premier vrai run.

## 6. Secrets et configuration manuelle GitHub

Audit en lecture seule : dépôt public, branche par défaut main ; **aucun secret repository, aucune variable repository, aucun secret Production**. Environnements Preview/Production existants, sans règles de protection ni restriction de branche constatées. `.github/workflows/deploy.yml` est **absent du main distant** (404). Aucun réglage n'a été écrit.

Le code utilise exactement :

| Nom | Type / emplacement recommandé | Contenu à fournir manuellement |
|---|---|---|
| `OVH_DEPLOY_SSH_KEY` | Secret de l'environnement **Production** | Fichier privé CI local précité, intégral, sans affichage dans un terminal ou rapport |
| `OVH_DEPLOY_KNOWN_HOSTS` | Secret de l'environnement **Production** | Fichier known_hosts vérifié précité |
| `VIDFETCH_DEPLOY_ENABLED` | Variable **repository** | `false` pendant préparation ; `true` seulement après autorisation d'activation |

`DEPLOY_HOST` et `DEPLOY_USER` sont des constantes du workflow et du client : VPS OVH et `vidfetch-deploy`. Il n'y a **pas de VPS_HOST, VPS_USER, clé Supabase, DATABASE_URL ou identifiant Basic à ajouter** pour ce workflow.

Étapes à effectuer par l'utilisateur après revue et autorisation :

1. GitHub → repository `aouirdani/vidfetch` → **Settings → Environments → Production**. Dans Deployment branches and tags, autoriser uniquement **main**. Configurer un reviewer de déploiement pour la première recette et vérifier la règle avant d'ajouter les secrets. Le dépôt public permet ces protections selon les options disponibles du compte. [Environnements GitHub](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments).
2. **Settings → Secrets and variables → Actions** : dans les secrets d'environnement, ouvrir/gérer **Production**, puis ajouter les deux noms ci-dessus via **Add environment secret**. Ils ne doivent pas être des variables ordinaires ni être dupliqués dans les secrets repository. La page Production expose aussi directement Environment secrets.
3. Depuis le Mac, ouvrir les fichiers privés localement ou copier leur contenu dans le presse-papiers sans impression. Exemple depuis la racine du projet : `pbcopy < backend/artifacts/cicd-20261013/private/vidfetch_actions_ed25519`, coller uniquement dans le champ secret correspondant, puis vider le presse-papiers. Procéder de même pour known_hosts. Ne jamais copier la clé personnelle.
4. Sur **Settings → Secrets and variables → Actions → Variables**, créer la variable repository `VIDFETCH_DEPLOY_ENABLED` à **false**.
5. Protéger main contre les modifications non revues, notamment du workflow. Préserver `contents: read` et les actions épinglées. [Sécurité Actions](https://docs.github.com/en/actions/reference/security/secure-use).

**Ces opérations manuelles ne sont pas effectuées dans cette phase.**

## 7. Premier run : étapes après autorisation distincte

Le bouton workflow_dispatch ne sera disponible normalement qu'une fois le workflow présent sur la branche par défaut. Un simple checkout local ou une branche distante isolée ne suffit pas ici. [Déclenchement manuel officiel](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch).

1. Autoriser séparément la publication de la branche préparée et l'intégration revue dans main. **Ne pas pousser/merger pendant cette mission.** Le premier push main lancera les contrôles mais ne déploiera pas tant que la variable est false et le garde absent.
2. Après secrets et protections vérifiés : **Actions → Validate and deploy VidFetch → Run workflow → branch main → operation validate**. Attendre tous les contrôles, consulter logs et artefact `release-<SHA>.tgz`.
3. Avec un accord de test réel : même écran, **operation verify**. Approuver l'environnement si demandé. Attendre `activated: false`, `validated: true` ; les services doivent rester sur 689c592… et avec leurs PID inchangés. Ne pas confondre ce résultat avec une activation.
4. Après validation de l'archive et autorisation du premier changement de release, ouvrir le garde VPS **comme administrateur**. Exemple à exécuter uniquement à ce moment, sur le VPS :

   ```sh
   sudo python3 - <<'PY'
   import os
   path = '/etc/vidfetch/ci-web-test-ready'
   fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
   with os.fdopen(fd, 'w') as stream:
       stream.write('APPROVED_FRONTEND_TEST\n')
   PY
   ```

5. Passer la variable repository à true, puis lancer **operation deploy** sur main, avec l'accord demandé. Prévoir quelques secondes de redémarrage du frontend ; Caddy garde TLS et les protections. Le premier run est à surveiller, aucune promesse de zéro interruption du frontend n'est faite.
6. Contrôler le résumé, le commit annoncé sur `/api/health` local/authentifié, les huit langues, 401 anonyme, noindex, sitemap 404 et médias 503. Examiner `journalctl -u vidfetch-web-preproduction-20261013.service` sans publier les journaux bruts. Confirmer les PID moteur/passerelle inchangés.
7. Pour que les push suivants déploient sans clic, laisser les deux gates ouverts et décider, après la première recette, de retirer le reviewer obligatoire de l'environnement **tout en conservant main comme seule branche autorisée et sa revue de code**. Si ce reviewer reste requis, le pipeline attendra une approbation à chaque fois : ce ne sera pas une activation entièrement automatique.

Ces étapes ne retirent **jamais** Basic, noindex ou le blocage des médias. La sortie du mode test constitue une mission séparée avec nouvelle autorisation.

## 8. Résultats réellement obtenus

| Contrôle | Résultat / preuve |
|---|---|
| YAML / expressions du workflow | **VALIDÉ** par actionlint **1.7.12**, binaire officiel vérifié par SHA-256 ; `sh -n` et syntaxe Python passent |
| ESLint / TypeScript | **VALIDÉ**, logs `lint.log` et `typecheck.log` |
| Tests applicatifs / SEO | **VALIDÉ : 131** sous Node **22.23.3 Linux** ; également 131 sur le Mac initialement Node 25 |
| Backend | **VALIDÉ : 17** sous Node 22 Linux, dont timeouts, backpressure, erreurs et déconnexion |
| Passerelle / file | **VALIDÉ : 2 + 4** sous Node 22 Linux, authentification TLS, tickets, replay, concurrence, charge synthétique bornée |
| Scripts de déploiement | **VALIDÉ : 18** sur Mac ; **13 nouveaux tests** contre le helper installé sous Python **3.13.5 Debian 13** |
| Build production | **VALIDÉ**, Linux x64 Node 22.23.3, **1 684 fichiers** manifestés, Next standalone et deux bundles ; checks Node réussis |
| Compatibilité moteur/passerelle | **VALIDÉ**, nouveaux bundles reconstruits identiques à ceux de la release frontend de référence |
| Build HTML / multilingue | **VALIDÉ : 38 pages**, huit langues, RTL, canonicals, hreflang réciproques, 16 entrées sitemap sans brouillons, API inchangées, huit transferts synthétiques |
| SSH dédié | **VALIDÉ**, 8 contrôles ; archive **27 553 757 octets** transférée et vérifiée sans activation |
| Client exact `deploy.sh` | **VALIDÉ**, transfert verify réexécuté sans écrasement ; mauvaise clé hôte refusée ; clé privée absente des sorties |
| Permissions effectives | **VALIDÉ**, seule zone de réception accessible en écriture ; sudo arbitraire refusé |
| Activation/rollback isolés | **VALIDÉ**, unité temporaire sur 127.0.0.1:3012 : promotion saine, échec HTTP avec retour arrière, interruption simulée avec retour arrière |
| Persistance / nettoyage fixture | **VALIDÉ**, fichier persistant et 3 releases conservés, unité temporaire arrêtée, port 3012 fermé, aucun processus moteur orphelin |
| Site public | **VALIDÉ**, huit parcours authentifiés, canonical/hreflang/RTL/404, **12 médias 503**, authentification/noindex/robots/redirects ; aucune erreur 521 |
| Préservation des services | **VALIDÉ**, SSH 869, moteur 9270, passerelle 9271, ancien web 12561, web public 25013, Caddy 39987 : mêmes PID avant/après |
| Secrets / Git | **VALIDÉ**, scanner sans anomalie, clé privée ignorée, empreintes du travail antérieur identiques |
| Actions sur runner GitHub | **NON TESTÉ**, aucun dispatch ni push autorisé |
| Promotion/rollback du vrai frontend public par CI | **NON TESTÉ**, seuls transferts verify et unité isolée exécutés |
| Coupure électrique / SIGKILL / reboot | **NON TESTÉ**, journal de récupération prévu ; aucun redémarrage du VPS |
| HTTPS public depuis le VPS via Cloudflare | **ÉCHEC : 403** à l'edge ; origine stricte et accès public depuis le Mac validés, règle exacte non identifiée |
| Activation automatique | **BLOQUÉE volontairement**, secrets absents, variable absente, garde root absent, workflow absent du main distant |

Le build utilise les sources applicatives inchangées héritées de **a9103d4…**, avec cet identifiant comme `VIDFETCH_RELEASE` pour la recette locale. Les nouveaux fichiers CI ne sont pas du code applicatif embarqué. Un vrai runner construira le SHA exact de son run. Les dépendances Linux déjà verrouillées/cachées ont été réutilisées ; une installation `npm ci` sur un runner GitHub vierge reste NON TESTÉE dans cette phase.

Incidents de recette corrigés, sans modification applicative : OpenSSL absent de l'image Docker minimale (ajout dans le conteneur jetable uniquement) ; Python 3.11 de cette image sans `tarfile` data filter (tests pertinents rejoués sous Python 3.13 du VPS) ; tests utilisant `/tmp` tmpfs inférieur au seuil de 3 GiB (espace disque simulé dans les tests unitaires, test de refus de disque bas ajouté). Les limites réelles du helper ne sont pas abaissées. Les erreurs de sockets/DNS du sandbox ont été suivies d'exécutions autorisées hors sandbox.

## 9. Ressources et preuves

Mesure instantanée finale : frontend public **79,04 MiB**, Caddy **20,85 MiB**, moteur **15,66 MiB**, passerelle **16,40 MiB** ; **3 238 MiB disponibles** sur 3 826 ; environ **35 GiB libres**, aucun swap ajouté. L'ancien frontend demeure disponible en loopback.

Recette systemd isolée : **35,539 s** pour les scénarios ; dernière instance de fixture : MemoryPeak **9,82 MiB**, CPU **0,106 s**. Ce sont des mesures de fixture HTTP synthétique, pas un benchmark de conversions ni le maximum de toutes les instances cumulées.

Preuves locales privées : `backend/artifacts/cicd-20261013/`, notamment `vps-final.json`, `vps-rollback.json`, `ssh-validation.json`, `client-validation.json`, `public-after-cicd-v2.json`, logs de build/tests et résumé versionné `backend/validation/cicd-20261013.json`. Les premiers logs en échec sont conservés avec les suivants réussis.

Recette isolée réussie conservée sur le VPS : `/opt/vidfetch-ci-validation-20261013-c6z7hbrg/result.json`. La première fixture interrompue et ses preuves restent présentes. Aucun de ces répertoires n'est utilisé par Caddy.

## 10. Retour arrière et arrêt des activations

Pendant cette phase, le site sert toujours sa release d'origine : **aucun retour arrière applicatif n'est nécessaire**.

Après un futur déploiement, en cas d'échec détecté, le helper restaure automatiquement le pointeur et vérifie l'ancienne release. Pour une récupération manuelle après activation ou transaction interrompue :

1. Remettre `VIDFETCH_DEPLOY_ENABLED` à false dans GitHub et fermer le garde root en le renommant vers une sauvegarde unique, sans suppression. Attendre/inspecter le verrou et tout run en cours ; ne pas tuer aveuglément une transaction.
2. En SSH administrateur, exécuter **`sudo /usr/local/libexec/vidfetch-ci/rollback.py`**. Le script lit `pending.json` ou `previous.json`, cible uniquement un répertoire de release autorisé, restaure 3001 et teste HTTP/TLS. Il ne redémarre ni moteur, ni passerelle, ni Caddy et ne supprime pas de release. Il échoue explicitement s'il n'existe encore aucune transaction/précédente release CI.
3. Vérifier les pages protégées, noindex, médias 503, logs du frontend et santé locale. En cas d'échec de rollback, conserver le journal et examiner les releases avant toute intervention supplémentaire.

Le script manuel de récupération est préparé et sa syntaxe validée ; son exécution sur le **vrai frontend public** reste NON TESTÉE pour préserver sa disponibilité. Le cœur de restauration atomique avec redémarrage et santé a été réellement testé sur l'unité isolée.

Pour révoquer l'accès CI, sauvegarder puis retirer uniquement sa ligne dédiée dans authorized_keys comme administrateur ; inspecter les éventuelles autres clés avant toute restauration du fichier de sauvegarde. Ne pas rétablir automatiquement l'ancien droit sudo de migration complète. Ne pas remplacer les configurations Caddy/pare-feu globales pour revenir à une release frontend.

**Restent à autoriser :** publication/intégration Git revue, configuration des secrets et protections GitHub, premier workflow_dispatch verify, puis ouverture des gates et premier deploy. Ni les médias publics ni la levée de l'authentification/indexation ne font partie de ces autorisations.
