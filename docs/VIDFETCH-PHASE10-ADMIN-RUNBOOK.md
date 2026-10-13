# Phase 10 — procédure d'administration de la recette HTTPS privée `dl.vidfetch.app`

**Rien de ce document n'a été exécuté sur le VPS.** Les scripts sont dans `deploy/ovh/media/admin/` et ont été testés hors VPS (voir §9). `<TESTER_IP>` = l'IPv4 /32 autorisée, vérifiée le 13 oct. 2026 : identique côté Mac (trois services externes) et côté VPS (`SSH_CONNECTION`). Les fichiers rendus pour cette IP sont dans `backend/artifacts/admin-prep-20261014/render-open80/` (hors Git, avec `SHA256SUMS`).

Principes : chaque étape a une **vérification**, un **retour arrière**, et les étapes marquées 🔒 exigent ton accord explicite. Garder **deux sessions SSH** ouvertes pendant les étapes 4 et 5.

## 0. État vérifié avant cette procédure

| Point | Résultat |
|---|---|
| `main` | `6430aa89` (PR #3 fusionnée) ; workflow #13 : build OK, déploiement ignoré |
| `VIDFETCH_DEPLOY_ENABLED` | **`false`** (variable du dépôt ; aucune variable d'environnement GitHub) |
| IP testeur | `<TESTER_IP>` : même IPv4 vue par 3 services externes et par le VPS ; le Mac a aussi une IPv6 mais `dl` n'a pas d'AAAA donc le trafic `dl` sera en IPv4 |
| `dl` DNS | A → `15.235.127.165`, pas d'AAAA ; 80/443 fermés (état actuel confirmé) ; 3001/8788/8789 fermés |
| Audit détaillé du VPS | **à faire par toi** (`00-preflight.sh`) : mon accès SSH de lecture a été refusé par le classificateur pour un audit multi-commandes sudo |

Limite de l'IP : une IP résidentielle est souvent **dynamique** ; si elle change, `dl` te refuse (fail closed, pas de risque de sécurité) et il faut re-générer les fichiers. Désactiver VPN / iCloud Private Relay pour la recette, sinon l'IP vue sera différente.

## 1. Envoi des fichiers (depuis le Mac)

```sh
cd ~/Desktop/vidfetch/backend/artifacts/admin-prep-20261014
( cd render-open80 && sha256sum --check SHA256SUMS )                 # attendu : 3 × OK
ssh debian@15.235.127.165 'mkdir -m 700 -p ~/media-test-stage'
scp -r checkout/deploy/ovh/media/admin checkout/deploy/ovh/media/install-web-secrets.sh render-open80 debian@15.235.127.165:media-test-stage/
shasum -a 256 render-open80/* | sort > /tmp/local.sums; ssh debian@15.235.127.165 'cd ~/media-test-stage/render-open80 && sha256sum *' | shasum -a 256 -c -  >/dev/null 2>&1 || true
```
Vérification : sur le VPS, `cd ~/media-test-stage/render-open80 && sha256sum --check SHA256SUMS` doit afficher 3 × OK. Retour arrière : `rm -rf ~/media-test-stage`.

## 2. Pré-vol en lecture seule (sur le VPS)

```sh
ssh debian@15.235.127.165
cd ~/media-test-stage/admin && sudo --preserve-env=SSH_CONNECTION bash 00-preflight.sh | tee ~/preflight-$(date -u +%H%M).txt
```
**Go / No-go** (tout doit être vrai, sinon STOP et m'envoyer la sortie) :
- `SSH client` = `<TESTER_IP>` ; services `ssh, vidfetch, vidfetch-gateway, vidfetch-web-candidate, vidfetch-caddy, vidfetch-https-test-ingress, vidfetch-web-preproduction-20261013` tous `active`.
- `health ... downloads={'available': False}`, release = `f23ca65b…` ou la release active attendue.
- `VIDFETCH_CONNECTION_READY=0`, aucun fichier `EXISTS` dans « prerequisites », profil CI absent, `guard entries: N, differing: 0`.
- `firewall helper present`, `current` → `Caddyfile`, Caddy 2.11.7, table `vidfetch_https_test_ingress` présente (sans `testers4`), sshd : `passwordauthentication no` attendu.
- Noter le **nom du fichier d'environnement de la passerelle** (utile à l'étape 6).

## 3. Sauvegarde datée (aucune modification du système)

```sh
sudo bash 01-backup.sh        # crée /var/backups/vidfetch-media-test-<horodatage>/ (0700) + lien « latest »
sudo bash -c 'cd /var/backups/vidfetch-media-test-latest && sha256sum --check --quiet MANIFEST.sha256 && echo MANIFEST OK && ls'
```
Contenu : `ruleset.nft` (tout le jeu de règles), `ingress-table.nft`, **toute l'arborescence `/etc/vidfetch`** copiée avec propriétaires, modes et liens d'origine (environnements, garde CI, drapeaux, `public-https-test/`), unité Caddy et ses drop-ins, état des unités/PID, état Caddy (comptes ACME et certificats, 0600), `restore-network.sh` et `restore-full.sh`. La sauvegarde est vérifiée (`diff -r`, manifeste SHA256) ; une étape en échec supprime la sauvegarde partielle et laisse le lien « latest » intact. Elle **refuse** de s'exécuter si le système porte déjà des changements media-test (sinon elle enregistrerait l'état modifié comme « original »).

**Secrets** : le dossier est `0700 root` ; les fichiers copiés gardent leur mode d'origine pour que la restauration soit exacte, et sont protégés par ce dossier (testé : un utilisateur non privilégié ne peut lire aucun fichier). Rien de secret n'est affiché ni écrit dans le manifeste (empreintes uniquement). Ne jamais copier ce dossier hors du VPS sans chiffrement.

**Restauration complète** (si nécessaire, étape manuelle) : `sudo bash /var/backups/vidfetch-media-test-latest/restore-full.sh /var/backups/vidfetch-media-test-latest --yes` remet le réseau, puis toute l'arborescence `/etc/vidfetch`, l'unité Caddy et ses drop-ins à l'identique, retire les fichiers media-test et le profil CI s'il n'existait pas. Il vérifie d'abord l'intégrité de la sauvegarde, **ne redémarre rien** et indique quoi redémarrer. Les certificats Caddy ne sont volontairement pas écrasés. Retour arrière de l'étape 3 : aucun nécessaire (ajout seul).

## 4. Mise en place des fichiers (staging), sans activation

```sh
sudo bash 02-stage.sh ~/media-test-stage/render-open80
```
Crée uniquement `ingress.nft.media-test`, `media-test-ips.env`, `Caddyfile.media-test` ; fait `nft --check`, `caddy validate` (compte `vidfetch-proxy`), vérifie que Basic Auth et noindex sont présents ; refuse la liste factice, tout ce qui n'est pas /32, une somme SHA incorrecte. Rien ne les référence : aucune règle ni service modifié. Retour arrière : `sudo rm /etc/vidfetch/public-https-test/{ingress.nft.media-test,media-test-ips.env,Caddyfile.media-test}`.

## 5. 🔒 Réseau + HTTPS (accord n°1) — avec minuterie de restauration automatique

Deux terminaux SSH ouverts (A, B). Dans **A** :

```sh
sudo bash 03-network.sh open80 900
```
Le script **arme d'abord** une minuterie systemd transitoire (`vidfetch-media-rollback.timer`, indépendante de SSH : survit à une coupure) qui, au bout de 900 s, restaure l'ingress d'origine **et** le pointeur Caddy ; puis applique l'ingress de façon atomique via l'outil existant (`nft --check`, remplacement unique de la seule table `vidfetch_https_test_ingress`). Si l'application échoue, la restauration est immédiate. Les sessions SSH déjà ouvertes ne sont pas coupées (`ct state established`) : c'est pourquoi on teste une **nouvelle** connexion.

Vérifications immédiates (≤ 2 min) :
1. Depuis **B** : nouvelle connexion `ssh debian@15.235.127.165` → doit réussir.
2. Mac, IP testeur : `bash ~/media-test-stage/admin/verify-tester.sh <TESTER_IP> pre-cert` → port 80 = 308, A/AAAA corrects, 3001/8788/8789 fermés.
3. **Autre réseau** (téléphone en 4G, Wi-Fi coupé) : `bash verify-outsider.sh` → 443 fermé, apex direct refusé, SSH ok.
4. Apex inchangé : `curl -sI https://vidfetch.app/` → `401` + `x-robots-tag: noindex`.

Si un contrôle échoue : `sudo bash 04-cancel.sh` (restaure tout de suite) ou attendre l'expiration.

Puis, **toujours avant de confirmer**, dans A (le port 80 est joignable : condition indispensable pour l'ACME) :
```sh
sudo bash 05-caddy.sh --port80-verified-from-outside     # pointeur → Caddyfile.media-test, drop-in EnvironmentFile, reload (pas de restart)
sudo journalctl -u vidfetch-caddy --since '-3min' --no-pager | grep -iE 'obtain|certificate|acme|error' | tail -15
```
Attendu : `certificate obtained successfully` pour `dl.vidfetch.app` en moins de 2 minutes. En cas d'erreur de validation : **ne pas relancer en boucle** (limite Let's Encrypt : 5 échecs/h par nom) ; `04-cancel.sh`, diagnostic, puis réessayer.

Vérification complète depuis le Mac, IP testeur :
```sh
bash ~/media-test-stage/admin/verify-tester.sh <TESTER_IP>        # copier le script sur le Mac au préalable : il ne s'exécute pas sur le VPS
```
Attendu : chaîne TLS vérifiée strictement, `dl` : routes non listées 404, POST anonyme refusé, en-têtes `no-referrer` / `noindex` / `no-store`, apex 401 + routes médias 503, accès **direct** à l'apex (hors Cloudflare) 403. Sur le VPS : `curl -s --resolve vidfetch.app:443:127.0.0.1 -o /dev/null -w '%{http_code}\n' https://vidfetch.app/` → `401` (les contrôles locaux de la CI passent par le loopback, autorisé exprès).

Quand **tout** est vert : `sudo bash 04-confirm.sh`. Il ne désarme la minuterie que sur **preuve** d'une nouvelle connexion SSH valide, lue dans le journal de sshd :

- authentification **par clé publique** (un mot de passe peut être fini de taper sur une connexion ouverte avant le changement) ;
- journalisée **au moins 3 s après** l'instant, enregistré à la microseconde, où les nouvelles règles sont devenues actives : aucune connexion antérieure ne compte ;
- provenant **exactement** d'une IPv4 de `media-test-ips.env` (la liste testeurs utilisée par nftables et Caddy) : une connexion depuis une autre IP, une IPv6 ou une adresse ressemblante est ignorée.

Il n'a volontairement aucune option `--force` : sans preuve, laisser la minuterie restaurer, corriger, recommencer. Il refuse aussi dès que la restauration automatique a commencé. Après cela le nouvel état est permanent, y compris au redémarrage (le fichier `ingress.nft` a été remplacé).

**Retour arrière de l'étape** : `sudo bash 04-cancel.sh` (ou le script de restauration de la sauvegarde) ; la minuterie assure la même chose automatiquement tant qu'elle n'est pas confirmée.

**Ce que fait la restauration automatique** (`restore-network.sh`, lancée par systemd, sans session SSH) : remet `ingress.nft` et la table nft d'origine, le pointeur Caddy, retire le drop-in `media-test.conf`, recharge Caddy s'il tourne, puis **vérifie** le résultat. Chaque étape est indépendante : si l'outil pare-feu échoue, la table sauvegardée est appliquée directement par `nft` (vérification puis transaction atomique), et le pointeur Caddy est restauré quand même. Si une étape reste en échec, le script sort en erreur et systemd le relance toutes les 20 s.

**Une seule opération à la fois** : `01`, `03`, `04-confirm` et `05` prennent un verrou commun (`/run/vidfetch-media-test.lock`) et refusent si une autre opération ou la restauration est en cours. La restauration, elle, attend la fin d'une opération en cours (45 s au plus) puis restaure de toute façon : un verrou bloqué ne peut pas l'empêcher. Après le début d'une restauration ou après `04-confirm.sh`, `05-caddy.sh` refuse : il faut une nouvelle sauvegarde et un nouveau `03-network.sh`.

## 6. 🔒 Turnstile, clé de service, passerelle (accord n°2)

Pré-requis : widget Turnstile « Managed » pour `vidfetch.app` (déjà créé). **Ne pas coller les clés ailleurs que dans l'invite masquée.**

```sh
# Environnement de la passerelle : nom relevé à l'étape 2 (ex. /etc/vidfetch/gateway.env)
sudo bash ~/media-test-stage/install-web-secrets.sh /etc/vidfetch/web.env /etc/vidfetch/<GATEWAY_ENV>
#   -> demande Site Key (visible) puis Secret Key (masquée) ; sauvegarde web.env.bak.<horodatage> ; READY reste 0 ; rien n'est redémarré
sudo bash set-gateway-origin.sh /etc/vidfetch/<GATEWAY_ENV>     # VIDFETCH_GATEWAY_ORIGIN=https://dl.vidfetch.app ; pas de redémarrage
```
🔒 **Redémarrage de la passerelle** (service protégé ; accord n°3) : seulement s'il n'y a aucun transfert actif ; la SQLite des quotas n'est pas touchée :
```sh
sudo systemctl restart vidfetch-gateway.service && sleep 3 && systemctl is-active vidfetch-gateway.service
sudo curl -s http://127.0.0.1:8789/api/health | head -c 200      # audience/santé attendues
```
Retour arrière : restaurer `web.env.bak.*` et `<GATEWAY_ENV>.bak.*`, puis redémarrer la passerelle si elle l'a été.

## 7. Garde CI et profil `media-test` (compatibilité CI vérifiée par tests, pas encore sur le VPS)

Les étapes 5 et 6 changent des fichiers surveillés par le garde : `vidfetch-promote ready` refusera (c'est voulu) tant que le garde n'est pas réétabli **par toi**, fichier par fichier :
```sh
sudo python3 ~/media-test-stage/admin/guard-update.py list                       # noms des fichiers modifiés
sudo python3 ~/media-test-stage/admin/guard-update.py accept /etc/vidfetch/web.env /etc/vidfetch/<GATEWAY_ENV>   # seulement ceux attendus
sudo python3 ~/media-test-stage/admin/guard-update.py add /etc/vidfetch/public-https-test/Caddyfile.media-test /etc/vidfetch/public-https-test/media-test-ips.env /etc/vidfetch/public-https-test/ingress.nft /etc/systemd/system/vidfetch-caddy.service.d/media-test.conf
sudo bash ~/media-test-stage/admin/06-profile.sh install                         # profil exact attendu par le promoteur
sudo /usr/local/libexec/vidfetch-ci/promote.py status                            # attendu : "profile": "media-test", pendingRecovery false
```
`guard-update.py` ne supprime jamais d'entrée, n'accepte rien d'implicite, refuse les symlinks et les fichiers modifiables par groupe/autres, et garde `.bak.<heure>`. **Point faible connu** : le garde ne surveille pas le pointeur `current` (c'est un lien) ; on garde donc la cible `Caddyfile.media-test` surveillée.

Le déploiement CI reste **désactivé** (`VIDFETCH_DEPLOY_ENABLED=false`) pendant toute la recette ; ne pas le réactiver tant que la recette n'est pas terminée.

## 8. 🚫 NON AUTORISÉ POUR L'INSTANT — activation (accord n°4, séparé)

`sudo bash set-ready.sh 1` (refuse si profil CI ou secrets manquent ; redémarre **uniquement** le frontend) puis la recette navigateur : Basic Auth → Turnstile → MP4/MP3 avec un média autorisé (pas YouTube) depuis `<TESTER_IP>` ; contrôler tickets, annulation, quotas ; depuis le téléphone (autre IP) le téléchargement doit échouer côté `dl`. Retour arrière immédiat : `sudo bash set-ready.sh 0` puis `04-cancel.sh`.

## 9. Tests exécutés avant cette procédure (hors VPS)

| Test | Résultat |
|---|---|
| Règles nft **dans un vrai noyau** (conteneurs : testeur, autre source, serveur) | testeur : 443 ouvert, 80 fermé (ouvert à tous seulement avec `open80`, et alors 443 reste fermé aux autres) ; SSH ouvert pour tous ; 3001/8788/8789 fermés pour tous, testeur compris ; restauration = table identique à l'originale |
| Rendu pour `<TESTER_IP>/32` | `nft --check` OK (open80 et closed80), chargé dans un noyau de conteneur |
| Caddy 2.11.7 réel | non-testeur 403 partout ; testeur : 5 routes seulement ; apex : non-Cloudflare 403, **loopback accepté** (voir ci-dessous) ; en-têtes `dl` |
| `caddy reload` | la variable `VIDFETCH_MEDIA_TEST_IPS` est résolue par le processus CLI du reload : l'`EnvironmentFile` suffit, pas de redémarrage de Caddy |
| **Vrai systemd et vrai journald** (conteneur privilégié, test optionnel `VIDFETCH_SLOW_TESTS=1`, ~4 min) | (1) `04-confirm.sh` sur le vrai journal : connexion dans la marge, autre IP, mot de passe, échec → refusés ; clé publique depuis l'IP testeur après la marge → accepté. (2) le script d'armement est tué (`kill -9`) pendant que l'outil pare-feu est bloqué, le pointeur Caddy et le drop-in sont à moitié posés, la 1re tentative de restauration échoue (pannes injectées) : systemd restaure seul, réessaie, et tout revient à l'état d'origine |
| Sécurisation (80 vérifications, + 5 mutations volontaires toutes détectées) : confirmation (IP testeur exacte, clé publique, marge de 3 s, IPv6/adresses ressemblantes/mot de passe refusés), restauration depuis un état à moitié appliqué et avec étapes en échec, verrou (chaque script n'est arrêté **que** par le verrou), aller-retour sauvegarde → tout modifier → restauration identique octet/propriétaire/mode, aucun secret affiché | voir `deploy/ovh/tests/admin-hardening.test.sh` |
| Scripts d'administration (48 vérifications, conteneur root, outils système simulés ; preflight avec valeurs « canari » : aucune fuite, aucun fichier modifié, seulement `systemctl is-active/show` et `nft list`) | refus sans sauvegarde/staging, minuterie armée **avant** l'application, échec d'application → restauration immédiate, restauration sans toucher env/garde, `ready=1` refusé sans profil/secrets, etc. |
| `guard-update.py` | 4 tests : accepte seulement le modifié nommé, ajoute sans jamais retirer, refuse symlink/fichier modifiable |
| Profil CI | 45+ tests Python (Phase 9) |

### Défaut corrigé pendant cette préparation
Le correctif Caddy de la PR #3 (refus de l'apex hors Cloudflare) refusait **aussi le loopback**. Or le promoteur CI et les scripts d'audit testent l'origine depuis `127.0.0.1:443` et attendent 401 : chaque déploiement CI aurait échoué puis déclenché un rollback. Le Caddyfile candidat autorise maintenant `127.0.0.1` et `::1` (Basic Auth reste exigée), avec un test dédié.

## 10. Limites à connaître

1. **IP dynamique / partagée** : voir §0. L'IP seule n'est pas une authentification : nftables et `remote_ip` filtrent la source, puis grant, preuve P-256, ticket, cookie et quotas protègent les médias.
2. **Port 80 mondial** pendant et après l'émission (nécessaire aux renouvellements) : redirections 308 uniquement (mesuré).
3. nftables autorise aussi le testeur à atteindre l'apex en 443 directement ; Caddy le refuse (403, `@outsideCloudflare`) : testé.
4. Non testés : Turnstile réel, émission/renouvellement Let's Encrypt, vraies clés, parcours navigateur, `restore-network.sh` avec le vrai `systemd-run`/`firewall helper` sur le VPS.
5. Les sauvegardes `*.bak.*` et l'archive d'état Caddy contiennent des secrets/clés privées : root 0600/0700, à purger après la recette.
6. Rollback complet du dispositif : `docs/VIDFETCH-MEDIA-TEST-ROLLBACK.md` (ses étapes 1 et 3 peuvent maintenant s'exécuter avec `04-cancel.sh`).
