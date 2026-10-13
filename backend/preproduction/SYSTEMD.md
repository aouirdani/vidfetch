# Service systemd VidFetch local

Le service est installé, actif et activé au démarrage sur le Pi après autorisation explicite. Il utilise le bundle Pi corrigé inchangé. La validation des téléchargements et du cycle de vie sous ces restrictions est consignée dans la section 18 de [REPORT.md](../REPORT.md) ; les anciennes versions préparées sont conservées dans les sauvegardes de cette mission.

## Chemins et dépendances

- Unité : `/etc/systemd/system/vidfetch.service`.
- Release dédiée : `/opt/vidfetch/releases/20261011-eu3x4mea/`, propriétaire root, fichiers 0644 et répertoires 0755.
- Exécutables existants : `/usr/local/bin/node` (22.22.2), `/usr/local/bin/yt-dlp`, `/usr/bin/ffmpeg`. Aucun paquet système ou npm installé.
- Bundle : `vidfetch-backend.cjs`, SHA-256 `d370ccfb8574a2f714e86fcde6e555ddd665a846be761ffe29256a648d4a168c`, accompagné du `service-preflight.cjs` révisé. Aucun `node_modules` requis.
- Compte non privilégié dynamique `vidfetch`, géré par systemd ; aucune modification du compte SSH `user`.
- Seul ordre de démarrage explicite : `After=network.target`. Le backend local n’a pas besoin d’activer un service d’attente réseau.
- Répertoires privés gérés par systemd : `/var/lib/vidfetch` et `/run/vidfetch`. `HOME` et `TMPDIR` pointent dessus ; écriture Python de bytecode désactivée. Configurations et cookies/proxies hérités des moteurs ignorés.
- L’ancien `/home/user/vidfetch-backend/server.js`, les releases de validation et toutes les sauvegardes sont conservés.

## Contrôleurs cgroup et limites

Cgroup v2 confirmé. Contrôleurs racine `cpuset cpu io pids` ; `system.slice` expose `cpu pids`. Le contrôleur mémoire est absent et `/proc/cmdline` contient `cgroup_disable=memory`. Aucun fichier de boot, réglage noyau, contrôleur global ou redémarrage du Pi modifié.

L’utilisateur autorise expressément le fonctionnement sans `MemoryMax` : `MemoryAccounting=no`, aucune directive `MemoryMax`, `MemoryHigh` ou `MemorySwapMax`. Les valeurs systemd `infinity` décrivent cette absence de plafond ; elles ne constituent pas une limite de RAM. Le preflight ne refuse plus le démarrage pour ce motif. Il vérifie toujours Linux ARM64, le bundle exact, l’écoute configurée sur loopback 8788, le port libre et les limites CPU/processus effectivement appliquées.

Limites conservées :

- Heap V8 Node **128 MiB** ; cette option ne plafonne ni le RSS total Node ni la mémoire des moteurs.
- CPU du cgroup **150 % d’un cœur** : `cpu.max = 150000 100000`, poids CPU 50 et nice 10. Les descendants sont inclus.
- **128 tâches**, threads compris : `pids.max = 128` ; 1 024 descripteurs et aucun core dump.
- Limites applicatives du bundle inchangé : une seule opération coûteuse simultanée, sortie 256 MiB, opération totale 10 min, métadonnées 2 MiB/75 s, premier morceau 90 s, inactivité 30 s, corps 8 KiB/10 s, tickets 60 s et statuts 30 min/256 entrées.

Ces contrôles par unité correspondent à la [documentation officielle systemd 257](https://raw.githubusercontent.com/systemd/systemd/v257/man/systemd.resource-control.xml). La RAM mesurée est la somme des RSS de processus du cgroup, avec possible double comptage des pages partagées ; aucune comptabilité mémoire cgroup n’est disponible.

## Protections et comportement

`DynamicUser`, `NoNewPrivileges`, capacités vides, `PrivateTmp`, `PrivateDevices`, `ProtectSystem=strict`, `ProtectHome`, `ProtectControlGroups`, protections du noyau/horloge et familles d’adresses AF_UNIX/INET/INET6 conservés. Ces protections laissent fonctionner DNS, HTTPS, Python/yt-dlp, Node et ffmpeg logiciel. Aucun `MemoryDenyWriteExecute` imposé au JIT Node. Voir les [paramètres d’exécution officiels](https://raw.githubusercontent.com/systemd/systemd/v257/man/systemd.exec.xml).

Écoute exclusivement **127.0.0.1:8788**. Journald reçoit les sorties du seul service ; débit de logs limité, aucun changement de la configuration globale journald. `Restart=on-failure`, délai 15 s et trois démarrages maximum par cinq minutes. `KillMode=control-group`, arrêt SIGTERM puis SIGKILL au-delà de 30 s, couvrant aussi les moteurs avec groupes POSIX détachés. Un arrêt administratif reste arrêté. Les règles de reprise sont décrites dans la [documentation du service](https://raw.githubusercontent.com/systemd/systemd/v257/man/systemd.service.xml).

Les tickets et statuts sont en mémoire : arrêt ou panne les efface. Le frontend et Supabase ne sont pas modifiés. L’isolation complète des destinations réseau secondaires et une authentification restent nécessaires pour une future exposition, qui n’est pas déployée ici.

## Exploitation sur le Pi

```sh
systemctl is-active vidfetch.service
systemctl is-enabled vidfetch.service
curl --max-time 5 -sS http://127.0.0.1:8788/api/health
journalctl -u vidfetch.service -n 50 --no-pager
sudo systemctl stop vidfetch.service
sudo systemctl start vidfetch.service
sudo systemctl restart vidfetch.service
```

Prévoir le temps de détection initiale de yt-dlp avant la disponibilité HTTP. `active` seul n’atteste pas que le backend répond : contrôler `/api/health`.

L’activation concerne uniquement le lien `multi-user.target.wants/vidfetch.service`. Le démarrage après un vrai reboot reste non testé tant qu’un redémarrage du Pi n’est pas autorisé. Pour revenir à un service arrêté : arrêter puis désactiver uniquement `vidfetch.service`, sans supprimer sa release ni les sauvegardes. Toute future modification de fichiers existants doit être précédée d’une sauvegarde.
