# Ouverture publique des téléchargements (`dl.vidfetch.app`)

Point de départ : l'état actuel du VPS.

- L'apex est public et indexable.
- `dl.vidfetch.app` est réservé à l'IP testeur.
- `ready=0` et le profil CI vaut `public`.

L'ouverture se fait en trois temps, chacun réversible :

1. `dl` devient public, téléchargements toujours fermés.
2. Les secrets Turnstile sont installés.
3. `ready=1`, puis tests réels.

Rien ne touche au moteur, à la passerelle, au frontend, ni à SSH. Les 16 URL indexables, `robots.txt` et `sitemap.xml` restent identiques. Le fichier `Caddyfile.public-dl` reprend `Caddyfile.public` à l'octet près pour les options globales, l'apex et `www` ; les tests et `10-dl-public.sh` le vérifient.

## Ce qui change

**Pare-feu.** `public-dl-ingress.py` transforme l'`ingress.nft` en service. Une seule règle disparaît : `tcp dport 443 ip saddr @testers4 accept`. Elle est remplacée par des limites par adresse IPv4, puis une ouverture du 443 en IPv4 :

- 32 connexions ouvertes au plus par adresse ;
- 120 nouvelles connexions par minute, après une rafale de 60.

Tout le reste est inchangé :

- Cloudflare, qui sert l'apex, est accepté avant ces règles et n'est jamais limité ;
- SSH (22), le loopback, le port 80 (ACME), le refus des ports internes 3000, 3001, 8788 et 8789, et l'ensemble `testers4` ;
- l'IPv6 sur le 443 reste réservé à Cloudflare : `dl` n'a pas d'enregistrement AAAA.

**Caddy.** Le bloc `dl` perd seulement son filtre testeur. Restent identiques :

- les routes de la passerelle, seules exposées (tout le reste répond 404) ;
- la limite de corps à 8 Ko ;
- les en-têtes `no-referrer`, `noindex` et `no-store` ;
- `X-Forwarded-For` égal à l'adresse réelle du client, ce que les quotas exigent.

**Profil CI `public-downloads`.** Mêmes contrôles de l'apex que le profil `public`, avec trois différences :

- `ready=1` est accepté ;
- une demande de jeton sans l'origine du site doit répondre 403 ;
- contrôles ajoutés sur `dl` : routes de la passerelle à 401 sans jeton, `/` et `/api/health` à 404.

**`11-downloads.sh open|close`.** Le seul interrupteur. Il change `ready` et le profil CI ensemble, contrôle l'origine réelle et referme de lui-même si un contrôle échoue.

Protections inchangées, déjà présentes dans la passerelle :

- Turnstile, puis jeton de 2 min lié au navigateur, et preuve ;
- 120 requêtes/min par IP, 10 jetons/min par identité, 20 opérations par 10 min ;
- par jour : 8 téléchargements et 1 Go par IP comme par utilisateur, 100 téléchargements et 4 Go au total ;
- 1 transfert actif, 2 en file ;
- 256 Mo, 2 Mo/s et 10 min au plus par transfert ;
- sortie réseau du moteur filtrée.

## Prérequis

- PR fusionnée, `validate` réussi, `VIDFETCH_DEPLOY_ENABLED=false`.
- Scripts envoyés depuis `main` :
  ```sh
  bash <(git show origin/main:deploy/ovh/media/admin/send-to-vps.sh) origin/main backend/artifacts/admin-prep-20261014/render-open80
  ```
  Ils arrivent avec `Caddyfile.public-dl`, `public-dl-ingress.py` et le nouveau `promote.py`.
- Promoteur à jour : `sudo bash 09-ci-helper.sh check`, puis `install`. Son `status` doit afficher `"profile": "public"`. Retour arrière : `sudo bash 09-ci-helper.sh rollback` remet le promoteur précédent (`00732df2…`, qui connaît le profil `public`). Il refuse sous `public-downloads`, que ce promoteur ne connaît pas : fermer d'abord les téléchargements.
- Un réseau **non testeur** pour la vérification externe, par exemple un téléphone en 4G en partage de connexion. L'IP domestique est celle du testeur (ensemble `testers4`) et ne convient pas pour `verify-outsider.sh`.

## 1. `dl.vidfetch.app` public, téléchargements fermés (fenêtre de 900 s)

```sh
sudo bash 10-dl-public.sh 900
```

**Le script refuse** dans chacun de ces cas :

- `ready` différent de 0 ;
- profil CI différent de `public` ;
- fenêtre apex public non confirmée ;
- une minuterie armée ;
- promoteur sans `public-downloads` ;
- `Caddyfile.public-dl` différent de l'apex en service ;
- règles réseau qui ne sont plus celles qui ont été confirmées ;
- apex public non conforme avant le changement.

**Déroulement :**

1. Il prend un instantané : ingress testeur (fichier et table active) et `Caddyfile.public`.
2. Il arme `vidfetch-dl-rollback`.
3. Il applique le pare-feu ; pendant ce temps, Caddy filtre encore, donc un non-testeur reçoit 403.
4. Il bascule Caddy.

Tout échec restaure immédiatement. Le retour arrière ramène l'apex public avec un `dl` réservé au testeur, **jamais l'ancien état Basic Auth**.

**Vérification et confirmation :**

1. Ouvrir une **nouvelle** connexion SSH par clé.
2. Depuis un réseau non testeur :
   ```sh
   cd ~/Desktop/vidfetch && bash <(git show origin/main:deploy/ovh/media/admin/verify-outsider.sh) --public-dl
   ```
3. Puis sur le VPS :
   ```sh
   sudo bash 10-dl-confirm.sh --external-checks-passed
   ```

**`10-dl-confirm.sh` vérifie :**

- une connexion SSH par clé écrite par le démon SSH après le changement ;
- la table active : limites présentes, SSH présent, ports internes refusés ;
- l'apex tel que Google le voit (chaque URL du sitemap) ;
- les téléchargements fermés ;
- `dl` public avec certificat de confiance, routes de la passerelle à 401.

**Retour arrière :**

- avant ou après confirmation : `sudo bash 10-dl-cancel.sh` ;
- avant confirmation : la minuterie le fait d'elle-même.

## 2. Secrets Turnstile

Créer d'abord, dans Cloudflare, un widget Turnstile pour le nom d'hôte `vidfetch.app`. Le frontend envoie l'action `vidfetch`.

```sh
sudo bash ~/media-test-stage/install-web-secrets.sh /etc/vidfetch/web.env /etc/vidfetch/gateway.env
sudo python3 guard-update.py accept /etc/vidfetch/web.env
```

`ready` reste à 0 : rien ne change pour les visiteurs.

**Retour arrière :** remettre `web.env.bak.<date>`.

## 3. Ouverture et tests réels

```sh
sudo bash 11-downloads.sh open
```

**`11-downloads.sh open` refuse** dans chacun de ces cas :

- `dl` public non confirmé ;
- secrets absents ;
- `VIDFETCH_MEDIA_ORIGIN` différent de `https://dl.vidfetch.app` ;
- promoteur sans `public-downloads`.

**Déroulement :**

1. Il installe le profil `public-downloads`.
2. Il passe `ready=1`, ce qui ne redémarre que le frontend.
3. Il contrôle :
   - le frontend annonce les téléchargements ;
   - `/api/download-access` propose le widget Turnstile et `dl` ;
   - l'apex reste indexable ;
   - `dl` exige un jeton.

Si un contrôle échoue, il referme immédiatement (`ready=0`, profil `public`).

**Tests, depuis n'importe quel réseau :**

- une URL TikTok : vérification Turnstile, MP4, puis MP3 ; ouvrir les deux fichiers ;
- annuler un téléchargement en cours ;
- rejouer un lien déjà utilisé : doit échouer ;
- un lien YouTube : message de refus, pas de fichier.

**Ensuite :** `sudo python3 guard-update.py accept /etc/vidfetch/web.env`.

**Retour arrière, en quelques secondes :** `sudo bash 11-downloads.sh close`. Il remet `ready=0` d'abord (plus aucun nouveau jeton), puis le profil `public`.

## Retours arrière

| Situation | Commande | Résultat |
|---|---|---|
| Problème après ouverture | `11-downloads.sh close` | `ready=0`, profil `public`, `dl` public mais inutilisable sans jeton |
| Refermer `dl` | `11-downloads.sh close`, puis `10-dl-cancel.sh` | `dl` réservé au testeur, apex public (refusé tant que les téléchargements sont ouverts) |
| Pendant la fenêtre `dl` | — | la minuterie restaure au bout de 900 s |
| Urgence totale | `04-cancel.sh` | réseau et Caddy d'origine (Basic Auth), `ready=0`, aucun profil public |
| Tout remettre | `restore-full.sh` | état de la sauvegarde ; `Caddyfile.public-dl` et `ingress.nft.public-dl` retirés par leur nom |

`05-cancel.sh` refuse tant que `dl` est public. Il faut d'abord fermer les téléchargements, puis `dl`.

## Tests

| Test | Ce qu'il prouve |
|---|---|
| `test_public_dl_ingress.py` (CI) | changements exacts de l'ingress ; refus d'un ingress déjà public, sans règle testeur ou avec port 80 fermé ; jamais d'écrasement |
| `nft-behaviour/` (CI, vrai noyau) | 443 ouvert à toute IPv4, ports internes fermés, SSH et 80 intacts ; la 33e connexion d'une adresse est refusée, les autres adresses non ; rafale coupée ; retour à la table testeur identique à l'octet ; la sortie réelle de `nft list` contient exactement ce que les scripts vérifient |
| `caddy-gating/` (CI, Caddy 2.11.7 réel) | apex et `www` identiques à `Caddyfile.public` ; `dl` : un non-testeur atteint les routes de la passerelle et rien d'autre, en-têtes conservés, corps de plus de 8 Ko refusé |
| `test_media_profile.py` (CI) | profil `public-downloads` : fichier exact, booléen accepté, toute dérive de l'apex ou de `dl` refusée ; profils existants inchangés |
| `public-downloads.test.sh` (CI) | préconditions, ordre (minuterie d'abord), échecs pendant l'ouverture, preuve SSH, retour arrière (ordre, échecs partiels, repli nft, cible Basic Auth refusée), `11-downloads` ouverture, fermeture et échecs, cohérence de `04-cancel`, `05-cancel`, `06-profile` et `restore-full` |
| `caddy-window-systemd.test.sh` §7 (sur demande, systemd, journald, OpenSSH, Caddy et promoteur réels) | ouverture, confirmation après une vraie connexion par clé, `11-downloads` ouverture et fermeture acceptées par le vrai promoteur, annulation, minuterie ; processus de SSH, Caddy et passerelle inchangés |

## Risques résiduels

- **Exposition directe.** `dl` n'est pas derrière Cloudflare : l'IP du VPS est exposée aux scans et aux inondations. Les limites par adresse et les quotas protègent les ressources, pas le lien réseau. Une attaque répartie sur de nombreuses adresses reste possible ; Cloudflare n'intervient pas.
- **Plafond global** de 100 téléchargements par jour : au-delà, tout le monde reçoit « quota atteint ».
- **Adresses partagées** (NAT, opérateurs mobiles) : plusieurs utilisateurs partagent la limite de 32 connexions et le quota de 8 téléchargements par jour.
- **YouTube** : message trompeur (« contenu restreint ») tant que l'option 2 n'est pas faite.
- **Non testés** : Let's Encrypt réel (les tests utilisent l'autorité interne de Caddy), Turnstile réel et le parcours complet dans un navigateur. Ce sont précisément les tests de l'étape 3.
