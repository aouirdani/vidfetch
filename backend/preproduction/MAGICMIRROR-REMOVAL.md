# Retrait MagicMirror — exécuté après confirmation

État avant action : MagicMirror 2.38.0 installé, aucun processus actif identifié, aucun service systemd associé dans les emplacements inspectés, PM2 absent du PATH et `/home/user/.pm2` absent. Ports 8787/8788/8080 libres à l'audit initial. Aucun lien entrant ou service lisible dépendant de `/home/user/MagicMirror` trouvé. Après autorisation explicite, l’audit root en lecture seule a confirmé l’absence de crontab root et des deux dumps PM2 root. Aucun mécanisme supplémentaire à retirer n’a été trouvé.

## Sauvegarde vérifiée

Archive complète `/home/user/vidfetch-maintenance-20261011-ALaZGoF9/magicmirror-full.tar`, incluant l'application, tous ses modules et dépendances locales, la configuration, les données `.config/magicmirror` et le fichier autostart complet. **21 648 fichiers** vérifiés individuellement par SHA-256 ; archive **643 256 320 octets**, SHA-256 `1582132120467a95cc57af1246214c0088bf88ff4164b65d68f8cc364baa4b3f`. Répertoire privé et archive mode 0600. Une copie Mac a été récupérée sous `backend/artifacts/preproduction-20261011-UfO9y4/magicmirror-full.tar`, exclue de Git, avec empreinte identique vérifiée. Ne jamais publier cette archive susceptible de contenir des données personnelles.

**État final : désinstallation VALIDÉE le 11 octobre 2026, de 21:15:50 à 21:16:50 UTC**, après confirmation explicite de l’utilisateur. Les deux dossiers sont absents ; seule la commande ligne 7 de l’autostart a été remplacée par un commentaire. Toutes les autres lignes et permissions sont conservées. Les sauvegardes complètes Mac et Pi et les fichiers VidFetch sont préservés. [Preuves et bilan](../REPORT.md#17-désinstallation-définitive-magicmirror-après-confirmation). Ne pas rejouer une suppression déjà effectuée.

## Plan exact autorisé et exécuté

1. Avec accord sudo, exécuter uniquement `sudo -n /usr/bin/python3 /home/user/vidfetch-maintenance-20261011-ALaZGoF9/magicmirror-root-audit.py`. Le script préparé ne fait que lire `/var/spool/cron/crontabs/root` et les éventuels `/root/.pm2/dump.pm2` et `dump.pm2.bak`. Il imprime des noms/chemins et numéros de lignes pertinents, jamais leurs commandes, environnements ou secrets. Si une dépendance supplémentaire est découverte, suspendre la suppression et présenter la nouvelle action exacte ; si sudo exige un mot de passe, ne pas le demander dans la conversation.
2. Désactiver exclusivement la ligne 7 liée à MagicMirror dans `/home/user/.config/labwc/autostart`, en conservant toutes les autres lignes et la sauvegarde de l'original. Ne pas redémarrer la session graphique, labwc ou les services partagés. Vérifier l'empreinte préalable `bdd0eaf840c9029ea8d3f915963387104f513a48c6fcdaded877283ec60e70c6` avant modification.
3. Après confirmation explicite et nouvelle vérification d'absence de processus/dépendance, supprimer uniquement `/home/user/MagicMirror` (**654 564 KiB**) et `/home/user/.config/magicmirror` (**4 KiB**). Le premier contient les dépendances npm/Electron locales exclusivement attachées à cette installation, dont `node_modules` (**621 852 KiB**). Aucune suppression de package apt/npm global, cache global ou dépendance partagée n'est proposée.
4. Conserver les sauvegardes Pi et Mac et tous les anciens artefacts VidFetch. Ne supprimer aucune archive dans cette autorisation.
5. Vérifier après retrait : chemins absents, autostart sans lancement MagicMirror, Node 22/yt-dlp/ffmpeg/SSH disponibles, port 8787 inchangé, mémoire et `df -k` avant/après.

Le retrait des dossiers représente environ **639,2 MiB**. La nouvelle sauvegarde Pi conserve environ **613,5 MiB**, donc le gain net depuis le début de la mission sera bien inférieur au volume désinstallé tant que cette sauvegarde reste sur Pi. MagicMirror est déjà arrêté : aucun gain de RAM attribuable à son arrêt n'est attendu. Ne pas attribuer les variations de cache Linux ou des scripts de test à sa désinstallation.

## Restauration si nécessaire

Ne pas extraire l'archive sur des chemins existants. Extraire dans un nouveau dossier privé puis vérifier le manifeste ; restaurer les seuls chemins approuvés après examen. Les sauvegardes ne sont jamais supprimées automatiquement.

## Preuves de l’exécution

L’archive Mac a été re-hachée avant retrait ; l’archive Pi a été re-hachée avant et après. Les **21 648 fichiers sources** ont été recomparés au manifeste avant toute suppression : aucune divergence ni ajout. L’unique sudo exécuté est la commande d’audit root en lecture seule prévue au point 1. Le script de retrait a été exécuté en tant que `user`, sans sudo, et est sorti **0**, sans stderr. Aucun package apt/npm global, cache global, archive ou dépendance partagée supprimé.

Les relevés immédiats `df -k` montrent **654 568 KiB / 639,2 MiB** récupérés. La mémoire disponible immédiate passe de 602 à 599 MiB ; MagicMirror étant déjà arrêté, aucun gain de RAM de processus ne lui est attribué. Les versions et empreintes des outils, le serveur VidFetch préexistant, les deux bundles Pi surveillés, SSH actif et les ports sont préservés. Les artefacts de contrôle sont sous `backend/artifacts/magicmirror-removal-20261011-0068tz44/`, avec [contrôle après retrait](../artifacts/magicmirror-removal-20261011-0068tz44/preservation-after.json).
