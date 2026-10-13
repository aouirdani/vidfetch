# VidFetch — Phase 9 : rapport de préparation de l'activation

Date : 13 octobre 2026. Branche locale `work/vidfetch-activation-prep-20261013`, dérivée de `fc071ac2` (Phase 8), elle-même dérivée de `origin/main` = `f23ca65b` (release active). Checkout : `backend/artifacts/activation-prep-20261013/checkout`.

**Aucun push, fusion, déploiement, changement DNS/Cloudflare/VPS n'a été réalisé. Basic Auth, noindex et médias publics 503 inchangés.**

## 1. Audit Git

- `main` local est en retard (`d572cf89`) ; **`origin/main` = `f23ca65b`**. La Phase 8 en descend directement (2 commits : `5ac07e02`, `fc071ac2`). Aucune divergence à résoudre.
- 9 worktrees isolés conservés (cicd, consolidation, full-migration, international-seo, media-preparation, ovh-launch, public-https, …). Aucun modifié.
- Le répertoire racine (`work/vidfetch-secure-connection-20261012`, `cf8cc173`) contient des modifications non commitées et des fichiers non suivis issus de l'ancien travail « secure connection » (gateway, ovh, scaling, …). **Non touché** ; c'est une ancienne lignée, pas la source de la Phase 9.
- Base de contrôle sur ce checkout : ESLint OK, `tsc` OK, **133/133 tests** (le chiffre « 183 » du brief additionne les suites backend/passerelle/file/déploiement du rapport Phase 8, pas `npm test` seul).

## 2. Audit `dl.vidfetch.app` (lecture seule)

| Contrôle | Résultat |
|---|---|
| DNS A | `15.235.127.165`, présent, pas de proxy |
| AAAA | aucun (conforme au plan) |
| TCP 80/443 depuis Internet | **refusé** : ingress limité aux plages Cloudflare → **aucun certificat possible** pour l'instant (HTTP-01 impossible) |
| Certificat `dl` | **inexistant** (aucun handshake TLS) |
| Ports 3001 / 8788 / 8789 | fermés depuis l'extérieur (conforme) |
| `https://vidfetch.app/` | 401 (Basic Auth actif) |
| `POST /api/download-access` | 503 (médias fermés) |

## 3. Variables nécessaires

Frontend (`/etc/vidfetch/web.env`, root 0600, runtime uniquement) :

| Variable | Valeur | Remarque |
|---|---|---|
| `VIDFETCH_MEDIA_ORIGIN` | `https://dl.vidfetch.app` | public |
| `TURNSTILE_SITE_KEY` | Site Key | public, mais fournie à l'exécution |
| `TURNSTILE_SECRET_KEY` | Secret Key | **secret**, jamais `NEXT_PUBLIC_*`, jamais CI |
| `VIDFETCH_ACCESS_SIGNING_KEY` | identique à celle de la passerelle | copiée sans affichage par le script |
| `VIDFETCH_CONNECTION_READY` | `0` → `1` en dernier | n'est pas modifiée par le script |

Passerelle : `VIDFETCH_GATEWAY_ORIGIN=https://dl.vidfetch.app` (audience), `VIDFETCH_SITE_ORIGINS=https://vidfetch.app`. Conserver clé HMAC, SQLite de quotas, file 2/180 s, concurrence 1.

Le code exige `success`, hostname exact (`vidfetch.app`) et action `vidfetch`. Le widget Turnstile doit donc être déclaré pour `vidfetch.app`.

## 4. Installation sécurisée des secrets (préparée, non exécutée)

`deploy/ovh/media/install-web-secrets.sh` : root uniquement, sauvegarde horodatée 0600, lecture masquée (`read -s`) de la Secret Key, copie de la clé HMAC passerelle → web sans l'afficher, remplacement des quatre seules variables, ne touche pas `VIDFETCH_CONNECTION_READY`, ne redémarre rien, n'affiche que des noms. Validé : syntaxe `bash -n`. **Non exécuté ni testé en conditions réelles** (nécessite root GNU/Linux). Les clés Turnstile ne doivent jamais être collées dans un chat ni dans Git ; si elles l'ont été quelque part, les régénérer dans Cloudflare.

## 5. Intégration frontend ↔ passerelle

Déjà en place depuis la Phase 8 et relue : `GET /api/download-access` fournit siteKey + origine `dl` depuis la configuration runtime ; le widget charge `challenges.cloudflare.com` en rendu explicite, action `vidfetch` ; Next.js échange le token contre un grant HMAC court lié à la clé P-256 du navigateur ; les octets passent directement par `dl`. Aucune modification de code nécessaire à ce stade : **je n'ai volontairement pas inventé de changement**. Pas de CSP définie dans `next.config.ts` ni Caddy qui bloquerait `challenges.cloudflare.com`.

## 6. Test navigateur protégé : état

**Non réalisable aujourd'hui** (bloqué) : pas de certificat `dl`, ingress 443 fermé, secrets absents du VPS, `ready=0`. Ce qui a été fait : MP4/MP3 réels via HTTPS privé (Phase 8), Turnstile simulé. Ce qui reste : parcours réel Turnstile → métadonnées → MP4/MP3 depuis un navigateur d'un testeur dont l'IP est autorisée.

## 7. Points de vigilance découverts

1. **Garde CI** : le promoteur exige `downloads.available=false` ; passer à ready=1 ou modifier Caddy fait échouer/rollback le déploiement. Il faut une révision administrative du garde *avant* l'activation (jamais le supprimer).
2. **Ingress** : `dl` en DNS only exige d'ouvrir 443 (testeurs) et 80 (HTTP-01) ; l'apex doit rester refusé hors Cloudflare (déjà prévu dans `Caddyfile.test-only`). `VIDFETCH_MEDIA_TEST_IPS` doit contenir les IP réelles des testeurs, sinon tout est refusé (valeur de secours `192.0.2.1/32`).
3. **Conditions Cloudflare** : ne pas passer `dl` en proxy (médias volumineux).
4. **YouTube** : échec anti-bot connu ; aucun contournement ajouté ; ne pas annoncer la compatibilité.

## 8. Actions nécessitant votre intervention (dans l'ordre)

1. Relire/valider cette branche et la PR ; me dire si je dois pousser et ouvrir la PR (non fait).
2. Autoriser la révision du garde CI (profil « recette médias ») — code + tests à écrire par moi, application par vous.
3. Fournir les IP publiques des testeurs.
4. Sur le VPS, en admin : sauvegarde (env, Caddy, nft), ouverture 80/443 conformément au plan, puis `install-web-secrets.sh`.
5. Autoriser ensuite : installation du Caddy candidat, émission du certificat HTTP-01, `ready=1`, redémarrage du frontend seul, recette navigateur.
6. Rollback : voir Phase 8 §12 (fermer Caddy, ready=0, restaurer sauvegardes ; ne pas supprimer certificats ni anciennes releases).

---

# Phase 9b — profil CI, réseau, certificat, script de secrets

Branche inchangée (`work/vidfetch-activation-prep-20261013`), commits identifiables : `53e129ab` (profil CI + script), `3ce94e06` (Caddy + ingress + tests), puis ce document.

## A. Défaut critique trouvé et corrigé dans le Caddy candidat de la Phase 8

`deploy/ovh/media/Caddyfile.test-only` contenait `respond @notTester 403` au premier niveau du site `dl`. Caddy ordonne `handle` **avant** `respond` : le refus ne s'exécutait donc jamais. **Reproduit sur Caddy 2.11.7** (la version du VPS) : avec la liste `192.0.2.1/32`, un non-testeur recevait **200 de la passerelle** sur `/api/fetch-info` et `/api/download`. La Phase 8 n'avait validé que `caddy adapt` (syntaxe), pas le comportement. Le même défaut existait pour le refus hors Cloudflare de l'apex dans ce candidat.

Correctif : refus dans un `handle` exclusif placé en premier, pour `dl` et pour l'apex. Test comportemental (`deploy/ovh/tests/test_caddy_gating.py`, 23 assertions avec un vrai Caddy dans Docker) : non-testeurs 403 partout ; testeur : uniquement les 5 routes autorisées atteignent la passerelle, `/api/health`, `/auth/admission`, `/auth/deployment`, `/internal/*` donnent 404 ; apex refuse un pair non-Cloudflare. Le même test exécuté sur la version Phase 8 échoue 13 fois. La configuration Caddy **active** du VPS (`public-test/Caddyfile`) ne contient pas ce motif et n'a pas été touchée.

## B. Profil CI « recette médias »

`deploy/ovh/ci/promote.py` : le profil est **désactivé par défaut**. Il n'existe que si root crée `/etc/vidfetch/ci-media-test-profile.json` avec exactement `{"profile":"media-test","apex":"basic-auth-noindex","dl":"testers-only"}` (fichier root, non inscriptible par groupe/autres ; tout autre contenu refuse le déploiement).

| | profil fermé (défaut) | profil `media-test` |
|---|---|---|
| Garde (empreintes fichiers, services protégés, PID, artefacts moteur/passerelle) | inchangé | **inchangé** |
| `downloads.available` | doit être `false` | doit être un booléen (état opérationnel) |
| Apex | 401 Basic + noindex, `/api/download`, `/api/fetch-info` 503, sitemap 404 | tout cela **plus** `POST/GET /api/download-access` = 401, `/api/queue`, `/auth/transfer`, `/download-helper` = 503 |
| Compte SSH CI | frontend seulement | inchangé |

Le garde n'est ni supprimé ni contourné : changer Caddy, l'environnement ou la passerelle continue d'exiger une revue administrative et une mise à jour des empreintes. Tests : `deploy/ovh/tests/test_media_profile.py` (profil absent/inexact/permissions, booléen strict, checks additionnels, garde non référencé par le profil).

## C. nftables (préparé, non appliqué)

`deploy/ovh/media/render-ingress.py --testers FICHIER [--open-port-80]` génère la table `vidfetch_https_test_ingress` (même nom, même structure que l'actuelle, donc compatible avec `public-test/firewall.py apply` : remplacement atomique, `nft --check`, rien d'autre touché) et `VIDFETCH_MEDIA_TEST_IPS=…` pour Caddy, depuis la **même liste** (une seule source de vérité).

Règles ajoutées : `tcp dport 443 ip saddr @testers4 accept`. Conservés : SSH 22, loopback, established, ICMP, DHCP, Cloudflare 80/443, reject de 3000/3001/8788/8789, drop UDP 443, `drop` final. Liste vide = ensemble vide = `dl` injoignable (fail closed, et Caddy retombe sur `192.0.2.1/32`).

Validation du rendu : refus des préfixes plus larges que /28 (16 adresses), des IPv6 (pas d'AAAA), des adresses privées/réservées/multicast/loopback/CGNAT, de tout chevauchement avec les plages Cloudflare (sinon n'importe quel client Cloudflare serait admis), plus de 32 entrées ; syntaxe vérifiée avec le vrai `nft --check` (Debian) pour liste pleine et vide. `tests/test_ingress.py` : 9 tests.

**Limite** : nftables ne voit pas le nom d'hôte TLS. Un testeur autorisé peut donc aussi atteindre l'apex en 443, qui reste derrière Basic Auth. Le comportement des paquets vis-à-vis de vraies IP sources n'a pas été testé (pas de VPS/netns multiples ici) : seuls la syntaxe et le texte des règles le sont.

## D. Certificat

Voir `docs/VIDFETCH-DL-CERTIFICATE-OPTIONS.md`. **HTTP-01 recommandé** : aucun secret ni binaire en plus ; port 80 mondial qui ne répond que des 308 (mesuré). DNS-01 exigerait un binaire Caddy recompilé et un jeton capable de modifier tout le DNS de la zone.

## E. `install-web-secrets.sh` : revue et tests

Défauts trouvés dans ma première version et corrigés : valeurs écrites avec `echo` (remplacé par `printf '%s'`) ; `|| true` qui masquait une erreur de lecture de `grep` ; aucune vérification de propriétaire/symlink/permissions ; pas de verrou ; `chmod` forcé sans contrôle de l'existant ; clé HMAC non validée (le code attend exactement 43 caractères base64url) ; première occurrence prise au lieu de la dernière (systemd retient la dernière) ; clés factices de test Cloudflare (`1x0000…`) acceptables.

Ajoutés : refus sous `bash -x`, root + propriétaire root + pas de symlink + modes ≤ 0640 sur les deux fichiers, `flock`, validation des formats, refus des clés factices Cloudflare, sauvegarde 0600 avant toute écriture, construction à côté puis `mv` atomique, vérification que seules les 4 variables ont changé et qu'elles sont uniques, aucune valeur affichée.

Tests (`install-web-secrets.test.sh`, root sous Debian dans Docker, **fausses clés uniquement**) : succès, aucun secret dans la sortie, mode 600, remplacement sans doublon, autres lignes et `READY=0` préservés, sauvegarde correcte, pas de fichier temporaire, ré-exécution idempotente, refus (format, clés factices, HMAC absent, fichier lisible par tous, symlink, mauvais propriétaire, xtrace) sans modification ni sauvegarde. Les sauvegardes `.bak.*` contiennent des secrets : root 0600, à purger après recette.

## F. Limites de cette recette (à lire avant d'inviter quiconque)

1. **Un sous-domaine « réservé aux testeurs » n'est pas un contrôle d'accès par lui-même.** `dl` est en DNS only : son IP est publique, son certificat apparaîtra dans les journaux CT, et n'importe qui peut l'atteindre tant qu'une règle ne le refuse pas. La protection repose sur trois barrières cumulées qui doivent toutes être en place : nftables (443 testeurs), `remote_ip` Caddy, puis les contrôles applicatifs (grant HMAC lié à la clé du navigateur, preuve P-256, ticket unique, cookie hôte, quotas). Si une seule est mal appliquée, vérifier immédiatement que `dl` répond 403/refus depuis une IP non autorisée.
2. Le défaut Caddy de la section A prouve que « syntaxe valide » ne suffit pas : **exécuter le test de refus depuis une vraie IP non testeuse** après installation (curl depuis un réseau extérieur : timeout/reset attendu, jamais 200).
3. Une IP de testeur est partagée dès qu'il y a NAT/CGNAT ou réseau d'entreprise : tout le monde derrière elle passe le filtre réseau. Préférer des IP fixes individuelles ; les contrôles applicatifs restent la dernière barrière.
4. Les IP testeurs sont à jour dans **deux** conséquences (nft et Caddy) : toujours régénérer les deux depuis le même fichier avec `render-ingress.py`.
5. Port 80 mondial (si HTTP-01) : redirections seulement, mesuré avec Caddy 2.11.7 ; à re-vérifier après installation.
6. Non testés : Turnstile réel, règles nft sur de vraies IP sources, émission/renouvellement Let's Encrypt, `install-web-secrets.sh` avec de vraies clés, parcours navigateur public. Aucun déploiement ni changement sur le VPS n'a eu lieu.

## G. Opérations administratives (dans l'ordre, rien n'est fait)

1. Fournir la liste des IP testeurs (IPv4 fixes) ; générer nft + env Caddy avec `render-ingress.py` ; relire le diff.
2. Sauvegarder sous un répertoire root horodaté : `web.env`, `worker.env`/passerelle, Caddyfile, `public-https-test/ingress.nft`, garde CI, export `nft list ruleset`, stockage Caddy. Garder une seconde session SSH.
3. Appliquer l'ingress avec `public-test/firewall.py apply` (atomique, `--check`) ; tester SSH ; décider `--open-port-80`.
4. Installer le Caddy candidat corrigé (`caddy validate` + `adapt`, puis reload) ; surveiller l'émission HTTP-01 ; vérifier chaîne TLS stricte.
5. Exécuter `install-web-secrets.sh` (saisie masquée) ; ne pas changer `ready`.
6. Créer `/etc/vidfetch/ci-media-test-profile.json` (root 0644 ou 0600) **et** régénérer les empreintes du garde après revue ; sans cela le déploiement CI refuse, comme prévu.
7. Depuis une IP non testeuse : `dl` doit refuser. Depuis une IP testeuse : parcours réel Turnstile → MP4/MP3.
8. Alors seulement : `ready=1`, redémarrage du seul frontend.
9. Rollback : voir `docs/VIDFETCH-MEDIA-TEST-ROLLBACK.md` (restaurer l'ancienne table d'ingress — **pas** `firewall.py rollback`, qui supprime toute la table —, puis env/Caddy/garde ; rien d'autre n'est supprimé).

---

# Revue finale avant fusion

Voir le résultat de la revue dans la PR #3. Correctifs apportés pendant la revue : en-tête `Referrer-Policy` de `dl` (la valeur `no-referrer` voulue était écrasée par `strict-origin-when-cross-origin`, vérifié), profil CI figé une seule fois par exécution, préfixe maximal des IP testeurs ramené à /28, image Caddy des tests épinglée par tag et empreinte, procédure de rollback complète rédigée (l'ancienne mention de `firewall.py rollback` était incorrecte).
