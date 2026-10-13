# VidFetch — Phase 4, préparation de la mise en ligne OVH

Rapport du **13 octobre 2026**. Recette privée terminée ; **aucune activation publique effectuée**. Ce document complète les rapports OVH et international sans les remplacer.

## État exact

La release applicative **`689c592141287a1ca1e45569a89e5d76f18133ed`** est installée et saine sur **`127.0.0.1:3001`**. Le frontend candidat antérieur reste sur `127.0.0.1:3000`. Le moteur et la passerelle existants restent inchangés sur `127.0.0.1:8788` et `127.0.0.1:8789`.

La branche de préparation est **`work/vidfetch-ovh-launch-preparation-20261013`**, dérivée de `work/vidfetch-international-seo-20261012`. Checkout : `backend/artifacts/ovh-launch-20261013/checkout`. Aucun push, aucune fusion, aucun changement DNS, Cloudflare, Vercel, Supabase ou Raspberry Pi. Aucun redémarrage du VPS.

Les quatre commits de migration, les deux commits internationaux et les anciennes branches/checkouts sont préservés dans le même dépôt Git. Les **87 empreintes** du travail initial correspondent encore à l'inventaire de consolidation ; aucun conflit Git. Le checkout principal reste sur `work/vidfetch-secure-connection-20261012`, avec son travail non commité intact. Aucun changement des sources applicatives dans cette phase : la release testée reste exactement celle annoncée, les nouveaux fichiers concernent la préparation et la recette.

| Élément | État final vérifié |
|---|---|
| Nouveau frontend multilingue | `vidfetch-web-preproduction-20261013.service`, actif, **disabled** au démarrage, loopback 3001 |
| Ancien frontend candidat | `vidfetch-web-candidate.service`, actif, PID **12561**, boot désactivé, loopback 3000 |
| Moteur | `vidfetch.service`, actif/activé au boot, PID **9270**, loopback 8788 |
| Passerelle | `vidfetch-gateway.service`, active/activée au boot, PID **9271**, loopback 8789 |
| SSH | Actif, PID **869**, paramètres inspectés inchangés |
| Caddy public / frontend public permanent | `vidfetch-caddy.service`, `caddy.service`, `vidfetch-web.service` absents/inactifs |
| Bancs temporaires Phase 4 | Les quatre unités `vidfetch-launch-fixture-*` sont arrêtées ; fichiers conservés |
| Ports 80/443 | Aucune écoute ; aucune nouvelle exposition publique |
| Pare-feu | Ruleset initial inchangé ; seule table existante `inet vidfetch_egress`, filtrage OUTPUT du worker |
| Domaine public | **HTTP 521** encore constaté ; aucune tentative de corriger cela par une activation non autorisée |

L'absence d'écoute HTTP(S) à l'origine est cohérente avec le 521. Le pare-feu réseau OVH et les réglages privés Cloudflare ne sont pas accessibles dans cet audit : ils doivent également être vérifiés avant de conclure que ce sera l'unique cause. Le port 5355 déjà présent est conservé ; aucune règle SSH ou politique globale de pare-feu n'a été changée.

## Reprise après interruption et diagnostic SSH

La reprise a confirmé une connexion non interactive réussie avec la clé du Mac, `BatchMode=yes` et **`StrictHostKeyChecking=yes`**. Les preuves des tests de sécurité et de lifecycle ont été retrouvées complètes et réussies ; elles n'ont pas été rejouées. L'ancien exit 1 sans diagnostic n'a pas été reproduit et sa cause exacte reste **NON DÉTERMINÉE**. Un code non nul d'une commande distante ne suffit pas à conclure à une panne d'authentification SSH.

Une tentative ultérieure de lecture média a été refusée par le sandbox local (`Operation not permitted`, exit 255), puis réussie avec l'autorisation d'exécution hors sandbox. L'avertissement de locale `en_US.UTF-8` reste non bloquant ; aucune modification système de locale n'a été faite. Aucune clé privée, variable secrète ou URL de ticket n'est incluse dans les rapports.

## Installation et compilation conservées

- Construction neuve Linux x86_64 avec Node **22.23.3**, Next **16.4.0**, Turbopack, conteneur sans réseau limité à 2 CPU/2 GiB ; aucune `DATABASE_URL` nécessaire.
- Frontend standalone, assets et contenus inclus ; moteur et passerelle compilés et vérifiés avec `node --check`.
- **1 684 fichiers** couverts par le manifeste SHA-256 ; archive de **27 553 757 octets**.
- SHA-256 de l'archive : `f2ea49aedf9f9ee729f8098393d1b051761dcae70023491a4a127529f2abf0b4`.
- Release root-owned dans `/opt/vidfetch-web/releases/689c592141287a1ca1e45569a89e5d76f18133ed` ; installation dans un nouveau chemin, sans remplacement d'une release existante.
- Nouveau pointeur `/opt/vidfetch-web-preproduction-20261013/current`. L'ancien `/opt/vidfetch-web/current` vise toujours `cbbd4fd974ff092c02e08d226e3e864fc8900382`.
- Utilisateur existant `vidfetch-web`, heap 256 MiB, MemoryHigh 512 MiB, MemoryMax 768 MiB, CPUQuota 100 %, TasksMax 96, protections systemd et espaces d'état/cache séparés.
- Aucun paquet réinstallé, aucun backend ni environnement existant remplacé. L'installation et les tests de lifecycle touchent uniquement la nouvelle unité de préproduction.

Les artefacts et données de test sont conservés sur le Mac dans le dossier parent du checkout, sur le VPS dans `/home/debian/vidfetch-launch-20261013-aYEw5S6D`, `/opt/vidfetch-launch-fixture-20261013` et les répertoires d'état `vidfetch-launch-*`. Ils ne sont ni publiés ni ajoutés à Git. Ne pas rejouer les installateurs datés sur ces chemins : ils refusent leur réutilisation.

## Huit langues et SEO réellement testés sur OVH

| Langue | Accueil | HTML serveur, mobile, sélecteur, erreur et 404 localisées |
|---|---|---|
| Anglais | `/` | VALIDÉ |
| Français | `/fr/` | VALIDÉ |
| Espagnol | `/es/` | VALIDÉ |
| Portugais brésilien | `/pt/`, lang `pt-BR` | VALIDÉ |
| Indonésien | `/id/` | VALIDÉ |
| Allemand | `/de/` | VALIDÉ |
| Italien | `/it/` | VALIDÉ |
| Arabe | `/ar/`, lang `ar`, dir `rtl` | VALIDÉ, champ URL LTR et transfert MP3 réel |

**38 pages** ont été vérifiées en HTML serveur. Canonical auto-référente, huit équivalents linguistiques réciproques, `x-default`, sitemap de **16 URL** (accueils et pages légales), robots, redirections de préfixes et vraies 404 ont été contrôlés. Aucun appel API n'est déplacé sous un préfixe de langue. Aucun débordement mobile ni erreur navigateur constaté pendant les huit parcours.

Les **70 traductions de guides** restent en `review`, non routables (404) et hors sitemap. Les dix guides anglais sont préservés, accessibles mais **noindex**, avec `published: null`. Les huit index éditoriaux restent noindex ; les quatre anciennes pages plateformes sont des notices noindex. Les nouvelles pages spécialisées restent indisponibles. Les pages YouTube restent bloquées par le contrôle anti-bot OVH signalé précédemment ; aucune extraction YouTube nouvelle n'a été tentée.

Ces résultats ne valent pas relecture linguistique native, publication éditoriale ou indexation réelle. Le proxy de recette publique préparé impose en plus `X-Robots-Tag: noindex, nofollow` tant que la publication n'est pas approuvée.

## Téléchargements, sécurité et ressources

La recette utilise le trailer libre Big Buck Bunny fourni par W3C, `https://media.w3.org/2010/05/bunny/trailer.ogv`. **yt-dlp et ffmpeg sont réels** sur le VPS. Les métadonnées et le challenge sont simulés dans des entrypoints séparés, avec clé et registre de quotas de test. Aucun secret de production n'est utilisé pour signer ces tests.

Le navigateur reçoit le fichier nativement via Caddy HTTPS en loopback et un transfert SSH privé temporaire. Aucun fichier vidéo complet ne transite par une route Next.js ou une fonction Vercel. Le certificat est une fixture autosignée, pas un certificat public.

| Transfert | Octets fichier et statut | Temps mesuré | Intégrité/décodage |
|---|---:|---:|---|
| Vidéo, interface anglaise | **4 360 399**, `completed` | **4,128 s** | Ogg/Theora + Vorbis, 32,996875 s ; ffmpeg exit 0 |
| MP3, interface arabe RTL | **792 620**, `completed` | **4,297 s** | MP3, 33,024 s ; ffmpeg exit 0 |

SHA vidéo : `dcbe6f2ea404a52d4b2f6fc91f274874e69be1671a1097eb3dc19f28f7c6e40f`.
SHA MP3 : `38b23dc423846fff16d0d88950390ace9e9d3152d871ea8d0d0f9f676bd69ecf`.

Les deux tickets sont refusés au second usage (404). Huit contrôles de sécurité ont validé : rejet d'une IP Cloudflare usurpée depuis un pair non fiable, authentification obligatoire, endpoints service inaccessibles, rejet du rejeu de preuve, isolation entre propriétaires, refus d'une seconde opération active, propagation de déconnexion TLS et absence d'enfant moteur restant. La déconnexion après **4 090 octets** donne `aborted`, sans faux `completed`.

La limite d'un moteur simultané, la queue bornée et les limites applicatives existantes sont conservées. Les tests d'expiration, rétention et charge synthétique de Phase 3 restent les preuves de référence ; aucune nouvelle attente de trente minutes ou campagne massive de téléchargements n'a été lancée.

Fenêtre instrumentée de **45,209 s**, **180 échantillons**, contenant les deux transferts :

| Mesure | Résultat |
|---|---:|
| Maximum combiné échantillonné frontend + worker + gateway + Caddy de test | **206,95 MiB** |
| Pics individuels depuis le démarrage des unités | Frontend 96,54 ; worker 87,76 ; gateway 26,47 ; Caddy 17,11 MiB |
| CPU consommé pendant la fenêtre | Frontend 0,210 ; worker 3,157 ; gateway 0,474 ; Caddy 0,255 seconde |
| Pic CPU worker sur un court intervalle | 100,57 % d'un cœur ; échantillonnage distinct de la période du quota |
| RAM disponible après arrêt des bancs | **3 318 MiB** sur 3 826 MiB |
| Disque disponible final | **35 Go** affichés par `df -h`, aucun swap |

Les pics individuels ne sont pas simultanés et peuvent inclure une activité avant la fenêtre. Ces mesures d'un court trailer ne valident pas une capacité de production ni un volume quotidien d'utilisateurs.

## Caddy, Cloudflare Proxied et pare-feu

Le rapport OVH antérieur supposait DNS only. **Cette hypothèse est remplacée ici par la contrainte actuelle Proxied, sans modifier les DNS.** Deux fichiers distincts sont préparés sous `deploy/ovh/launch/` :

- **`Caddyfile.proxied`**, à utiliser pour une première recette frontend : pages vers 3000, autorisation vers Next.js, opérations média fermées en 503 `BACKEND_UNAVAILABLE`.
- **`Caddyfile.downloads-approved.example`**, préparation future uniquement : routes média vers la passerelle 8789, jamais le moteur brut 8788. Inutilisable publiquement avant résolution des obstacles ci-dessous.

Les conditions CDN Free/Pro/Business imposent des services adaptés pour diffuser des vidéos et d'autres gros fichiers ; une simple désactivation du cache n'apporte pas d'autorisation. Il faut confirmer une offre/permission couvrant cet usage, ou faire approuver une architecture média distincte hors proxy CDN. Le second choix implique une nouvelle décision réseau/DNS et une adaptation de l'origine d'autorisation : il n'est pas activé ici. [Conditions officielles Cloudflare, section CDN](https://www.cloudflare.com/service-specific-terms-application-services/).

La limite actuelle documentée de lecture du proxy Cloudflare est **125 secondes** par défaut ; porter le timeout Caddy à 240 secondes ne la supprime pas. Les préparations lentes sans réponse restent donc un risque à traiter avant d'approuver un chemin média Proxied. [Limites de connexion Cloudflare](https://developers.cloudflare.com/fundamentals/reference/connection-limits/).

Les configurations préparées comportent : redirection www 301 préservant chemin/query, en-têtes de sécurité, corps bornés, endpoints internes refusés, absence de journal d'accès contenant tickets/URL, filtrage des champs sensibles des logs d'erreur et timeouts. La variante média conserve l'annulation à la déconnexion, sans buffering intégral ni `flush_interval -1`.

**Correction réelle apportée pendant la recette** : le défaut d'en-tête staging sans guillemets était interprété comme un remplacement regex par Caddy. La valeur est désormais citée et le header reçu en HTTPS est testé. Les quatre fichiers de préparation initiaux sont conservés dans `proxy-noindex-original-20261013/`, et les premières copies distantes ne sont pas écrasées (copies corrigées suffixées `-v2`). Le générateur refuse maintenant d'écraser une configuration existante.

Les **15 plages IPv4 et 7 IPv6** ont été récupérées depuis les listes officielles, datées et hachées dans `cloudflare-ranges.json`. Caddy ne fait confiance à `CF-Connecting-IP` que pour ces pairs, et transmet `{client_ip}` à l'application ; la falsification depuis le banc non fiable a été refusée. [IPv4 Cloudflare](https://www.cloudflare.com/ips-v4/) et [IPv6 Cloudflare](https://www.cloudflare.com/ips-v6/).

Le fichier `web-ingress.nft` crée uniquement la table `inet vidfetch_web_ingress` : 80/443 TCP acceptés depuis Cloudflare, refus des autres origines, UDP 443 bloqué (HTTP/1.1 et HTTP/2), ports applicatifs refusés hors loopback. Il ne remplace aucune table existante et ne touche ni au port 22 ni à une politique globale. Le helper applique uniquement sa propre table de façon transactionnelle. Le drop-in `caddy-ingress.conf` lie Caddy à ce garde d'entrée.

**VALIDÉ** : adaptation Caddy des deux variantes, nft `--check`, HTTPS local du mode fermé avec arabe/noindex, cinq chemins média 503, endpoints privés 404 et www 301. **NON TESTÉ** : application effective de la nouvelle table, trafic depuis les plages Cloudflare et pare-feu OVH. Les règles sont préparées, **jamais appliquées**. Ne pas lancer `nft flush ruleset` ni recharger aveuglément `/etc/nftables.conf`.

## Certificats : prérequis encore manuels

Le binaire Caddy existant est **2.11.7**, sans module DNS Cloudflare. Aucun certificat public n'a été demandé.

La configuration prépare HTTP-01 sur le port 80 et désactive TLS-ALPN-01 : avec Proxied, le TLS est terminé à l'edge et le challenge ALPN n'atteint pas Caddy. Le chemin `/.well-known/acme-challenge/` doit parvenir à l'origine pour **vidfetch.app et www.vidfetch.app**, au premier certificat et à chaque renouvellement. WAF, cache et redirections à l'edge ne doivent pas le bloquer. Une redirection HTTPS imposée à l'edge combinée à Full (strict) sans certificat d'origine peut bloquer le bootstrap : vérifier ce cas avant tout démarrage. [Fonctionnement HTTPS automatique de Caddy](https://caddyserver.com/docs/automatic-https).

Les requêtes DNS publiques CAA de l'apex et de www ont renvoyé NOERROR sans réponse CAA explicite pendant cette mission. Cela n'est pas un essai d'émission. Vérifier manuellement les enregistrements d'origine effectifs, le certificat edge couvrant les deux noms et les éventuelles contraintes CAA héritées lors de l'activation. Le mode cible est **Full (strict)**, avec certificat valide pour le nom à l'origine ; ne pas utiliser Flexible. [Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/).

Si HTTP-01 est incompatible avec les règles actuelles, arrêter et demander une décision. Alternatives à préparer séparément : Origin CA installé manuellement (connexion via Cloudflare, pas de confiance navigateur directe, suivi d'expiration), ou DNS-01 avec module Caddy et jeton DNS minimal. Aucune de ces alternatives n'est installée et aucune écriture DNS n'est autorisée ici. [Origin CA](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/).

## Authentification : état réel et conditions pour ouvrir les médias

Le frontend garde `VIDFETCH_CONNECTION_READY=0`. Ses secrets Turnstile et sa clé de signature ne sont pas configurés. Le gateway actuel utilise `VIDFETCH_GATEWAY_ORIGIN=https://api.vidfetch.app`, alors que le frontend OVH signe pour `https://vidfetch.app`. L'origine de site déclarée côté gateway est bien `https://vidfetch.app`, et le backend privé est `http://127.0.0.1:8788`.

Le moteur répond sainement à `/api/health`. Une requête anonyme brute vers le gateway renvoie **403**, ce qui n'est pas une panne du service. Aucun test authentifié du parcours de production complet n'est revendiqué. La recette isolée prouve les factories de signature/admission/gateway et le streaming, avec son propre issuer et son propre registre.

Avant ouverture des médias, après accord : décider du chemin autorisé par le fournisseur, synchroniser l'origine et la clé serveur, provisionner un vrai widget Turnstile pour le domaine, vérifier le filtrage UID et conserver les limites. Noms requis côté frontend, sans valeurs : `VIDFETCH_TARGET`, `VIDFETCH_CONNECTION_READY`, `NEXT_PUBLIC_SITE_URL`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `VIDFETCH_ACCESS_SIGNING_KEY`. Garder les secrets dans les fichiers root 0600 ; aucun secret en `NEXT_PUBLIC_*`. Ne pas ajouter de fausse `DATABASE_URL` ; Supabase et les variables des fonctions réellement dépendantes de la base restent inchangés.

## GitHub Actions : audit en lecture seule et checklist

L'API GitHub a confirmé : **aucun secret repository**, **aucune variable repository**, **aucun secret dans l'environnement Production**, aucune règle de protection de cet environnement et aucune restriction de branche associée. Les environnements Preview et Production existent. `.github/workflows/deploy.yml` sur `main` renvoie **404**. Aucun workflow n'a été déclenché.

Le pipeline préparé sur la branche reste inchangé : lint, TypeScript, tests, release Linux, navigateur multilingue, déploiement sérialisé, SSH strict, promotion et rollback. Le job de déploiement exige `main`, le dépôt officiel, `VIDFETCH_DEPLOY_ENABLED=true`, le compte dédié et un garde root sur le VPS.

Checklist manuelle avant le premier déploiement CI :

1. Faire relire les commits et le workflow ; décider séparément du push et de l'intégration à main. Aucun code non approuvé de PR ne doit obtenir les secrets.
2. Protéger main et l'environnement référencé par le workflow (`production`), restreindre les branches et ajouter une approbation de déploiement selon les possibilités du dépôt.
3. Créer une clé Ed25519 **dédiée CI**, distincte de la clé personnelle. Mettre sa partie privée dans **`OVH_DEPLOY_SSH_KEY`** ; installer uniquement sa clé publique avec la commande forcée prévue pour `vidfetch-deploy`.
4. Vérifier l'empreinte hôte par un canal fiable/console OVH ; configurer **`OVH_DEPLOY_KNOWN_HOSTS`**. Aucun `StrictHostKeyChecking=no`, aucune confiance accordée à un `ssh-keyscan` non comparé.
5. `/var/lib/vidfetch-deploy/.ssh/authorized_keys` est encore vide. Le compte CI n'a pas d'accès général root ; conserver le dispatcher et le sudoers limités.
6. Garder **`VIDFETCH_DEPLOY_ENABLED=false`** jusqu'à validation complète. `/etc/vidfetch/full-migration-ready` est absent : ne pas le créer pendant la recette frontend seule.
7. La promotion CI attend trois services alignés sur `/opt/vidfetch-web/current` et le drain de la passerelle. Les services backend actuels ne sont pas encore basculés sur ces chemins. Cette migration requiert une validation séparée ; **ne pas installer les drop-ins backend/gateway pour simplement publier le frontend**.
8. Valider un transfert CI réel, un déploiement et un rollback sous supervision après autorisation. Les tests locaux de scripts et le rollback de préproduction ne prouvent pas une exécution réussie de GitHub Actions.

## Procédure d'activation proposée — NON EXÉCUTÉE

Obtenir un accord explicite pour une **recette publique du frontend seul, téléchargements fermés, noindex**, ou une nouvelle décision résolvant aussi les obstacles média. Ne pas confondre ces deux périmètres.

1. Refaire uniquement les précontrôles susceptibles de changer : SSH strict, santé/PID, disponibilité 80/443, situation des tables et fichiers, règles OVH/Cloudflare et prérequis de certificats. Confirmer que le certificat fixture n'est jamais utilisé publiquement.
2. Créer un dossier de sauvegarde root 0700 daté et unique. Y conserver les unités concernées, leurs états enabled/active, le lien `/opt/vidfetch-web/current`, `/etc/vidfetch` et un export nft. Sauvegarder tout fichier déjà présent avant remplacement ; arrêter en cas d'état inattendu. Les sauvegardes d'environnement restent privées.
3. Transférer uniquement les fichiers relus de cette branche dans un **nouveau** staging. Vérifier les hashes et l'intégrité de la release déjà installée. La release à activer est `689c592141287a1ca1e45569a89e5d76f18133ed`, pas le futur commit documentaire de Phase 4.
4. Installer `deploy/ovh/vidfetch-web.service` vers `/etc/systemd/system/vidfetch-web.service`. Garder `/etc/vidfetch/web.env` en mode dégradé. Arrêter uniquement `vidfetch-web-candidate.service`, puis remplacer atomiquement le lien `current` par un lien vers la release validée. La précédente cible sauvegardée doit rester disponible.
5. Après cette bascule autorisée, exécuter les commandes suivantes sur le VPS :

   ```sh
   sudo systemctl daemon-reload
   sudo systemctl enable --now vidfetch-web.service
   curl --fail --silent --show-error http://127.0.0.1:3000/api/health
   ```

   Vérifier `release=689c592141287a1ca1e45569a89e5d76f18133ed`, `downloads.available=false`, les huit accueils et les erreurs 503. En cas d'échec, restaurer immédiatement le pointeur et le candidat selon la procédure ci-dessous. Ne toucher à aucun service backend.

6. Créer le compte système non privilégié `vidfetch-proxy` s'il est absent. Installer les fichiers suivants, sans modifier SSH ni la table egress :

   | Source revue | Destination future |
   |---|---|
   | `deploy/ovh/launch/Caddyfile.proxied` | `/etc/vidfetch/Caddyfile` |
   | `deploy/ovh/vidfetch-caddy.service` | `/etc/systemd/system/vidfetch-caddy.service` |
   | `deploy/ovh/launch/web-ingress.nft` | `/etc/vidfetch/web-ingress.nft` |
   | `deploy/ovh/launch/web-ingress.py` | `/usr/local/libexec/vidfetch-web-ingress` |
   | `deploy/ovh/launch/vidfetch-web-ingress.service` | `/etc/systemd/system/vidfetch-web-ingress.service` |
   | `deploy/ovh/launch/caddy-ingress.conf` | `/etc/systemd/system/vidfetch-caddy.service.d/ingress.conf` |

   Propriété root, configurations/unités 0644, helper 0755 ; état certificat géré par `StateDirectory` du service, privé au compte proxy. Ne pas installer `Caddyfile.downloads-approved.example`, ni `backend-release.conf`, ni `gateway-release.conf` à cette étape.

7. Vérifier à nouveau les plages officielles avant application, adapter Caddy, vérifier les unités et nft sans appliquer. **Après accord réseau/public explicite et prérequis certificat satisfaits seulement** :

   ```sh
   sudo systemctl daemon-reload
   sudo systemctl enable --now vidfetch-web-ingress.service
   sudo systemctl enable --now vidfetch-caddy.service
   ```

   La dépendance systemd empêche de démarrer Caddy sans le garde. Ne pas activer le service générique nftables ni remplacer tout le ruleset. Contrôler les logs d'émission sans publier de clés.

8. Vérifier depuis l'extérieur : certificat pour les deux noms, chaîne HTTPS complète, www 301, huit langues/RTL, canonical/hreflang/sitemap/404, noindex de recette, API média 503 et endpoints privés 404. Vérifier l'absence d'accès Internet direct à 3000/3001/8788/8789 et le maintien d'une seconde session SSH. Les médias restent fermés.
9. Une fois la recette publique approuvée, retirer uniquement l'en-tête global de staging ; conserver les noindex des pages non publiées et des endpoints techniques. Ne pas remplacer cet en-tête global par `index, follow` qui pourrait écraser d'autres headers techniques. Publier les guides uniquement après relecture et publication réellement constatée selon le rapport international.
10. Arrêter la préproduction 3001 lorsqu'elle n'est plus utile, en conservant ses fichiers. Le démarrage permanent cible 3000 ; aucun reboot n'est nécessaire pour l'activation. Le comportement après reboot reste à observer ultérieurement sur une fenêtre approuvée.

Les commandes de cette section sont une procédure future, pas des opérations réalisées dans cette mission. Aucun changement Cloudflare, DNS ou réseau fournisseur n'est implicitement autorisé par cette préparation.

## Rollback

**VALIDÉ sur le nouveau service de préproduction** : arrêt/démarrage, restart, crash SIGKILL avec reprise en **6,047 s**, échec de release simulé avec restauration automatique de la multilingue, démarrage de l'ancienne anglaise et retour à la multilingue. Les quatre PID protégés et le pointeur de production sont restés identiques.

Pour annuler une future activation frontend/Caddy :

1. Arrêter et désactiver uniquement les nouveaux services publics `vidfetch-caddy.service` et `vidfetch-web.service`.
2. Restaurer atomiquement `/opt/vidfetch-web/current` vers la cible sauvegardée, actuellement `/opt/vidfetch-web/releases/cbbd4fd974ff092c02e08d226e3e864fc8900382`.
3. Restaurer les seuls fichiers modifiés depuis leur sauvegarde, faire `systemctl daemon-reload`, puis `systemctl start vidfetch-web-candidate.service`. Conserver son état de boot initial désactivé.
4. Vérifier `/api/health` sur 3000, moteur 8788, gateway et SSH. Ne pas redémarrer les backends ni effacer leurs registres de quotas.
5. Le garde ingress peut rester en place : il ne modifie pas SSH et aucun Caddy n'écoute. Ne jamais vider tout nftables pour revenir en arrière. Le retrait éventuel de sa seule table/unité doit être décidé explicitement.
6. Garder toutes les releases et sauvegardes. La restauration revient volontairement à l'état sans site public fonctionnel ; elle n'entraîne pas automatiquement un retour DNS vers Vercel.

Rollback public, certificat réel et exécution CI : **NON TESTÉS**. Ne pas annoncer une bascule sans coupure ; le remplacement ciblé du frontend peut occasionner un bref refus de connexion.

## Matrice finale des preuves

Les preuves privées sont dans `backend/artifacts/ovh-launch-20261013/`. Le résumé sans secrets versionné est `backend/validation/ovh-launch-20261013.json`.

| Contrôle | Statut | Preuve / limite |
|---|---|---|
| Git, référence internationale, 87 fichiers antérieurs | VALIDÉ | `git-preservation-resumed.json` |
| SSH strict et services protégés | VALIDÉ | `vps-before.json`, `vps-final.json`, PID/configuration identiques |
| Cause exacte de l'ancien SSH exit 1 | NON TESTÉ / non déterminée | Aucun diagnostic suffisant conservé ; non reproduit |
| ESLint, TypeScript | VALIDÉ | Contrôles Phase 4, logs conservés ; lint revérifié après ajout des scripts |
| 131 unités/SEO, 17 backend, 2 gateway, 4 queue, 5 déploiement | VALIDÉ antérieurement | Phase 3, mêmes sources ; volontairement non répétés |
| Build Linux, manifestes, syntaxe bundles | VALIDÉ | `linux-release-build-preserved.log`, `release-checksum.json`, `vps-installation.json` |
| Pages, huit langues, RTL, sitemap, drafts | VALIDÉ | `vps-site-validation/verification.json`, 38 pages, huit parcours |
| Vidéo/MP3 et intégrité | VALIDÉ sur fixtures | `vps-download-validation/verification.json`, `vps-media-integrity-confirmed.txt` |
| Auth/tickets/concurrence/déconnexion/nettoyage | VALIDÉ sur fixtures | `vps-fixture-security.json`, huit contrôles |
| Connexion frontend/gateway installés, avec vrai challenge | BLOQUÉ | Secrets absents, audience/origine différente ; mode fermé conservé |
| Caddy noindex, fermeture médias et www | VALIDÉ après correction | `vps-frontend-only-v2.json` ; anciennes copies conservées |
| nft préparation et non-régression | VALIDÉ | Dry-run exit 0 ; ruleset final identique à l'initial |
| CPU/RAM pendant transferts | VALIDÉ, périmètre limité | `vps-resources-streaming.json`, 45,209 s |
| Restart/crash/rollback préproduction | VALIDÉ | `vps-lifecycle.json`, reprise 6,047 s |
| Premier contrôle du statut navigateur | ÉCHEC de l'observateur, corrigé | Premier dossier d'échec conservé ; aucun succès déduit de ce premier essai |
| En-tête Caddy initial sans guillemets | ÉCHEC corrigé | Backup avant correction ; vraie réponse HTTPS désormais testée |
| Extraction YouTube sur OVH | ÉCHEC antérieur conservé | Anti-bot ; pas de nouveau test ni contournement |
| Certificats publics/renouvellement, WAF/cache/SSL Cloudflare | NON TESTÉ | Contrôles manuels nécessaires |
| Pare-feu réseau OVH, application ingress | NON TESTÉ | Aucun accès fournisseur ni activation réseau |
| Médias publics via Cloudflare Proxied | BLOQUÉ | Conditions fournisseur et architecture à résoudre |
| GitHub Actions réel / déploiement automatique | BLOQUÉ | Secrets, protections et alignement des unités non configurés |
| Activation publique, indexation et reboot | NON TESTÉ | Accord requis ; aucune activation effectuée |

Tous les artefacts, fichiers échoués et sauvegardes utiles sont conservés. Les opérations encore nécessaires sont clairement séparées entre publication du frontend en mode dégradé, ouverture authentifiée des médias et activation du CI/CD.
