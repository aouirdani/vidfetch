# Recette privée MP4/MP3 sur `dl.vidfetch.app` : procédure d'exécution

Procédure de référence. Elle remplace l'ordre des étapes de `VIDFETCH-PHASE10-ADMIN-RUNBOOK.md`, qui reste le détail de chaque script. **Rien n'a été exécuté sur le VPS.** `<TESTER_IP>` est l'IPv4 autorisée ; les fichiers rendus pour elle sont dans `backend/artifacts/admin-prep-20261014/render-open80/` (hors Git).

Règles valables pour toutes les étapes :

- Une étape à la fois ; chaque étape a son contrôle et son retour arrière. Arrêter au premier contrôle en échec.
- Basic Auth, noindex et routes médias de l'apex restent en place du début à la fin. `VIDFETCH_DEPLOY_ENABLED` vaut `false`, sauf pendant la commande `deploy` de l'étape 1.
- Ne pas fusionner la PR du classement des erreurs avant la fin : elle change les bundles protégés et ferait refuser le déploiement de l'étape 1.
- YouTube est exclu de la recette : il est bloqué depuis OVH (`VIDFETCH-YOUTUBE-AUDIT.md`). Prévoir une ou deux URL de médias autorisés sur une autre plateforme ; leur extraction depuis OVH n'a pas été testée.

## Préalable : les scripts doivent être sur `main`

La PR des scripts d'administration doit avoir réussi la validation CI, puis être fusionnée. Relever l'identifiant du build lancé par la fusion :

```sh
gh run list --workflow deploy.yml --branch main --limit 1     # conclusion = success ; noter BUILD_ID
```

## 1. Frontend de `main`, avec `ready=0`

Pourquoi d'abord : la release active (`f23ca65b`) ne lit pas l'origine `dl` à l'exécution. Et tant que `ready=0`, le frontend ne parle ni au moteur ni à la passerelle (vérifié par `tests/ovh-ready-dependencies.test.ts`) : il peut donc être déployé devant la passerelle actuelle, avant toute autre modification, pendant que le garde CI correspond encore au VPS.

```sh
gh workflow run deploy.yml --ref main -f operation=verify -f artifact_run_id=<BUILD_ID>   # transfert sans activation
gh run watch                                                                              # noter VERIFY_ID
gh variable set VIDFETCH_DEPLOY_ENABLED --body true
gh workflow run deploy.yml --ref main -f operation=deploy -f artifact_run_id=<VERIFY_ID>  # même archive, pas de reconstruction
gh run watch
gh variable set VIDFETCH_DEPLOY_ENABLED --body false
```

Ne rien fusionner sur `main` tant que la variable vaut `true`. Si `deploy` est refusé avec « gate is closed », ouvrir le garde frontend par la procédure d'administration habituelle, puis relancer.

- **Contrôle** : le run se termine par `"validated": true, "activated": true` ; `curl -sI https://vidfetch.app/` répond 401 avec `x-robots-tag: noindex`.
- **Retour arrière** : `sudo /usr/local/libexec/vidfetch-ci/rollback.py` (administrateur ; revient à la release précédente et la vérifie).

## 2. Scripts d'administration et pré-vol

Les scripts de la passerelle font partie de cet envoi : c'est pourquoi cette étape précède la mise à niveau.

```sh
cd ~/Desktop/vidfetch && git fetch origin
bash <(git show origin/main:deploy/ovh/media/admin/send-to-vps.sh) origin/main backend/artifacts/admin-prep-20261014/render-open80
ssh debian@15.235.127.165
cd ~/media-test-stage/admin && sudo --preserve-env=SSH_CONNECTION bash 00-preflight.sh | tee ~/preflight.txt
```

- **Contrôle de l'envoi** : `VERIFIED on the VPS: … toolkit revision 2`. L'ancienne copie est conservée sous `*.old-<date>`.
- **Contrôle du pré-vol**, tout doit être vrai :
  - `toolkit revision 2` ;
  - `runtime media origin supported by this release: yes` et `downloads announced as available: False` ;
  - `public-key logins logged by the SSH daemon` ≥ 1, sans ligne `NO-GO` ;
  - les sept services `active` ; `VIDFETCH_CONNECTION_READY=0` ; `guard entries: N, differing: 0` ;
  - `engine: running bundle = release manifest` ; `gateway: DIFFERENT` est attendu à ce stade.
- **Retour arrière** : aucun, ces commandes ne modifient que `~/media-test-stage`.

## 3. Passerelle synchronisée avec `main`

Un seul arrêt/démarrage de la passerelle : il installe le bundle de `main` et fait le changement d'audience vers `dl` prévu pour la recette. Le moteur n'est pas redémarré.

Empreinte attendue, à obtenir **indépendamment** du VPS, depuis une copie de `origin/main` avec ses dépendances :

```sh
node backend/gateway/build.mjs /tmp/gw-main.cjs && shasum -a 256 /tmp/gw-main.cjs
# attendu aujourd'hui : 0fa1404530c272b76aaec9aee18125660e8561c744e4ccc1fbb9c7dbee9850e5
```

Sur le VPS :

```sh
sudo bash 08-gateway.sh check   <EMPREINTE>                 # lecture seule
sudo bash 08-gateway.sh upgrade <EMPREINTE> --origin-dl
```

`check` doit conclure `VERDICT: upgrade needed and possible`. `upgrade` refuse si la copie de la release, son manifeste et l'empreinte fournie ne concordent pas, si le moteur n'est pas celui de la release, si une connexion est ouverte sur le port 8789, si un processus média tourne ou si la minuterie réseau est armée. Il sauvegarde l'unité, l'environnement, les exécutables en service et le registre des quotas ; installe le bundle dans un nouveau répertoire `root` ; bascule par un drop-in écrit de façon atomique ; redémarre ; vérifie. **Tout échec après la bascule déclenche le retour arrière automatiquement.**

- **Contrôle** : `UPGRADED`, puis dans la sortie `deployment_signed=200 draining=False active=False`, `deployment_unsigned=401`, `helper_fr=200 localized=True`, `engine_health=200 ok=True`, `origin_host=dl.vidfetch.app`. Aucune valeur secrète n'est affichée.
- **Garde CI, seulement une fois satisfait** (le script ne le modifie pas ; il affiche ces deux commandes avec les bons chemins) :

```sh
sudo python3 guard-update.py add /etc/systemd/system/vidfetch-gateway.service.d/20-gateway-release.conf /opt/vidfetch/releases/gateway-<16 premiers caractères>/vidfetch-gateway.cjs
sudo python3 guard-update.py accept /etc/vidfetch/gateway.env
sudo bash 00-preflight.sh | grep -A3 "code actually running"     # gateway: running bundle = release manifest
```

- **Retour arrière** : `sudo bash 08-gateway.sh rollback` (ancien bundle, environnement identique à l'octet, drop-in retiré, vérification incluse). Si le garde avait déjà été réconcilié, remettre sa version précédente (`ci-web-test-guard.json.bak.<heure>`).
- Ce script ne touche ni à sudoers, ni au compte GitHub Actions, ni à son répertoire de dépôt, ni à nftables, Caddy ou au DNS.

## 4. Sauvegarde et mise en place

À faire après l'étape 3, pour que la sauvegarde contienne la passerelle à jour et le garde réconcilié.

```sh
sudo bash 01-backup.sh
sudo bash 02-stage.sh ~/media-test-stage/render-open80
```

- **Contrôle** : `backup complete` ; `staged: …  Not active.` ; `nft --check OK` ; `Valid configuration`.
- **Retour arrière** : aucun nécessaire, rien n'est activé.

## 5. Réseau, avec restauration automatique

Deux terminaux SSH ouverts. Dans le premier :

```sh
sudo bash 03-network.sh open80 900
```

La minuterie systemd est armée avant le changement : sans confirmation, l'ingress et Caddy d'origine reviennent seuls au bout de 15 minutes.

- **Contrôle**, avant de continuer :
  - nouvelle connexion SSH depuis le second terminal ;
  - sur le Mac : `cd ~/Desktop/vidfetch && bash <(git show origin/main:deploy/ovh/media/admin/verify-tester.sh) <TESTER_IP> pre-cert` ;
  - téléphone en 4G, Wi-Fi coupé : `https://dl.vidfetch.app/` ne doit pas se charger ;
  - `curl -sI https://vidfetch.app/` répond toujours 401.
- **Retour arrière** : `sudo bash 04-cancel.sh`, ou laisser la minuterie agir.

## 6. Certificat de `dl.vidfetch.app`

Toujours sans avoir confirmé :

```sh
sudo bash 05-caddy.sh --port80-verified-from-outside
sudo journalctl -u vidfetch-caddy --since '-3min' --no-pager | grep -iE 'obtain|certificate|acme|error' | tail -15
```

- **Contrôle** : `certificate obtained successfully` pour `dl.vidfetch.app` ; puis sur le Mac la vérification complète, `bash <(git show origin/main:deploy/ovh/media/admin/verify-tester.sh) <TESTER_IP>`, doit finir par `ALL … CHECKS PASSED`.
- En cas d'erreur de validation, ne pas relancer en boucle (5 échecs par heure chez Let's Encrypt) : `04-cancel.sh`, diagnostic, reprise à l'étape 5.
- **Quand tout est vert** : `sudo bash 04-confirm.sh`. Il exige une connexion SSH par clé, postérieure aux nouvelles règles, depuis `<TESTER_IP>`.
- **Retour arrière** : `sudo bash 04-cancel.sh` avant confirmation ; après, `restore-full.sh` (étape « Retour arrière complet »).

## 7. Secrets Turnstile et garde CI

```sh
sudo bash ~/media-test-stage/install-web-secrets.sh /etc/vidfetch/web.env /etc/vidfetch/gateway.env
sudo python3 guard-update.py list
sudo python3 guard-update.py accept /etc/vidfetch/web.env
sudo python3 guard-update.py add /etc/vidfetch/public-https-test/Caddyfile.media-test /etc/vidfetch/public-https-test/media-test-ips.env /etc/vidfetch/public-https-test/ingress.nft /etc/systemd/system/vidfetch-caddy.service.d/media-test.conf
sudo bash 06-profile.sh install
sudo /usr/local/libexec/vidfetch-ci/promote.py status
```

Le script demande la Site Key, puis la Secret Key en saisie masquée ; il copie la clé de service depuis l'environnement de la passerelle sans l'afficher. Ne coller les clés nulle part ailleurs. `guard-update.py add` refuse un fichier déjà surveillé : dans ce cas, le passer à `accept`.

- **Contrôle** : `READY flag still 0` ; `guard-update.py list` n'affiche plus de différence ; `status` indique `"profile": "media-test"`.
- **Retour arrière** : restaurer `web.env.bak.<date>` créé par le script ; `sudo bash 06-profile.sh remove`.

## 8. Activation et tests dans le navigateur

```sh
sudo bash set-ready.sh 1        # refuse si le profil CI ou un secret manque ; ne redémarre que le frontend
```

- **Contrôle technique** : `https://vidfetch.app/api/health`, avec Basic Auth, annonce `"downloads":{"available":true}`. C'est la passerelle mise à niveau à l'étape 3 qui le permet.
- **Tests, depuis `<TESTER_IP>`** : connexion Basic Auth ; vérification Turnstile ; coller une URL autorisée ; télécharger en MP4 puis en MP3 ; ouvrir les deux fichiers ; annuler un téléchargement en cours ; rejouer un lien déjà utilisé (doit échouer).
- **Tests de fermeture** : depuis le téléphone en 4G, le site s'ouvre avec Basic Auth mais le téléchargement échoue ; `https://vidfetch.app/api/download` répond 503 ; un lien YouTube affiche un message de refus, pas un fichier.
- **Retour arrière immédiat** : `sudo bash set-ready.sh 0`.

## Retour arrière complet

Dans cet ordre ; chaque commande vérifie son résultat.

```sh
sudo bash set-ready.sh 0
sudo bash /var/backups/vidfetch-media-test-latest/restore-full.sh /var/backups/vidfetch-media-test-latest --yes
sudo bash 08-gateway.sh rollback          # seulement s'il faut aussi revenir à l'ancienne passerelle
sudo systemctl restart vidfetch-web-preproduction-20261013.service
```

`restore-full.sh` remet le réseau, Caddy, les environnements et le garde dans l'état de la sauvegarde de l'étape 4, donc avec la passerelle à jour. Il ne redémarre rien et ne supprime que les fichiers créés par la recette, un par un. Les certificats, les releases et le registre des quotas ne sont jamais supprimés.

## Ce qui a été testé, et ce qui ne l'a pas été

Testé hors VPS : tous les scripts, dont la mise à niveau et le retour arrière de la passerelle sur Debian 13 avec systemd et Node 22, à partir du bundle réellement en service ; les règles nftables dans un vrai noyau ; Caddy 2.11.7 ; la confirmation SSH avec OpenSSH 10 ; le transfert contre un vrai serveur SSH ; le comportement du frontend à `ready=0` et `ready=1`.

Non testé : le VPS lui-même, Turnstile réel, l'émission du certificat, l'extraction de médias non-YouTube depuis OVH, et le parcours complet dans un navigateur.
