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
