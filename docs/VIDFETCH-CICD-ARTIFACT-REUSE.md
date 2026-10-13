# VidFetch — correction du conflit d'archives CI/CD

Diagnostic du 13 octobre 2026, depuis main `998895dd0e310f8a4ab4b9755353920816b7e140`. Branche corrective `fix/cicd-verified-artifact-20261013`. Aucun déploiement, modification de service ou nettoyage OVH effectué. La première opération distante a remis **VIDFETCH_DEPLOY_ENABLED=false**, puis sa valeur a été relue. Le garde root reste présent et ouvert, sans modification.

## Cause vérifiée

Le workflow précédent lançait un build indépendant à chaque dispatch, tout en identifiant uploads et releases uniquement par le SHA Git. Deux builds Next.js du même commit ne produisent pas nécessairement les mêmes octets. `dispatch.py` a correctement refusé de remplacer l'archive déjà reçue ; supprimer ce refus aurait seulement déplacé le conflit vers `promote.py`, qui refuse également une release différente sous le même SHA.

Les logs confirment un build dans les deux runs et un téléchargement d'artefact GitHub valide avant le refus SSH :

| Run | Résultat | Taille TAR.GZ | SHA-256 du TAR.GZ |
|---|---|---:|---|
| [verify 38402143454](https://github.com/aouirdani/vidfetch/actions/runs/38402143454) | validated=true, activated=false | 27 715 847 octets | `0ec364993f3f521b11c52e2009dee2325399444f0786a76860dd921e32426f05` |
| [deploy 38407395247](https://github.com/aouirdani/vidfetch/actions/runs/38407395247) | Existing upload differs; no overwrite permitted | 27 716 536 octets | `f3d1ac8705281507ee9ee0d5826cb8f785ce1c55f95d931aa392fb3d63585259` |

Les conteneurs ZIP GitHub ont des identifiants et empreintes distincts des TAR.GZ :

- verify : artefact **11815912168**, ZIP `e74b44d748a07bef30185f5491d50670ae5450444e80469a9d372424f51d3a22` ;
- deploy : artefact **11819009706**, ZIP `1e1e3e7e0fe3fb0161e46d3d4a8d01c248e2039da6f17f133a31dbfed49daa73`.

Comparaison des archives téléchargées localement :

- même commit, plateforme linux-x64 et Node v22.23.3, **1 684 fichiers manifestés chacune** ; tous leurs SHA-256 internes ont été recalculés ;
- **247 fichiers de même chemin diffèrent**, notamment BUILD_ID, HTML/RSC, manifests Next et valeurs générées pour preview/Server Actions ; aucune valeur cryptographique n'est reproduite dans ce rapport ;
- BUILD_ID `-H_DJrjraZEh16RN5iMz8` contre `x85nlCEeLVtYHP6xroF8Y` ; trois fichiers statiques changent aussi de chemin avec cet identifiant ;
- **2 077 entrées communes** présentent des différences dans le tuple de métadonnées TAR (mtime, uid, gid, mode, taille) ;
- moteur et passerelle sont identiques ; leurs empreintes ne figurent pas parmi les différences ;
- normaliser TAR/gzip ou fixer seulement BUILD_ID ne résoudrait pas les autres différences de contenu.

Il s'agit donc d'une **collision d'identifiant Git entre deux builds non reproductibles**, avec différences de contenu et de métadonnées. Il n'y a pas de preuve de corruption du transport : les deux empreintes locales correspondent exactement aux deux fichiers conservés sur le VPS. Next.js recommande d'utiliser le même build entre instances ; il génère un identifiant de build et des données de chiffrement lors de la compilation. [Documentation officielle Next.js](https://nextjs.org/docs/app/guides/self-hosting).

## Correctif

Le build se fait une fois. Les opérations manuelles réutilisent une archive précise, sans reconstruire Next.js ni refaire le TAR.GZ.

| Événement | Comportement |
|---|---|
| push main | Contrôles et build ; transfert/activation uniquement si variable true et garde root conforme |
| validate | Contrôles et build ; aucun SSH |
| verify + artifact_run_id | Réutilise l'archive d'un run réussi du même commit main, transfert et contrôle sans activation |
| deploy + artifact_run_id | Réutilise l'archive d'un run ayant aussi réussi son job de transfert ; activation soumise aux verrous existants |

`artifact_run_id` est obligatoire pour verify/deploy. Le job build est alors explicitement ignoré. Le job de transfert utilise `always()` avec contrôles du résultat de build, de l'événement, du dépôt, de la branche et de l'annulation : il peut suivre un build volontairement ignoré mais jamais un build automatique échoué.

`scripts/ovh/reuse-release.py` vérifie via GitHub : dépôt et dépôt d'origine exacts, main, SHA exact, workflow deploy.yml et son ID, événement autorisé, succès du run et unicité de l'artefact. Pour deploy, le dernier attempt doit contenir le job deploy réussi : un simple validate n'est pas une preuve de vérification OVH. Un run échoué, expiré, d'une autre branche, d'un fork ou d'un autre commit est refusé.

Le ZIP est téléchargé avec une limite et son SHA-256 est comparé au digest GitHub **avec arrêt sur divergence**. Il doit contenir uniquement le TAR.GZ attendu, borné à 350 MiB. Son manifeste doit annoncer le commit et la plateforme attendus. Les chemins ZIP sont contrôlés, aucun code de la release n'est exécuté, aucun fichier préexistant n'est écrasé. Les validations intégrales des fichiers restent ensuite effectuées par le helper root OVH inchangé. [API officielle des artefacts GitHub](https://docs.github.com/en/rest/actions/artifacts).

Après un transfert manuel réussi, l'archive exacte est publiée dans le run verify/deploy pour réutilisation pendant 30 jours. Seule l'enveloppe ZIP GitHub peut changer ; le TAR.GZ reste identique. Son empreinte, le run et l'ID d'artefact source apparaissent dans le résumé. Pour le push automatique, une comparaison stricte avec l'empreinte produite par le job build protège aussi le passage entre jobs.

Aucun nouveau secret : seul le GITHUB_TOKEN automatique reçoit `actions: read` dans le job de transfert, en plus de `contents: read`. Les secrets Production restent limités à l'étape SSH existante. Aucun déclencheur PR avec secrets n'est ajouté.

Une identité de release basée sur le hash de contenu aurait aussi été possible, mais aurait exigé une évolution coordonnée des chemins, manifestes et helpers privilégiés. La réutilisation exacte corrige ce problème sans modification du VPS ni affaiblissement de l'immuabilité. Aucun upload, staging ou ancienne release n'est supprimé.

## État OVH confirmé en lecture seule

- Public/current : **689c592141287a1ca1e45569a89e5d76f18133ed**, frontend 3001 ; /api/health=200, downloads.available=false.
- Release 998895dd… vérifiée, extraite mais **non activée** dans `/opt/vidfetch-ci-web/releases/998895dd0e310f8a4ab4b9755353920816b7e140`. Ses 1 684 fichiers correspondent tous au manifeste et aucun fichier supplémentaire n'a été trouvé.
- Archive acceptée : `/var/lib/vidfetch-deploy/ci-incoming/998895dd0e310f8a4ab4b9755353920816b7e140.tgz` ; hash égal au verify ci-dessus.
- Archive refusée conservée : `/var/lib/vidfetch-deploy/ci-incoming/upload-260n2yua` ; hash égal au deploy ci-dessus.
- Manifeste extrait : `c3cb8c127c410f5a89d52f0b37625780ec3c8a798dc06b674a90ea265556316d`, identique au verify.
- Aucune transaction de récupération en attente. Aucune bascule ni nécessité de rollback observée.
- PID inchangés : SSH 869, moteur 9270, passerelle 9271, frontend public 25013, Caddy 39987. Tous actifs. Le moteur retourne santé 200 ; la passerelle refuse la requête non authentifiée (403), ce qui ne constitue pas un test de santé authentifié.
- HTTPS public : accueil **401 Basic**, **noindex, nofollow**, cache privé ; `/api/download` **503**. Certificats, Caddy, fichiers d'authentification, passerelle et moteur non modifiés.

## Tests

- **VALIDÉ :** ESLint, TypeScript, Actionlint, syntaxe shell et contrôle Git des espaces.
- **VALIDÉ :** 131 tests applicatifs/SEO sur Mac et Linux Node 22.23.3.
- **VALIDÉ :** 17 tests backend, 2 tests de passerelle TLS et 4 tests de file/charge synthétique, rejoués localement. Avec les 27 tests Python, **181 tests distincts** passent ; les 131 tests rejoués sur les deux plateformes ne sont pas comptés deux fois.
- **VALIDÉ :** 27 tests Python de déploiement, dont 9 ajouts. La régression utilise les vrais dispatch.py/promote.py dans des répertoires temporaires, avec uniquement les effets système/service simulés : verify → deploy → deploy idempotent, archive différente refusée, SHA incorrect refusé, fichiers persistants et releases antérieures conservés. Ce n'est pas une activation OVH.
- **VALIDÉ :** sélecteur exécuté contre le vrai artefact GitHub du verify réussi ; téléchargement local seulement, empreinte exacte `0ec364…26f05`, sans SSH ni exécution du frontend.
- **VALIDÉ :** npm ci --ignore-scripts propre, lint, TypeScript, tests et build standalone Linux Node 22.23.3 ; bundles moteur/passerelle vérifiés par node --check. Sources applicatives et lockfile inchangés.
- **ÉCHEC initial expliqué :** npm test dans le sandbox Mac refuse le socket IPC de tsx (EPERM) ; rejoué avec permission, succès. Le premier essai réseau du sélecteur était également bloqué par le sandbox ; l'essai autorisé réussit.
- **NON TESTÉ :** nouveau workflow sur GitHub, promotion réelle et rollback du frontend public. Aucun dispatch lancé pendant cette correction.

Les traces détaillées, archives, manifestes comparés et sorties de tests sont conservés uniquement dans `backend/artifacts/cicd-upload-fix-20261013/`, ignoré par Git. Les archives ne font pas partie de la PR.

## Procédure après revue et autorisations

1. Garder **VIDFETCH_DEPLOY_ENABLED=false** pendant la revue et la fusion future de la PR corrective. Ne pas relancer l'ancien deploy avec Re-run all jobs : il reconstruirait une archive différente.
2. Après fusion autorisée, le nouveau main possède un **nouveau SHA**. Son run push lance qualité/build et ignore deploy. Attendre son succès. Conserver le numéro de ce run ; un validate manuel réussi peut également servir de source.
3. Après accord pour le transfert : Run workflow → main → **verify**, `artifact_run_id=<run de build réussi pour ce même nouveau SHA>`. Attendre validated=true, activated=false ; le résumé doit afficher rebuilt=false et le SHA-256 du TAR.GZ. Noter le numéro de ce run verify.
4. **Attendre une autorisation distincte de deploy.** Vérifier à nouveau les protections, l'état actuel et l'absence de transaction en attente. Ensuite seulement passer la variable à true ; ne pas publier d'autre commit pendant cette première activation.
5. Run workflow → main → **deploy**, `artifact_run_id=<run verify réussi de l'étape 3>`. Le build doit être ignoré ; l'archive doit avoir exactement la même empreinte qu'à l'étape 3. Le helper installé réutilise l'upload et la release immuables, puis applique les contrôles et rollback existants.
6. Contrôler activated=true, santé au nouveau SHA, Basic Auth/noindex/médias fermés, huit langues et PID moteur/passerelle/Caddy inchangés. Un résultat de test local ne remplace pas cette validation réelle.

L'ancien run verify 38402143454 correspond à **998895dd…** : après fusion du correctif, il ne peut pas être sélectionné pour le nouveau main (SHA différent), et sera correctement refusé. Ses fichiers OVH restent conservés ; les nouveaux runs utilisent une nouvelle identité Git.

Pour réexécuter une activation du même SHA, lancer un **nouveau dispatch deploy avec le même run verify**, pas un nouveau build. Si l'artefact source expire, disparaît, ou si main change entre étapes : arrêt explicite. Ne jamais substituer un build différent sous le même SHA ni nettoyer un upload pour forcer le passage. Inspecter et autoriser séparément toute récupération/archivage. Les runs échoués ne sont pas acceptés comme source dans cette version conservatrice.

En cas d'échec futur de santé après bascule, le rollback existant reste celui de [VIDFETCH-CICD-ACTIVATION.md](VIDFETCH-CICD-ACTIVATION.md#10-retour-arrière-et-arrêt-des-activations). Aucun retour arrière n'a été nécessaire pendant cet incident, qui a été refusé avant activation.
