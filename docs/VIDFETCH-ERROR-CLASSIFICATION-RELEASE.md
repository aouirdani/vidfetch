# Classement des erreurs : pourquoi moteur, passerelle et frontend doivent être livrés ensemble

Document du 13 octobre 2026. Il accompagne le correctif de classement des erreurs (PR séparée de l'audit YouTube). **Rien n'est déployé.** Ce correctif n'active pas YouTube et n'ajoute aucun contournement.

## En bref

- Ne pas fusionner cette PR avant la recette privée MP4/MP3 : elle rendrait impossible le déploiement du frontend par la CI, dont la recette a besoin.
- La fusionner uniquement lorsqu'une livraison conjointe du moteur, de la passerelle et du frontend est planifiée.
- **Il n'existe pas aujourd'hui de procédure testée pour livrer le moteur et la passerelle sur ce VPS.** Elle est à écrire et à tester avant la fusion.

## 1. Ce que la PR change dans les artefacts protégés

| Bundle | En service et dans `main` | Avec cette PR | Cause |
|---|---|---|---|
| `backend/vidfetch-ovh.cjs` (moteur) | `fa0d3d4e…c42287` | `f172a88f…a2ed7e` | nouveau classement dans `src/lib/engine.ts` |
| `backend/vidfetch-gateway.cjs` (passerelle) | `0fa14045…9850e5` dans `main` | `81c913b0…39424f` | la passerelle embarque tous les dictionnaires (`backend/gateway/helper.ts`), et trois messages y sont ajoutés |

Empreintes obtenues par un build de release sur Linux x86_64 ; celles de `main` sont identiques au manifeste de la release frontend active (`f23ca65b`).

Le promoteur CI (`deploy/ovh/ci/promote.py`) refuse toute release dont l'un de ces deux fichiers diffère de la release frontend en cours : « Engine/gateway artifact changed; separate administrator review required ». Une fois la PR fusionnée, **plus aucun déploiement frontend par la CI ne passe** tant qu'un administrateur n'a pas mis en place une release contenant les nouveaux bundles.

## 2. Pourquoi ensemble, et pas l'un après l'autre

| Moteur | Frontend | Ce que voit le visiteur pour le blocage anti-robot de YouTube |
|---|---|---|
| ancien | ancien | « Cette source exige une autorisation ou est indisponible… » (état actuel : vague mais honnête) |
| **nouveau** | ancien | « L'opération n'a pas pu aboutir. Réessayez plus tard. » : moins bon qu'aujourd'hui, et « réessayez » est trompeur |
| ancien | **nouveau** | « Cette vidéo exige la connexion à un compte… » : **faux**, la vidéo est publique |
| nouveau | nouveau | « La plateforme source refuse les demandes automatisées provenant de notre serveur… » : correct |

Seule la dernière ligne est acceptable. La passerelle relaie le statut et le JSON du moteur sans les modifier ; elle change uniquement parce qu'elle contient les dictionnaires. Elle doit suivre pour que le manifeste de la release corresponde à ce qui tourne.

## 3. État réel du VPS (lecture seule, 13 octobre)

- Le moteur et la passerelle s'exécutent depuis `/opt/vidfetch/releases/ovh-20261012-rnllrb69-ipv4/`, installé à la main le 12 octobre. Ils ne suivent pas le pointeur de release du frontend.
- Le moteur en service est identique à celui de `main` (`fa0d3d4e…`).
- **La passerelle en service n'est celle d'aucun commit** (`a703f269…`, 41 610 octets, contre 167 503 pour celle de `main`). Il lui manque le point `/auth/deployment`, la mise en maintenance (« drain ») et la page d'aide traduite. Le garde CI ne le voit pas : il compare les manifestes des releases frontend, pas les fichiers exécutés. Le pré-vol de la Phase 10 (`00-preflight.sh`, révision 2) l'affiche désormais.
- Le promoteur administratif existant (`deploy/ovh/vidfetch-promote.py`) sait livrer moteur, passerelle et frontend ensemble, avec mise en maintenance. Mais il exige que les trois services utilisent `/opt/vidfetch-web/current` et que le garde `/etc/vidfetch/full-migration-ready` soit ouvert. Ce n'est pas la disposition actuelle : **il refuserait de s'exécuter**.

## 4. Ce que la livraison conjointe devra garantir

Liste d'exigences, pas une procédure : celle-ci reste à écrire et à tester.

1. Un seul build : l'artefact produit par la CI pour le commit fusionné, sans reconstruction. Vérifier les deux empreintes de la section 1 dans son `manifest.json`.
2. Aucun transfert en cours ; arrêt contrôlé, puis redémarrage du moteur et de la passerelle (services protégés) sur les nouveaux fichiers. L'ancien répertoire de release est conservé pour le retour arrière.
3. La release frontend du même build devient la release courante, pour que le manifeste corresponde aux fichiers exécutés. Le promoteur CI ne peut pas le faire (il refuse) : c'est une action d'administrateur.
4. Mise à jour du garde CI par `guard-update.py` pour chaque fichier modifié, nommé explicitement.
5. Vérifications : `/api/health` du moteur et de la passerelle, isolation du moteur inchangée, apex 401 et noindex, routes médias de l'apex fermées, puis une demande sur une vidéo YouTube publique doit répondre `503 UPSTREAM_BLOCKED` avec le nouveau message.
6. Retour arrière : repointer les unités vers l'ancien répertoire, redémarrer, remettre la release frontend précédente, restaurer le garde.

## 5. Ordre recommandé par rapport à la recette

1. Recette privée d'abord, avec `main` sans cette PR : le frontend de `main` doit pouvoir être déployé par la CI.
2. Décider du sort de la passerelle en service (section 3) : c'est un préalable à la recette, indépendant de cette PR.
3. Écrire et tester la procédure de livraison du moteur et de la passerelle.
4. Fusionner cette PR, livrer les trois composants ensemble, vérifier.

YouTube reste désactivé tant que les tests réels depuis OVH échouent (voir `docs/VIDFETCH-YOUTUBE-AUDIT.md`).
