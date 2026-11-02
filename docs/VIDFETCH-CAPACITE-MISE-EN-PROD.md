# Activation opérateur de la capacité v2

## Préconditions et disposition réelle

Le build CI produit une archive immuable `release-<SHA>.tgz`. Le workflow peut la transférer dans `/var/lib/vidfetch-deploy/ci-incoming/<SHA>.tgz`, puis le `promote.py` installé refuse volontairement toute archive dont les bundles moteur ou passerelle diffèrent de `current/manifest.json`. L'échec de ce garde après transfert est attendu pour cette PR; ne relancez pas les jobs et ne reconstruisez pas l'archive.

Le frontend est stocké sous `/opt/vidfetch-ci-web/releases/<SHA>` et servi via `/opt/vidfetch-web-preproduction-20261013/current`. Le moteur et le gateway résident séparément sous `/opt/vidfetch/releases/<répertoire>` et utilisent `vidfetch.service` et `vidfetch-gateway.service`. La mise à niveau installe deux bundles immuables et des drop-ins `ExecStart`, puis aligne le pointeur frontend sur la même release CI. Elle prend `/opt/vidfetch-ci-web/lock`, crée une sauvegarde sous `/var/backups` et met à jour `/etc/vidfetch/ci-web-test-guard.json` avec le helper installé `guard-update.py`. En cas d'échec, le script restaure le pointeur, les deux drop-ins et le garde, redémarre et vérifie l'ancienne version.

N'exécuter qu'après fusion de cette PR sur `main`, CI build terminée, et accès administrateur disponible. Le contrôle `check` est sans effet de bord. Les commandes ci-dessous sont à exécuter dans un checkout local du dépôt synchronisé avec `origin/main`. Les seuls champs à remplacer sont `RUN_ID`, `RELEASE_SHA` et `ARCHIVE_SHA256`, valeurs publiées dans la page de résumé du workflow `Validate and deploy VidFetch` correspondant au commit main. Vérifiez deux fois qu'elles désignent le même build.

## Séquence unique

```sh
# 1. Depuis le Mac opérateur : télécharger l'archive précise du run CI (pas de rebuild).
RUN_ID=REMPLACER_PAR_ID_DU_RUN
RELEASE_SHA=REMPLACER_PAR_SHA_COMPLET_DU_COMMIT_MAIN
ARCHIVE_SHA256=REMPLACER_PAR_SHA256_DE_L_ARCHIVE_DU_RESUME_CI
mkdir -p /tmp/vidfetch-capacity-release
gh run download "$RUN_ID" -n "release-$RELEASE_SHA" -D /tmp/vidfetch-capacity-release
shasum -a 256 "/tmp/vidfetch-capacity-release/release-$RELEASE_SHA.tgz"
# Attendu : exactement ARCHIVE_SHA256.

# 2. Envoyer l'archive et les deux outils administrateur vers le VPS, sans les activer.
scp "/tmp/vidfetch-capacity-release/release-$RELEASE_SHA.tgz" \
  deploy/ovh/media/admin/12-engine-release.sh \
  deploy/ovh/media/admin/guard-update.py \
  deploy/ovh/ci/release-lib.py \
  root@15.235.127.165:/var/tmp/
# Attendu : transfert complet; aucun fichier en production n'a encore changé.

# 3. Ouvrir une session administrateur sur le VPS. Installer les outils en emplacement root protégé,
# copier l'archive CI sous son SHA et vérifier son hash avant l'examen.
ssh root@15.235.127.165
set -eu
RELEASE_SHA=REMPLACER_PAR_SHA_COMPLET_DU_COMMIT_MAIN
ARCHIVE_SHA256=REMPLACER_PAR_SHA256_DE_L_ARCHIVE_DU_RESUME_CI
install -o root -g root -m 0755 /var/tmp/12-engine-release.sh /usr/local/libexec/vidfetch-ci/12-engine-release.sh
install -o root -g root -m 0755 /var/tmp/guard-update.py /usr/local/libexec/vidfetch-ci/guard-update.py
install -o root -g root -m 0644 /var/tmp/release-lib.py /usr/local/libexec/vidfetch-ci/release-lib.py
install -o vidfetch-deploy -g vidfetch-deploy -m 0640 \
  "/var/tmp/release-$RELEASE_SHA.tgz" "/var/lib/vidfetch-deploy/ci-incoming/$RELEASE_SHA.tgz"
printf '%s  %s\n' "$ARCHIVE_SHA256" "/var/lib/vidfetch-deploy/ci-incoming/$RELEASE_SHA.tgz" | sha256sum --check --strict
# Attendu : le hash affiche OK.

# 4. Vérifier l'état courant; n'appliquer que si le garde est propre et que les bundles actuels
# correspondent au manifeste frontend. La commande ne modifie ni services ni fichiers.
sudo /usr/local/libexec/vidfetch-ci/promote.py status
sudo python3 /usr/local/libexec/vidfetch-ci/guard-update.py list
sudo bash /usr/local/libexec/vidfetch-ci/12-engine-release.sh check "$RELEASE_SHA" "$ARCHIVE_SHA256"
# Attendu : status du frontend actuel, « 0 differing », parité moteur/gateway courante,
# hashes cible et verdict « archive verified ». Si un de ces contrôles échoue, s'arrêter.

# 5. Appliquer la transaction; le script sauvegarde, installe les deux bundles, aligne le frontend,
# met à jour le garde, teste les services et lance son rollback automatique si une vérification échoue.
sudo bash /usr/local/libexec/vidfetch-ci/12-engine-release.sh apply "$RELEASE_SHA" "$ARCHIVE_SHA256"
# Attendu : « APPLIED », chemins de sauvegarde et hashes des deux bundles, « guard=clean ».

# 6. Contrôler l'état une fois encore, puis vérifier la santé publique depuis le VPS.
sudo /usr/local/libexec/vidfetch-ci/promote.py status
sudo python3 /usr/local/libexec/vidfetch-ci/guard-update.py list
curl --fail --silent --show-error https://vidfetch.app/api/health
curl --fail --silent --show-error -I https://vidfetch.app/
# Attendu : release = RELEASE_SHA, frontend.ready et downloads.available true, zéro différence
# de garde, accueil HTTP 200. Contrôler aussi title/robots/canonical/hreflang en HTML si besoin.

# 7. En cas d'anomalie après une application confirmée, lancer le rollback explicite puis contrôler
# les mêmes health/status et le garde. Le script refuse un rollback devenu obsolète.
sudo bash /usr/local/libexec/vidfetch-ci/12-engine-release.sh rollback
sudo /usr/local/libexec/vidfetch-ci/promote.py status
sudo python3 /usr/local/libexec/vidfetch-ci/guard-update.py list
```

Après l'étape 6, les pushes main suivants peuvent utiliser le workflow normal : les moteurs de leur archive et le manifeste frontend sont désormais alignés. Le rollback remet aussi l'ancien pointeur frontend et restaure le garde d'avant l'opération; il ne supprime aucune release. Les archives de CI, les releases et les sauvegardes restent conservées pour diagnostic. Ne pas exécuter en présence de transferts actifs : `check`/`apply` refuse les connexions gateway et processus média en cours.

## Installer le nettoyage hebdomadaire des archives entrantes

Cette installation ne lance pas le nettoyage immédiatement. Le service hebdomadaire prend d'abord le même verrou `/var/lib/vidfetch-deploy/ci-incoming/.lock` que `dispatch.py`, puis le verrou du store utilisé par `promote.py`. Il déplace atomiquement les anciennes archives vers `/var/backups/vidfetch-ci-incoming-<date>`; il conserve toujours la release active et les trois archives les plus récentes, ignore toute archive âgée de moins de 30 minutes et ne touche pas aux fichiers temporaires. Un déplacement inter-filesystems est refusé. Le timer s'exécute le dimanche vers 03:30 UTC avec un délai aléatoire maximal de 15 minutes. Tous les messages sont dans le journal systemd.

Après fusion de la PR, depuis un checkout synchronisé avec `origin/main`, copier-coller cette séquence complète. Contrôler la ligne « Attendu » après chaque étape avant de continuer :

```sh
scp deploy/ovh/media/admin/13-clean-ci-incoming.py deploy/ovh/systemd/vidfetch-ci-incoming-cleanup.service deploy/ovh/systemd/vidfetch-ci-incoming-cleanup.timer root@15.235.127.165:/var/tmp/
# Attendu : les trois fichiers versionnés sont transférés au VPS.

ssh root@15.235.127.165 'bash -s' <<'REMOTE'
set -eu
# Attendu : session root; une erreur interrompt le reste de la séquence.

install -o root -g root -m 0755 /var/tmp/13-clean-ci-incoming.py /usr/local/libexec/vidfetch-ci/13-clean-ci-incoming.py
# Attendu : script installé root:root, exécutable.

install -o root -g root -m 0644 /var/tmp/vidfetch-ci-incoming-cleanup.service /etc/systemd/system/vidfetch-ci-incoming-cleanup.service
# Attendu : unité oneshot installée.

install -o root -g root -m 0644 /var/tmp/vidfetch-ci-incoming-cleanup.timer /etc/systemd/system/vidfetch-ci-incoming-cleanup.timer
# Attendu : timer hebdomadaire installé.

systemd-analyze verify /etc/systemd/system/vidfetch-ci-incoming-cleanup.service /etc/systemd/system/vidfetch-ci-incoming-cleanup.timer
# Attendu : aucune erreur de syntaxe ou de dépendance systemd.

systemctl daemon-reload
# Attendu : systemd a rechargé les unités sans erreur.

systemctl enable --now vidfetch-ci-incoming-cleanup.timer
# Attendu : lien d'activation créé et timer démarré; aucun archivage immédiat.

systemctl is-enabled vidfetch-ci-incoming-cleanup.timer && systemctl is-active vidfetch-ci-incoming-cleanup.timer
# Attendu : enabled puis active.

systemctl list-timers --all vidfetch-ci-incoming-cleanup.timer
# Attendu : prochaine échéance hebdomadaire affichée.

systemctl start vidfetch-ci-incoming-cleanup.service
# Attendu : commande terminée sans erreur; aucun transfert concurrent n'a été interrompu.

journalctl -u vidfetch-ci-incoming-cleanup.service -n 20 --no-pager
# Attendu : ligne « complete » ou « skipped: dispatcher holds ... »; si déplacement, elle nomme
# le dossier daté et le nombre d'archives déplacées. Le SHA actif est conservé.

find /var/backups -maxdepth 2 -type f -path '/var/backups/vidfetch-ci-incoming-*/*' -printf '%p %s bytes\n'
# Attendu : les archives déplacées restent présentes sous une sauvegarde datée; rien n'est effacé.

du -sh /var/lib/vidfetch-deploy/ci-incoming
# Attendu : taille résiduelle. Le rapport quotidien déclenche ci_incoming_storage_above_500_mib
# au-delà de 500 MiB.
REMOTE
# Attendu : code de sortie zéro; une réponse non nulle nécessite d'inspecter journald avant toute relance.
```

### Éléments encore à vérifier par l'administrateur

- Confirmer le dossier de réception et les valeurs d'archive du run précis avant la copie; l'accès SSH/root n'est pas disponible dans l'environnement de développement.
- Contrôler la commande `status`, la santé de Caddy/DNS et l'état des trois services après application. Le script vérifie loopback et l'apex TLS depuis le VPS, mais ce rapport ne peut pas certifier l'état du VPS.
- Installer et lancer le timer de nettoyage avec la séquence ci-dessus; la procédure et le déplacement n'ont pas été exécutés sur le VPS depuis cet environnement.
- La capacité proposée dans cette branche n'est pas activée en production avant cette opération. Mesurer ensuite les compteurs et la RAM réelle avant d'annoncer une capacité quotidienne supérieure.
