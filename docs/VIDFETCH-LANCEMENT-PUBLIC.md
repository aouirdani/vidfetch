# Lancement public et indexation de `vidfetch.app` (téléchargements fermés)

Cette procédure rend les pages publiques et indexables, avec `ready=0`. Elle ne change rien au réseau, à SSH, au moteur, à la passerelle ni aux secrets. Les téléchargements restent fermés :

- routes médias de l'apex en 503 ;
- aucun jeton de téléchargement émis ;
- `dl.vidfetch.app` réservé à l'IP testeur.

Elle remplace l'étape 6 de `VIDFETCH-RECETTE-PRIVEE.md` (fenêtre Caddy « media-test ») : la fenêtre publique obtient aussi le certificat de `dl`. Rien ici ne demande la connexion domestique.

## Ce qui change, et seulement cela

**Caddy** : `deploy/ovh/media/Caddyfile.public`, dérivé du candidat validé `Caddyfile.test-only`. Il change trois choses :

- plus de Basic Auth ni de `noindex` global ;
- `robots.txt` et `sitemap.xml` sont servis par le frontend ;
- `noindex` est conservé sur `/api/*`, `/auth/*` et `/download-helper`.

Il garde à l'identique :

- l'origine limitée à Cloudflare et au loopback ;
- les routes médias en 503 ;
- `/auth/admission`, `/auth/deployment` et `/internal/*` en 404 ;
- le bloc `dl`, à l'octet près. Les tests et `05-caddy.sh` le vérifient.

**Frontend** : correction de la boucle de redirection 308 sur `/fr`, `/de`… et `/legal/`.

**Promoteur CI** : profil `public`. Il exige l'apex indexable sans identifiants, des téléchargements annoncés fermés, et toutes les routes médias, API et auth fermées et en `noindex`. Sans ce profil, aucun déploiement CI ni `rollback.py` ne passerait une fois l'apex public. Les profils `closed` et `media-test` restent inchangés.

**Cohérence Caddy et profil CI** : `05-confirm.sh` n'installe le profil public qu'après tous les contrôles, et avant d'enregistrer la confirmation et de désarmer la minuterie. Chaque retour arrière remet Caddy et le profil ensemble :

- la minuterie, `05-cancel.sh`, `04-cancel.sh` et `restore-full.sh` retirent le profil public, et uniquement lui ;
- un profil `media-test` n'est jamais touché.

## Pages indexables

Il y en a 16, toutes dans le sitemap, en `index, follow`, avec un canonical sur elles-mêmes et 9 hreflang chacune :

- les 8 pages d'accueil : `/`, `/fr/`, `/es/`, `/pt/`, `/id/`, `/de/`, `/it/` et `/ar/` ;
- les 8 pages légales : `/legal`, `/fr/mentions-legales`, `/es/aviso-legal`, `/pt/termos-e-privacidade`, `/id/ketentuan-dan-privasi`, `/de/rechtliches`, `/it/note-legali` et `/ar/الشروط-والخصوصية`.

Les 22 autres pages sont volontairement en `noindex, follow` et hors du sitemap :

- 10 guides et 8 index de guides : aucun guide n'a encore de date `published` ;
- 4 pages plateformes « being verified ».

## 1. Correctif frontend (avant la bascule)

Ce déploiement doit précéder la bascule : à ce moment l'apex est encore protégé, donc le promoteur accepte le déploiement.

```sh
gh run list --workflow deploy.yml --branch main --limit 1          # BUILD_ID du merge, success
gh workflow run deploy.yml --ref main -f operation=verify -f artifact_run_id=<BUILD_ID> && gh run watch    # VERIFY_ID
gh variable set VIDFETCH_DEPLOY_ENABLED --body true
gh workflow run deploy.yml --ref main -f operation=deploy -f artifact_run_id=<VERIFY_ID> && gh run watch
gh variable set VIDFETCH_DEPLOY_ENABLED --body false
```

- **Contrôle** :
  - le run affiche `"validated": true, "activated": true` ;
  - `curl -sI https://vidfetch.app/` répond toujours 401 ;
  - sur le VPS, `curl -s -o /dev/null -D - -H 'Host: vidfetch.app' http://127.0.0.1:3001/fr | grep -iE '^(HTTP|location)'` renvoie `308` et `location: /fr/` (avant le correctif : `location: /fr`, une boucle).
- **Retour arrière** : `sudo /usr/local/libexec/vidfetch-ci/rollback.py`.

## 2. Envoi et pré-vol

```sh
cd ~/Desktop/vidfetch && git fetch origin
bash <(git show origin/main:deploy/ovh/media/admin/send-to-vps.sh) origin/main backend/artifacts/admin-prep-20261014/render-open80
ssh debian@15.235.127.165
cd ~/media-test-stage/admin && sudo --preserve-env=SSH_CONNECTION bash 00-preflight.sh | tee ~/preflight-public.txt
```

- **Contrôle de l'envoi** : `VERIFIED on the VPS`, avec `Caddyfile.public` et `promote.py` livrés à côté de `admin/`.
- **Contrôle du pré-vol** :
  - `CI profile: closed` ;
  - les deux minuteries `inactive` ;
  - `next step is 05-caddy.sh (no new backup)` ;
  - `latest backup …: usable` ;
  - `VIDFETCH_CONNECTION_READY=0`.

## 3. Promoteur CI

```sh
sudo bash 09-ci-helper.sh check
sudo bash 09-ci-helper.sh install
```

- **Contrôle** : `CI helper replaced`, puis le statut affiché par le nouveau helper indique `"profile": "closed"`. Le profil en vigueur ne change pas.
- **Retour arrière** : `sudo bash 09-ci-helper.sh rollback`. Le script refuse tant que le profil public est en place ; lancer `05-cancel.sh` d'abord.

## 4. Bascule publique, avec minuterie de 900 s

```sh
date -u +%T; sudo bash 05-caddy.sh --port80-verified-from-outside --public 900
sudo journalctl -u vidfetch-caddy --since '-3min' --no-pager | grep -iE 'obtain|certificate|acme|error' | tail -15
```

La minuterie est armée avant tout changement. `05-caddy.sh` refuse dans les cas suivants :

- la fenêtre réseau n'est pas confirmée ;
- le profil CI n'est pas `closed` ;
- le helper installé ignore le profil public ;
- `Caddyfile.public` a perdu le verrou Cloudflare, les routes médias fermées ou la restriction testeur ;
- son bloc `dl` diffère du candidat ;
- l'apex actuel n'est pas protégé.

Depuis n'importe quel réseau non testeur, y compris l'IP actuelle :

```sh
cd ~/Desktop/vidfetch && bash <(git show origin/main:deploy/ovh/media/admin/verify-outsider.sh) --public
```

Quand tout est vert, sur le VPS :

```sh
sudo bash 05-confirm.sh --external-checks-passed
```

- **Contrôle** : `05-confirm.sh` affiche, puis désarme la minuterie :
  - `sitemap: 16 URL(s) checked: 200, no credentials, no noindex, self-canonical` ;
  - la ligne sur `robots.txt` ;
  - `redirects: /fr -> /fr/ once (no loop)` ;
  - `downloads: closed` ;
  - `dl: trusted certificate…` ;
  - `CI profile: public`.

  `verify-outsider.sh --public` doit afficher `ALL … CHECKS PASSED`.
- **En cas d'erreur ACME ou de contrôle en échec** : `sudo bash 05-cancel.sh` tout de suite.
- **Retour arrière** : `sudo bash 05-cancel.sh`, avant ou après confirmation. Basic Auth et `noindex` reviennent aussitôt, le profil CI repasse à `closed`, le réseau reste inchangé et le certificat de `dl` est conservé.
- **Garde CI** (recommandé une fois confirmé) :

  ```sh
  sudo python3 guard-update.py add /etc/vidfetch/public-https-test/Caddyfile.public /etc/systemd/system/vidfetch-caddy.service.d/media-test.conf /etc/vidfetch/public-https-test/media-test-ips.env /etc/vidfetch/public-https-test/ingress.nft
  ```

  Après un `05-cancel.sh`, ce garde diffère. La CI refuse alors de déployer jusqu'à réconciliation, ce qui est le comportement voulu.

### Vérifier le certificat de `dl` sans tester les médias

- **Depuis le VPS** : `05-confirm.sh` vérifie déjà le certificat en TLS strict par le loopback. Pour le revérifier : `curl -sv -o /dev/null --resolve dl.vidfetch.app:443:127.0.0.1 https://dl.vidfetch.app/ 2>&1 | grep -E 'issuer:|expire date:|SSL certificate verify'`.
- **Depuis n'importe où**, dans les journaux de transparence des certificats :

  ```sh
  curl -s 'https://crt.sh/?q=dl.vidfetch.app&output=json' | python3 -c 'import json,sys; [print(c["not_before"], c["issuer_name"]) for c in json.load(sys.stdin)[:5]]'
  ```

- **Depuis l'IP domestique**, sans télécharger : `bash <(git show origin/main:deploy/ovh/media/admin/verify-tester.sh) <TESTER_IP> public`.

## 5. Search Console

- **Sitemaps** : soumettre `https://vidfetch.app/sitemap.xml`.
- **Inspection d'URL** : « Tester l'URL en ligne », puis « Demander une indexation ». Les 8 accueils d'abord, les 8 pages légales le lendemain (le quota quotidien est limité). Le test en ligne doit indiquer « L'URL est disponible pour Google », « Indexation autorisée : Oui » et un rendu complet. Si Cloudflare bloquait Googlebot, c'est ce test qui le révélerait.

```
https://vidfetch.app/
https://vidfetch.app/fr/
https://vidfetch.app/es/
https://vidfetch.app/pt/
https://vidfetch.app/id/
https://vidfetch.app/de/
https://vidfetch.app/it/
https://vidfetch.app/ar/
https://vidfetch.app/legal
https://vidfetch.app/fr/mentions-legales
https://vidfetch.app/es/aviso-legal
https://vidfetch.app/pt/termos-e-privacidade
https://vidfetch.app/id/ketentuan-dan-privasi
https://vidfetch.app/de/rechtliches
https://vidfetch.app/it/note-legali
https://vidfetch.app/ar/%D8%A7%D9%84%D8%B4%D8%B1%D9%88%D8%B7-%D9%88%D8%A7%D9%84%D8%AE%D8%B5%D9%88%D8%B5%D9%8A%D8%A9
```

Ne soumettez ni les pages en `noindex`, ni `/api/`, ni `dl.vidfetch.app`.

## 6. Plus tard, depuis l'IP domestique

1. `verify-tester.sh <TESTER_IP> public`.
2. Les étapes 7 et 8 de `VIDFETCH-RECETTE-PRIVEE.md` : secrets Turnstile, garde CI, puis `set-ready.sh 1` le temps de la recette MP4/MP3.
3. `set-ready.sh 0`.

Tant que `ready=1`, le promoteur public refuse les déploiements CI ; `set-ready.sh` le rappelle. L'ouverture des téléchargements à tous fait l'objet d'un plan séparé.

## Retour arrière

| Situation | Commande | Effet |
|---|---|---|
| Revenir à l'apex protégé | `sudo bash 05-cancel.sh` | Caddy d'origine et profil CI `closed` ; réseau et certificat conservés |
| Ne rien faire pendant la fenêtre | — | la minuterie fait la même chose au bout de 900 s |
| Revenir aussi sur le réseau | `sudo bash 04-cancel.sh` | ingress d'origine, Caddy d'origine, profil `closed` |
| Tout remettre | `restore-full.sh` (voir `VIDFETCH-RECETTE-PRIVEE.md`) | état de la sauvegarde ; `Caddyfile.public` retiré par son nom |
| Ancien promoteur | `sudo bash 09-ci-helper.sh rollback`, après `05-cancel.sh` | helper précédent, statut vérifié |
| Frontend précédent | `sudo /usr/local/libexec/vidfetch-ci/rollback.py` | fonctionne avec l'apex protégé comme public, grâce au profil |

## Tests

| Test | Ce qu'il prouve |
|---|---|
| `scripts/i18n/verify-site.mjs` (CI) | 38 pages, 16 entrées de sitemap, hreflang réciproques, canonicals |
| `tests/proxy-redirects.test.ts` (CI) | redirections en une seule étape ; 11 des 16 cas échouent sur l'ancien code |
| `caddy-gating/` (CI, Caddy 2.11.7 réel) | apex public sans en-tête `noindex`, `robots.txt` et sitemap transmis au frontend, routes médias fermées, `dl` inchangé |
| `test_media_profile.py` (CI) | profil public : fichier exact, téléchargements fermés exigés, toute page non indexable ou route ouverte refusée |
| `public-launch.test.sh` (CI) | préconditions, refus de confirmation, cohérence Caddy/CI à chaque retour arrière (y compris en cas d'échec entre deux étapes), `09-ci-helper.sh`, aucun appel réseau ni redémarrage |
| `caddy-window-systemd.test.sh` (sur demande, systemd, Caddy et promoteur réels) | voir ci-dessous |
| `public-indexing.test.sh` (sur demande, Next réel derrière Caddy réel) | 16 URL indexables, 22 en `noindex`, téléchargements fermés |

Le test `caddy-window-systemd.test.sh` vérifie notamment :

- le promoteur réel refuse l'apex public tant que le profil CI est `closed`, et l'accepte une fois le profil public installé ;
- `05-cancel.sh` et la minuterie remettent ensemble Caddy et le profil ;
- les PID de SSH, Caddy, du frontend et de la passerelle restent inchangés.

Non testés : le VPS lui-même, Let's Encrypt réel (les tests utilisent l'autorité interne de Caddy), Cloudflare et Googlebot. Le test en ligne de Search Console couvre ces deux derniers points.
