# Backend VidFetch local

La cible actuelle est le **VPS OVH autonome**, installé et activé en loopback : [déploiement, preuves et étapes HTTPS/Preview](preproduction/OVH-VPS-DEPLOYMENT.md). Le Raspberry Pi est préservé. Vidéo et MP3 de fixture publique ont été validés sur VPS ; **YouTube réel demande une vérification anti-bot depuis OVH**. Aucun accès public ni paramètre Vercel/Supabase/Cloudflare modifié. Les préparations Funnel/Pi ci-dessous restent historiques ; le mode dégradé frontend reste le défaut.

La source maintenue est maintenant `backend/server.ts`, avec un point d'entrée `backend/main.ts`. Les anciens fichiers dans `~/vidfetch-backend-build` sont conservés intégralement. Ne pas utiliser leur ancien bundle pour déployer les corrections.

Les sources, tests et procédures sont destinés à GitHub ; `artifacts/` et `backups/` restent privés et exclus par `.gitignore`. Les liens vers ces preuves correspondent au poste de validation et ne sont pas disponibles dans un clone neuf. Le bundle Pi ne sera pas remplacé par un déploiement frontend. Pour le frontend Vercel, consulter [la procédure manuelle](../DEPLOY-VERCEL.md) : les téléchargements restent explicitement indisponibles jusqu'à la création d'une passerelle sécurisée. esbuild est épinglé à **0.25.12** pour reproduire le bundle Pi corrigé.

Le service permanent est maintenant installé et activé sur le Pi : [configuration et exploitation systemd](preproduction/SYSTEMD.md), exclusivement **127.0.0.1:8788**. Le contrôleur cgroup mémoire est absent ; selon l’autorisation explicite, aucune limite `MemoryMax`/`MemoryHigh`/swap cgroup n’est annoncée. Heap Node 128 MiB, CPU 150 %, tâches 128 et limites applicatives restent actifs. Le [plan de retrait MagicMirror exécuté](preproduction/MAGICMIRROR-REMOVAL.md) et l’[architecture d’accès sécurisé future](preproduction/ACCESS-ARCHITECTURE.md) restent documentés ; aucun accès public déployé.

La reprise a validé vidéo, MP3, rétention réelle des statuts à 30 minutes et arrêt propre avec le bundle corrigé inchangé ; [preuves finales](artifacts/preproduction-20261011-UfO9y4/verification.json). Les anciens backends temporaires sont arrêtés ; le service permanent est **actif**, santé HTTP 200, et **activé au démarrage**. Vidéo, MP3 et reprise après panne ont été testés sous ses protections ; voir la section 18 du [rapport](REPORT.md). MagicMirror a depuis été définitivement retiré après confirmation, audit root et revalidation intégrale des sauvegardes Pi et Mac ; voir la section 17 du [rapport](REPORT.md). Seuls les deux dossiers autorisés et leur lancement automatique ont été retirés ; les outils partagés et VidFetch sont préservés. Pour l'usage personnel, l'étude recommande un accès réseau privé authentifié : les routes Tunnel publiques Cloudflare ont des restrictions de transfert média à prendre en compte.

## Compilation et vérifications sur le Mac

Les dépendances de développement déjà installées dans le dépôt suffisent. Aucun paquet Next.js, esbuild, ffmpeg-static ni module natif n'est nécessaire pour exécuter le bundle sur le Pi.

```sh
node backend/build.mjs backend/artifacts/vidfetch-backend-new.cjs
node backend/verify-build.mjs backend/artifacts/vidfetch-backend-new.cjs
node node_modules/typescript/bin/tsc -p backend/tsconfig.json
npm run typecheck
node backend/tests/run.mjs
node backend/tests/run-media.mjs
```

Le compilateur refuse un fichier de sortie déjà présent. Les tests des moteurs réels utilisent les chemins du Mac, un média original généré avec ffmpeg et des ports loopback temporaires. Leur injection de métadonnées locales existe uniquement dans les tests, sans route ni variable permettant de désactiver la validation réseau du backend exécuté.

Le bundle à utiliser sur le Pi est [artifacts/vidfetch-backend-pi-20261011.cjs](artifacts/vidfetch-backend-pi-20261011.cjs), SHA-256 `d370ccfb8574a2f714e86fcde6e555ddd665a846be761ffe29256a648d4a168c`. Il a été exécuté et testé sur Debian ARM64 avec Node 22.22.2, sans `node_modules`. Les paramètres esbuild sont `bundle: true`, `platform: node`, `target: node22`, `format: cjs`, avec le shim `ffmpeg-static` retournant `null`.

Le bundle Mac initial `artifacts/vidfetch-backend-delivery-20261011.cjs` reste conservé. Sa sonde yt-dlp de 8 s était trop courte sur le Pi 3 : le zipapp Python a nécessité 10,4 s pour démarrer. Le nouveau bundle accorde 30 s à la détection initiale des binaires sur Linux ARM64 ; prévoir ce délai avant la première réponse HTTP. Les limites de téléchargement restent inchangées. Les tests Mac précédemment validés n'ont pas été recommencés lors de la reprise Pi ; la compilation, la vérification du nouveau bundle et le typecheck backend ont été refaits.

## Limites et contrats

- Écoute forcée sur `127.0.0.1`, port `8788` par défaut. Une autre valeur de `HOST` est refusée.
- Une seule opération coûteuse à la fois : extraction, préparation, attente du ticket ou streaming. Les autres demandes coûteuses reçoivent HTTP 429.
- Ticket à usage unique, valable 60 secondes après préparation. Le timer est annulé à la consommation du ticket.
- Statut conservé 30 minutes après sa dernière mise à jour. Les consultations ne prolongent pas sa rétention.
- Historique limité à 256 statuts : de nouvelles préparations sont refusées à saturation, sans supprimer prématurément les statuts retenus.
- Corps JSON : 8 KiB, 10 secondes. Métadonnées : 2 MiB, 75 secondes, sans cache persistant dans le backend.
- Premier morceau : 90 secondes. Opération entière : 10 minutes, préparation et attente comprises. Streaming inactif : 30 secondes.
- Média : 256 MiB maximum, durée déclarée de 30 minutes maximum, directs refusés. Une taille inconnue reste limitée pendant l'envoi.
- yt-dlp reçoit une limite de débit de 2 MiB/s et un fragment simultané. Le downloader externe ffmpeg ne garantit pas cette limite de débit ; les limites de durée, de sortie et le backpressure restent appliquées.
- Les statuts sont en mémoire : un redémarrage perd tickets et statuts. Aucun changement Supabase n'est effectué.

Les cinq routes de la mission et leurs champs JSON restent disponibles. Le téléchargement retourne un flux sans `Content-Length` estimé. `completed` exige une sortie zéro de chaque moteur et la fin de la réponse HTTP. Le compteur décrit les octets écrits à la réponse ; il ne prouve pas à lui seul la réception par le client. Les essais confrontent ce compteur au fichier effectivement reçu.

## Déploiement temporaire Pi

La connexion SSH non interactive et les tests temporaires ont été exécutés le 11 octobre 2026. Le répertoire réussi est `/home/user/vidfetch-backend-validation-20261011-HvXFBSRJ` ; le premier essai et son diagnostic restent dans `/home/user/vidfetch-backend-validation-20261011-7JAIx8Uh`. À la fin de ces essais temporaires, le backend avait été arrêté, le port 8788 libéré et ses descendants nettoyés. Le port est désormais utilisé exclusivement par le service permanent validé ; ne pas l’arrêter pour relancer inutilement ces anciens tests. L'installation préexistante `/home/user/vidfetch-backend/server.js` est conservée.

Les preuves récupérées et les mesures RAM/CPU sont dans [artifacts/pi-validation-20261011/verification.json](artifacts/pi-validation-20261011/verification.json) et le [rapport](REPORT.md). MagicMirror et le serveur 8787 étaient inactifs avant et après les essais. MagicMirror a ensuite été retiré conformément au plan confirmé ; les sauvegardes Pi et Mac restent conservées. Ne pas le réinstaller pour tester une cohabitation devenue inutile. Le serveur 8787 reste préservé et n'est ni démarré, ni arrêté, ni modifié par cette procédure.

Pour un nouvel essai, inspecter d'abord sans modification. Ne pas communiquer de mot de passe ni de clé privée dans la conversation.

```sh
ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=yes user@192.168.1.112 'sh -s' < backend/pi-inspect.sh
```

Vérifier le compte `user`, Debian ARM64, Node 22, les deux moteurs, la mémoire et les processus existants. Si 8788 est occupé, s'arrêter sans toucher au processus occupant le port. Toujours créer un nouveau répertoire de test ; les scripts créent leurs résultats sans écraser les fichiers présents.

```sh
vidfetch_pi_dir=$(ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=yes user@192.168.1.112 'umask 077; mktemp -d /home/user/vidfetch-backend-validation-20261011-XXXXXXXX')
case "$vidfetch_pi_dir" in
  /home/user/vidfetch-backend-validation-20261011-????????) ;;
  *) exit 1 ;;
esac
scp backend/artifacts/vidfetch-backend-pi-20261011.cjs "user@192.168.1.112:$vidfetch_pi_dir/vidfetch-backend.cjs"
scp backend/pi-test.mjs "user@192.168.1.112:$vidfetch_pi_dir/pi-test.mjs"
scp backend/pi-observe.mjs "user@192.168.1.112:$vidfetch_pi_dir/pi-observe.mjs"
scp backend/pi-http-extra.mjs "user@192.168.1.112:$vidfetch_pi_dir/pi-http-extra.mjs"
ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=yes user@192.168.1.112 "cd '$vidfetch_pi_dir' && sha256sum vidfetch-backend.cjs"
# Comparer l'empreinte à celle indiquée ci-dessus avant d'exécuter le test.
ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=yes user@192.168.1.112 "cd '$vidfetch_pi_dir' && node --check vidfetch-backend.cjs && node --check pi-test.mjs && node --check pi-observe.mjs && node --check pi-http-extra.mjs && test -z \"\$(ss -H -ltn 'sport = :8788')\" && node pi-observe.mjs"
```

Conserver le répertoire et récupérer `pi-results.json`, `pi-resources.json`, `pi-http-extra.json` et `pi-backend.log` dans un nouveau répertoire local. Examiner les snapshots avant/après, la famille de processus VidFetch, les services surveillés, l'empreinte et le nombre d'octets reçus. `pi-observe.mjs` échantillonne `/proc` toutes les secondes et lance les tests HTTP complémentaires. `pi-test.mjs` utilise `nice -n 10`, une limite de heap Node de 128 MiB, les moteurs système et uniquement 127.0.0.1:8788 ; il arrête son propre PID Node avec SIGTERM à la fin et en cas de signal. Ces scripts ne créent aucun service et n'installent rien. Le test réel utilise Big Buck Bunny public, puis vérifie l'expiration réelle du ticket et une déconnexion client.

Pour contrôler l'intégrité du fichier reçu, effectuer un décodage intégral depuis ce répertoire, uniquement après l'arrêt du backend :

```sh
timeout 180 nice -n 19 /usr/bin/ffmpeg -hide_banner -loglevel error -xerror -err_detect explode -threads 1 -i public-test.mp4 -map 0 -fps_mode:v passthrough -enc_time_base:v demux -f null -
```

La conservation de la base de temps du démuxeur évite les erreurs de conversion d'horodatages du muxer de diagnostic. Ce contrôle est passé sans erreur sur le fichier Pi de 12 257 965 octets. Voir la [documentation FFmpeg](https://www.ffmpeg.org/ffmpeg.html). Les résultats ne valent validation qu'après exécution et examen effectifs.

## Sécurité et intégration future

La validation d'entrée utilise une liste exacte de domaines et chemins de médias individuels ; les paramètres inutiles sont retirés par canonicalisation. Les adresses privées, locales et réservées sont refusées lors de la vérification DNS préalable, et les destinations des métadonnées sélectionnées sont inspectées. Les commandes utilisent `spawn` avec tableaux d'arguments, sans shell. Les erreurs brutes d'upstream ne sont pas journalisées. Le Host local et l'origine navigateur sont vérifiés ; aucune autorisation CORS publique n'est activée.

Ces vérifications préalables ne constituent pas une isolation réseau complète : les redirections, requêtes secondaires, résolutions suivantes ou manifests traités dans yt-dlp/ffmpeg ne sont pas tous contrôlés par Node. Une future exposition exige une politique de sortie réseau couvrant aussi ces processus, en plus d'une authentification ou passerelle sécurisée. Voir les recommandations [OWASP sur SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).

Un frontend Vercel ne peut pas accéder directement au `127.0.0.1` du Pi. La validation ARM64 locale est faite ; le service systemd local est également actif ; restent le choix explicite d’un accès privé ou d’une passerelle sécurisée et les protections réseau associées, puis un adaptateur frontend conservant URL, format, type, ticket et polling du statut. Un service permanent ou une modification réseau nécessite l'accord explicite de l'utilisateur. Aucun tunnel, reverse proxy public, port forwarding, changement Vercel ou changement Supabase n'est réalisé ici.
