# Rapport de finalisation VidFetch — 11 octobre 2026

Le backend est **VALIDÉ sur le Raspberry Pi 3 B+**, après un correctif ciblé du délai de détection de yt-dlp sur Linux ARM64. Les sections 1–13 conservent les preuves de cette première validation. La reprise « nettoyage et préparation production » est détaillée en section 16 : vidéo et MP3 réels, rétention réelle de 30 minutes et nettoyage final **VALIDÉS**, avec le seul bundle Pi corrigé inchangé. Ces processus temporaires sont arrêtés. Après la désinstallation MagicMirror en section 17, le **service permanent VidFetch a été installé, testé et activé**, exclusivement sur **127.0.0.1:8788** ; résultats actuels en section 18. Les tests Mac déjà validés n’ont pas été recommencés.

Aucun paquet système, changement de boot/noyau, redémarrage du Pi, modification réseau, modification Vercel/Supabase ou publication Git effectué. Le seul service permanent installé et activé est désormais `vidfetch.service`, après autorisation explicite. L'installation VidFetch préexistante est conservée. MagicMirror et le serveur 8787 étaient inactifs dès l'inspection initiale. La désinstallation définitive de MagicMirror a ensuite été explicitement autorisée et exécutée : les deux dossiers et leur lancement automatique sont retirés, les sauvegardes et ressources partagées conservées. Les preuves de ce retrait sont en section 17 ; lors de cette désinstallation, sudo a servi uniquement à l’audit root en lecture seule. Les usages sudo dédiés au nouveau service VidFetch sont détaillés en section 18.

Les états utilisés sont **VALIDÉ**, **NON TESTÉ**, **ÉCHEC**, **BLOQUÉ**. Une réussite sur le Mac ne vaut pas validation ARM64 sur le Pi.

## 1. Problèmes identifiés — VALIDÉ par audit

- Le correctif du même itérateur et le `clearTimeout` du premier morceau étaient présents dans la source externe. L'ancien bundle n'était pas à jour.
- `isEngineError` ne reconnaissait pas les `Error` portant `status` et `code` : risque de transformer 400, 413, 504 et 429 en 500.
- La réservation de concurrence se faisait après plusieurs opérations asynchrones ; deux préparations pouvaient démarrer ensemble.
- L'attente de `drain` ne prenait pas en compte les déconnexions ; la lecture d'un flux bloqué ne pouvait pas être annulée proprement.
- La fin de stdout était assimilée à une réussite sans vérifier les codes de sortie de yt-dlp/ffmpeg.
- Les erreurs de spawn/stdin n'étaient pas toutes traitées. L'arrêt du seul yt-dlp ne couvrait pas ses descendants.
- Réutiliser un ticket pouvait écraser son statut ; demander un token inconnu créait un statut expiré inutile.
- Les statuts n'étaient pas purgés, et l'ensemble des opérations n'avait pas de durée maximale ni de limite de sortie.
- ffmpeg était codé en dur sur `/usr/bin/ffmpeg` pour MP3, incompatible avec le chemin du Mac.
- L'écoute par défaut était `0.0.0.0`. La validation des domaines d'entrée existait, sans vérification DNS privée ni inspection des destinations des métadonnées.
- **ÉCHEC initial sur Pi, corrigé** : le bundle validé sur Mac sondait les binaires avec un timeout de 8 s. Le zipapp Python yt-dlp du Pi a effectivement nécessité 10 399 ms pour `--version`. À 8 s, la sonde était interrompue (`ETIMEDOUT`) et `/api/health` répondait 503 avec `ytDlp: null`, malgré un moteur installé et fonctionnel.

## 2. Correctifs appliqués — VALIDÉ sur Mac et Pi pour les scénarios exécutés

Les erreurs structurées conservent leurs statuts et codes, avec contrôle du type et de la plage HTTP. Les erreurs de requête utilisent désormais `EngineError`. Le même itérateur sert au premier morceau et à toute la suite du flux.

La réservation est synchrone avant extraction et couvre aussi `/api/fetch-info`. L'annulation interrompt lectures et backpressure ; le créneau reste réservé jusqu'à la fermeture des processus. Les groupes POSIX isolés permettent de tuer uniquement les descendants du travail VidFetch. Le nettoyage est idempotent ; les timers et listeners de lecture/drain sont retirés. Les erreurs après démarrage HTTP détruisent le flux au lieu de tenter une deuxième réponse JSON.

`completed` exige tous les codes de sortie zéro et la fin de la réponse HTTP. Les tickets sont consommés atomiquement ; leur timer est annulé lors de la consommation. Les tokens inconnus ou réutilisés ne modifient plus les statuts.

Limites : corps 8 KiB/10 s, métadonnées 2 MiB/75 s sans cache dans ce backend, premier morceau 90 s, opération totale 10 min, inactivité streaming 30 s, sortie 256 MiB, durée déclarée 30 min, directs refusés. Tickets 60 s ; statuts 30 min. À 256 statuts conservés, une nouvelle préparation reçoit 429 pour préserver leur rétention complète.

Lors de cette reprise, seul le délai de la sonde de disponibilité a changé dans le backend : **30 s sur Linux ARM64**, toujours 8 s ailleurs. Il s'agit de la détection initiale des exécutables, avant l'écoute HTTP ; les limites de téléchargement restent inchangées. Ce correctif a été recompilé vers un nouveau bundle, puis validé sur le Pi. Diagnostic : [probe-diagnostic.json](artifacts/pi-validation-20261011/probe-diagnostic.json).

## 3. Fichiers créés ou modifiés

Modifiés : `src/lib/engine.ts`, `src/lib/extract.ts`.

Créés : `src/lib/engine-process.ts`, `backend/server.ts`, `backend/main.ts`, `backend/async.ts`, `backend/network.ts`, `backend/ffmpeg-static-shim.cjs`, `backend/tsconfig.json`, `backend/build.mjs`, `backend/verify-build.mjs`, `backend/pi-inspect.sh`, `backend/pi-test.mjs`, `backend/README.md`, `backend/REPORT.md`, `backend/.gitignore`, et les tests sous `backend/tests/`.

Les sources `media.ts` et `platforms.ts` ont été examinées sans modification. La source maintenue du serveur est maintenant `backend/server.ts` ; `~/vidfetch-backend-build/server.ts` reste conservé comme original et ne doit pas servir à reconstruire ce backend corrigé.

Pendant la reprise Pi : modification ciblée de `src/lib/engine.ts`, ajout de l'arrêt du backend détenu par `backend/pi-test.mjs` en cas de signal, création de `backend/pi-observe.mjs`, `backend/pi-http-extra.mjs` et `backend/verify-pi-results.mjs`. Ces scripts mesurent les ressources, exercent les erreurs HTTP et vérifient les preuves enregistrées. `backend/README.md` et ce rapport sont actualisés. Le nouveau bundle et les preuves sont sous `backend/artifacts/`.

## 4. Sauvegardes conservées — VALIDÉ

Les fichiers externes d'origine, l'ancien bundle et `server.ts.bak-before-iterator-fix` restent en place. Copies supplémentaires avant toute modification :

- `backend/backups/pre-hardening/server.ts.bak`
- `backend/backups/pre-hardening/server.ts.bak-before-iterator-fix`
- `backend/backups/pre-hardening/vidfetch-backend.cjs`
- `backend/backups/pre-hardening/engine.ts.bak`
- `backend/backups/pre-hardening/extract.ts.bak`

Les empreintes SHA-256 de la copie du serveur et de l'ancien bundle ont été comparées à leurs originaux : identiques. Aucun fichier original ni sauvegarde n'a été supprimé. Les sauvegardes `.ts.bak` sont exclues naturellement des recherches TypeScript.

Sauvegardes supplémentaires avant les modifications de cette reprise : `backend/backups/pre-pi-probe-fix/engine.ts.bak`, `pi-test.mjs.bak`, `pi-observe.mjs.bak`, `README.md.bak`, et [REPORT-before-pi.md](artifacts/pi-validation-20261011/REPORT-before-pi.md). Le bundle de livraison Mac et le premier répertoire d'essai Pi sont conservés intégralement, sans écrasement.

## 5. Compilation — VALIDÉ

esbuild **0.25.12**, `platform: node`, `target: node22`, `format: cjs`, `bundle: true`, alias du shim existant `ffmpeg-static` vers `module.exports = null`.

Bundle de livraison Mac conservé : `backend/artifacts/vidfetch-backend-delivery-20261011.cjs`, **52 550 octets**.

SHA-256 : `9aaad27077efa60ced7155c066119437f4d9c4d20786668f3ac8195b9c8a8df7`.

Bundle corrigé et effectivement exécuté sur Pi : [vidfetch-backend-pi-20261011.cjs](artifacts/vidfetch-backend-pi-20261011.cjs), **52 635 octets**. SHA-256 : `d370ccfb8574a2f714e86fcde6e555ddd665a846be761ffe29256a648d4a168c`. L'empreinte du fichier transféré est identique.

Le manifeste esbuild ne référence que les sources du backend et les modules intégrés `node:*` comme imports externes. Le bundle exécuté ne contient ni `/Users/`, ni `/opt/homebrew/`, ni module natif Darwin. Il ne nécessite pas `node_modules` sur le Pi. Le téléchargement réel a été lancé depuis un répertoire dédié contenant le bundle et les scripts de test, sans dépendances du projet Next.js. L'exécution Linux ARM64 est **VALIDÉE**.

Preuves : `backend/artifacts/vidfetch-backend-delivery-20261011.cjs.verification.json`, [vérification du bundle Pi](artifacts/vidfetch-backend-pi-20261011.cjs.verification.json), [exécution Pi](artifacts/pi-validation-20261011/run-corrected.log).

## 6. TypeScript — VALIDÉ

`node node_modules/typescript/bin/tsc -p backend/tsconfig.json` : sortie zéro. Cette configuration inclut explicitement le serveur maintenu, son point d'entrée, ses helpers et les bibliothèques importées.

`npm run typecheck` : sortie zéro ; il couvre également les tests TypeScript du dépôt. Le fichier externe original n'a pas été présenté comme vérifié par la commande du projet.

Preuves : `backend/artifacts/backend-typecheck-confirmed.log`, `backend/artifacts/project-typecheck-confirmed.log`.

Après le correctif de la sonde ARM64 : `node node_modules/typescript/bin/tsc -p backend/tsconfig.json`, **sortie zéro**, sans diagnostic. Preuve : `backend/artifacts/pi-validation-20261011/typecheck-pi-fix.log`. Le typecheck du projet complet et les tests Mac précédemment validés n'ont pas été répétés, la modification étant limitée à cette sonde.

## 7. node --check — VALIDÉ

Le bundle de livraison et les scripts JavaScript/MJS de test ont passé la vérification syntaxique. `sh -n backend/pi-inspect.sh` passe également. Le nouveau bundle a passé `node --check` sur Mac et sur Pi. Les scripts Pi ont passé la vérification syntaxique et ont ensuite été exécutés sur le Pi ; le vérificateur des preuves a été exécuté sur le Mac.

## 8. Tests HTTP et cycle de vie — VALIDÉ sur Mac et Pi

**17 tests ciblés passent, zéro échec final**, en environ 2,9 s. Preuve : `backend/artifacts/mac-tests-confirmed.log`.

Couverture : santé disponible/indisponible, méthodes 405, JSON invalide, objet requis, URL privée/invalide, corps trop volumineux avec Content-Length ou transfert chunked, corps lent 504, format/type invalide, erreurs structurées 400/413/504, Host/Origin, tokens inconnus, réservation concurrente 429, statut et octets, ticket unique, expiration, expiration annulée pendant streaming, processus vide/absent/en échec tardif, limite de sortie, inactivité et durée totale, déconnexion pendant lecture et backpressure, arrêt du descendant, annulation et limite des métadonnées.

Les expirations sont testées avec des durées injectées dans la factory de tests ; l'attente réelle de 60 s et la rétention réelle de 30 min ne sont pas chronométrées sur le Mac. Le quota complet de 256 statuts est vérifié par inspection du code, pas par saturation HTTP.

Des essais initiaux ont rencontré **ÉCHEC** à cause du bac à sable (ports/semaphores), des sauvegardes `.ts` incluses dans le typecheck et d'une attente de test supposant le nettoyage instantané. Les permissions nécessaires aux tests ont été accordées, les sauvegardes conservées sous `.bak`, et le test attend désormais la libération effective. Le code conserve le verrou pendant le nettoyage, conformément à la limite d'une opération.

Tests effectivement exécutés sur le Pi avec le nouveau bundle :

| Cas | Résultat observé |
| --- | --- |
| Santé avec les deux moteurs | HTTP 200, `ok: true` |
| JSON invalide / type invalide / URL privée | HTTP 400 |
| Corps JSON trop volumineux | HTTP 413 |
| Corps incomplet et lent | HTTP 504, code `TIMEOUT`, après 10 053 ms |
| Méthodes incorrectes sur les trois routes | HTTP 405, `METHOD_NOT_ALLOWED` |
| Statut ou ticket inconnu | HTTP 404, `EXPIRED` |
| Origine interdite / Host incorrect | HTTP 403 / 400 |
| Extraction et préparation du média public | Succès ; préparation HTTP 201 |
| Ticket unique | Première consommation HTTP 200 ; réutilisation HTTP 404 |
| Concurrence pendant la réservation d'un ticket | HTTP 429 |
| Expiration réelle d'un ticket | Attente de 60 500 ms ; expiration validée |
| Déconnexion pendant le flux | Statut `aborted`, libération effective des ressources |
| Arrêt final | Node sortie 0 ; aucun descendant détenu restant ; 8788 libre |

Les deux scripts HTTP/cycle de vie et l'observateur sont sortis avec code zéro. Preuves : [pi-results.json](artifacts/pi-validation-20261011/corrected/pi-results.json), [pi-http-extra.json](artifacts/pi-validation-20261011/corrected/pi-http-extra.json), [pi-resources.json](artifacts/pi-validation-20261011/corrected/pi-resources.json), [vérification automatisée des preuves](artifacts/pi-validation-20261011/verification.json). La rétention réelle de 30 minutes et la saturation de 256 statuts restent **NON TESTÉES** sur Pi.

## 9. Streaming réel — VALIDÉ sur Mac et Pi

Le **bundle de livraison exact** a extrait, préparé et téléchargé Big Buck Bunny depuis YouTube, sans cookie ni contournement. Ce film est publié sous licence Creative Commons Attribution par la Blender Foundation : [licence du projet](https://peach.blender.org/about/).

Résultats : health HTTP 200, préparation HTTP 201, flux HTTP 200, **12 257 966 octets** reçus, compteur identique, statut `completed`, ticket réutilisé HTTP 404, ffprobe sortie zéro. Fichier : vidéo VP9 et audio AAC, durée 634,62458 s. SHA-256 reçu : `e7f2d3931149c156643518972b2b034c53c2fa8c1d59711ba45bc03c072c1494`. Les plusieurs essais ont produit la même empreinte.

Preuve : `backend/artifacts/live-mac-delivery/results.json`. Le fichier reçu et les logs sont conservés dans le même répertoire.

Les vrais yt-dlp et ffmpeg ont également transmis un média original de 2 s généré localement : vidéo progressive **37 449 octets** avec empreinte identique à la source, MP3 **49 672 octets**, fusion vidéo/audio **37 577 octets**. ffprobe et statuts `completed` validés pour les trois cas. Ces essais utilisent uniquement une factory de tests injectant des métadonnées locales ; le backend normal n'accepte pas ces URL locales. Preuves : `backend/artifacts/real-engines-release.log`, `backend/artifacts/real-engines-results.json`.

Sur Pi, le bundle corrigé a réellement extrait et préparé le même film public Big Buck Bunny (`aqz-KE-bpKQ`), format `602`, 144p, puis transmis un fichier avec vidéo VP9 et audio AAC en utilisant yt-dlp et ffmpeg. Résultats : flux HTTP 200, **12 257 965 octets reçus**, taille ffprobe et compteur du statut identiques ; statut `completed`, `error: null`, durée **634,624580 s**, ffprobe sortie zéro. SHA-256 : `f02bcb3a77f989c1ec1f5471569943e01cd9631f374fcc11c6cd17bdc5e5866b`. Le fichier Pi n'a pas la même empreinte que le fichier Mac ; aucune identité binaire entre plateformes n'est affirmée.

L'intégrité a aussi été vérifiée par **décodage intégral des deux pistes**, avec `-xerror -err_detect explode -threads 1 -map 0 -fps_mode:v passthrough -enc_time_base:v demux -f null -` : sortie **0**, aucune erreur, preuve [full-decode-strict.log](artifacts/pi-validation-20261011/full-decode-strict.log). Un premier essai de décodage, avec la base de temps de sortie par défaut, avait produit des messages DTS non monotones dans le muxer de diagnostic ; la vérification stricte conserve les horodatages du démuxeur selon la [documentation FFmpeg](https://www.ffmpeg.org/ffmpeg.html). Le média et le backend n'ont pas été modifiés pour ce contrôle.

Le fichier reçu reste conservé sur Pi dans le répertoire du test réussi : `public-test.mp4`. Lors de cette première validation, MP3 et progressif sans fusion sur Pi étaient **NON TESTÉS** ; le MP3 a depuis été validé pendant la reprise, voir section 16. La validation Mac est conservée.

## 10. Sécurité — VALIDÉ partiellement ; limites explicites

Tests et audit valident la liste exacte des plateformes, les chemins individuels, le refus des URL privées en entrée, la suppression de paramètres non nécessaires, le refus des identifiants/ports non standard, les contrôles DNS préalables et des destinations sélectionnées, l'absence de shell dans les moteurs, la validation des formats, les noms de fichiers ASCII sûrs, les en-têtes, les plafonds de taille/durée/concurrence et l'écoute forcée loopback. Aucun secret n'a été affiché ni ajouté au bundle. Les logs du backend ne contiennent pas les erreurs upstream brutes.

**NON TESTÉ / NON GARANTI** : une isolation complète des sorties réseau de yt-dlp/ffmpeg. Les redirections, sous-requêtes, résolutions DNS ultérieures et manifests traités dans les moteurs peuvent dépasser les vérifications Node. Cette limite est documentée, conformément au besoin de défenses applicatives et réseau contre SSRF décrit par [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html). Aucun changement réseau n'était autorisé pour mettre en place une isolation système.

CORS n'est pas considéré comme une authentification. Le backend reste local ; aucune exposition publique n'est configurée. Les cookies/proxy optionnels hérités du moteur ne sont pas utilisés ou testés ici.

Sur Pi, `ss` a confirmé **127.0.0.1:8788** pendant l'exécution. Les erreurs URL privée, Host et Origin ont été exercées. La réservation concurrente et le délai de réception de requête ont été vérifiés. Les plafonds physiques de 256 MiB et 10 min n'ont pas été saturés sur Pi. Les trois fichiers surveillés de l'installation précédente et de MagicMirror ont des empreintes identiques entre le contrôle pendant les tests et le contrôle final ; aucun contenu de configuration ni secret n'a été affiché. Preuves : `protected-files-during.log` et `final-inspection.log` sous `artifacts/pi-validation-20261011/`.

## 11. Déploiement Raspberry Pi — VALIDÉ, temporaire et arrêté

Le blocage SSH de la première phase est **résolu** : connexion non interactive à `user@192.168.1.112` avec `BatchMode=yes`, `ConnectTimeout=8`, `StrictHostKeyChecking=yes`. Aucun mot de passe ni clé privée n'a été affiché.

Audit réel : **Raspberry Pi 3 Model B Plus Rev 1.3**, **Debian 13.7 / aarch64**, Linux `6.18.50+rpt-rpi-v8`, **Node 22.22.2**, **yt-dlp 2026.08.19** (`/usr/local/bin/yt-dlp`), **ffmpeg 7.1.5-0+deb13u1+rpt2** (`/usr/bin/ffmpeg`), ffprobe disponible. Quatre CPU. RAM totale 905 MiB ; disponible initialement 604 MiB. Espace disque disponible 20 GiB. Le port 8788 était libre avant chaque démarrage. Preuves : [inspection.log](artifacts/pi-validation-20261011/inspection.log), [final-inspection.log](artifacts/pi-validation-20261011/final-inspection.log).

Deux répertoires neufs créés avec `mktemp` et `umask 077`, tous conservés :

- `/home/user/vidfetch-backend-validation-20261011-7JAIx8Uh` : bundle Mac conservé, **ÉCHEC** de santé dû à la sonde 8 s ; arrêt propre après diagnostic.
- `/home/user/vidfetch-backend-validation-20261011-HvXFBSRJ` : bundle corrigé, **VALIDÉ** sur tous les scénarios Pi décrits ; résultats et fichier test conservés.

L'installation préexistante `/home/user/vidfetch-backend/server.js` (731 octets) n'a pas été écrasée. Le backend de test a été démarré avec `nice -n 10`, `--max-old-space-size=128`, les chemins système des moteurs et exclusivement `127.0.0.1:8788`. Les moteurs héritent de cette priorité. Aucun `node_modules` n'a été transféré. Tests principaux du **11 octobre 2026, 19:59:20 à 20:03:20 UTC**. Aucun service permanent n'a été créé.

## 12. Santé du backend

**VALIDÉ sur Mac** : `ok: true`, yt-dlp **2026.08.19**, ffmpeg présent, Node **22.13.1**, santé HTTP 200. Les processus Node de test se sont terminés avec code zéro ; le port Mac 18788 était libre au contrôle après tests.

**VALIDÉ sur Pi pendant les tests** : santé HTTP 200, `ok: true`, yt-dlp **2026.08.19**, ffmpeg présent, Node **22.22.2**, écoute loopback confirmée. Backend sortie zéro après les tests, aucun descendant restant et port 8788 libre au contrôle final. Le backend est donc **arrêté à la fin de la mission**, comme demandé.

**NON TESTÉ — fonctionnement simultané de MagicMirror et 8787** : avant les tests, aucun processus MagicMirror/Node/Electron identifié, aucune écoute sur 8080 ou 8787 ; les unités `magicmirror.service` système et utilisateur sont absentes/inactives. Même état après les tests. À l’issue de ces premiers essais, les dossiers MagicMirror existaient, mais aucun fonctionnement actif n’avait pu être vérifié. Leur retrait ultérieurement autorisé est documenté en section 17. Ces services n'ont reçu aucune commande de démarrage, de modification ou d'arrêt. Preuves : [services-initial.log](artifacts/pi-validation-20261011/services-initial.log), snapshots avant/après dans [pi-resources.json](artifacts/pi-validation-20261011/corrected/pi-resources.json).

## 13. Mémoire mesurée

Sur le Mac, pendant le dernier téléchargement réel : Node **49 248 KiB (48,1 MiB)** au repos, maximum observé **60 864 KiB (59,4 MiB)**. Maximum observé de la somme des RSS de Node et de ses descendants yt-dlp/ffmpeg : **161 328 KiB (157,5 MiB)**.

Échantillonnage toutes les 500 ms ; la somme RSS peut compter plusieurs fois des pages partagées et n'est pas une mesure de RAM physique exclusive ni une garantie du pic entre échantillons. Les fichiers vidéo sont transmis progressivement, sans chargement complet en mémoire dans le backend.

Sur Pi, **240 échantillons espacés d'environ 1 s** couvrent le scénario complet, préparation, transfert, expiration et annulation :

| Mesure | Maximum ou minimum observé |
| --- | --- |
| RSS Node VidFetch | **60 980 KiB / 59,6 MiB** |
| Somme RSS Node + descendants yt-dlp/ffmpeg | **200 324 KiB / 195,6 MiB** |
| CPU Node + descendants | **126 % d'un cœur**, soit environ 1,26 cœur sur les 4 disponibles |
| RAM système disponible minimale | **453 816 KiB / 443,2 MiB** |
| RAM disponible au contrôle final, scripts de test arrêtés | **619 MiB** |
| Swap utilisée initialement et au contrôle final | **133 MiB**, inchangée |

Les pics RSS et CPU sont échantillonnés, pas des plafonds garantis. Le CPU utilise les différences de compteurs `/proc` entre échantillons (100 ticks/s). La somme RSS peut compter des pages partagées ; les scripts de test et d'observation sont exclus de la famille VidFetch, mais consomment aussi des ressources système. Preuves : [pi-resources.json](artifacts/pi-validation-20261011/corrected/pi-resources.json), [verification.json](artifacts/pi-validation-20261011/verification.json), [final-inspection.log](artifacts/pi-validation-20261011/final-inspection.log).

**NON TESTÉ** : capacité sous charge MagicMirror/8787 actifs et consommation des autres plateformes. Les mesures concernent le test public 144p effectué, pas toutes les résolutions.

## 14. Problèmes restant à résoudre

- **VALIDÉ** : retrait définitif des deux dossiers MagicMirror et de leur démarrage automatique après confirmation, audit root et revalidation des sauvegardes ; voir section 17. MagicMirror était déjà inactif : aucun gain de RAM de processus attribuable à son retrait.
- **VALIDÉ pour le service local sans limite mémoire cgroup** : contrôleur `memory` absent ; l’utilisateur a autorisé explicitement le retrait de `MemoryMax` et des autres limites mémoire cgroup. Heap Node, limites applicatives, CPU et tâches conservés et testés. La RAM totale des moteurs n’a pas de plafond cgroup ; restaurer ce contrôleur demanderait une autorisation séparée, mais ne bloque plus cette mission.
- **ÉCHEC initial corrigé** : détection yt-dlp trop courte sur ARM64 ; aucun échec final des tests Pi exécutés après correction.
- **NON TESTÉ sur Pi** : vidéo progressive sans fusion, autres résolutions, téléchargements réels TikTok/Instagram/X, contenu privé, cookies/proxy, saturation de 256 statuts, saturation réelle des limites 256 MiB/10 min, démarrage systemd après un vrai reboot, serveur 8787 actif. Le contrôle réel des 30 min est désormais **VALIDÉ**, pour vidéo et MP3.
- **BLOQUÉ avant exposition publique** : autorisation/quotas des tickets, isolation des sorties secondaires des moteurs et budget de préparation à rendre compatible avec le délai edge. Ce sont des prérequis documentés, pas des protections déployées.
- **Limites conservées** : état uniquement en mémoire, durée/taille volontairement limitées, débit externe ffmpeg non plafonné par la seule option yt-dlp, filtrage SSRF préalable incomplet pour les sorties secondaires des moteurs.

## 15. Prochaines étapes frontend Vercel

1. Le retrait MagicMirror est terminé et documenté en section 17. Préserver le serveur 8787 ; son fonctionnement actif ne peut pas être affirmé lorsqu’il est arrêté.
2. Le service local sans contrôleur mémoire est désormais installé, testé et activé selon l’accord explicite ; conserver la configuration documentée en section 18. Un vrai test après reboot demande toujours l’accord de l’utilisateur. Aucun changement de boot/noyau nécessaire à ce déploiement.
3. Valider le réseau privé authentifié recommandé pour l'usage personnel, avec passerelle applicative et téléchargement navigateur direct. Tunnel public + Access est comparé, mais ses restrictions de transfert média nécessitent une offre adaptée. Un frontend distant ne peut pas joindre le `127.0.0.1` du Pi.
4. Implémenter et tester les protections proposées, puis adapter `src/lib/api.ts`, `FetchForm.tsx` et `VideoCard.tsx` aux sessions, à l'origine directe et aux tickets liés au propriétaire. Les fichiers vidéo ne traverseront pas Vercel. Aucun changement Vercel/Supabase n'a été réalisé.

Toute installation système, utilisation de sudo, service permanent, modification réseau/production ou push requiert l'accord de l'utilisateur.

## 16. Reprise : nettoyage Raspberry Pi et préparation production

### MagicMirror — état historique avant confirmation du retrait

Cette sous-section décrit la mission précédente, avant l’autorisation explicite. L’exécution et l’état actuel sont détaillés en section 17.

Installation identifiée : `/home/user/MagicMirror`, **2.38.0**, **654 564 KiB / 639,2 MiB**, dont dépendances npm/Electron locales **621 852 KiB** ; données `/home/user/.config/magicmirror`, 4 KiB. Aucun processus MagicMirror actif, unité systemd associée, PM2 utilisateur ou lien entrant trouvé dans les emplacements lisibles inspectés. Seul mécanisme identifié : **ligne 7 de `/home/user/.config/labwc/autostart`**, avec commentaire ligne 6. Aucun autre service lisible dépendant de cette installation n'a été trouvé. L'inspection de cron et PM2 root nécessite sudo et reste en attente d'accord ; l'absence de dépendance dans ces fichiers n'est pas encore prouvée.

Sauvegarde complète créée dans le nouveau répertoire privé `/home/user/vidfetch-maintenance-20261011-ALaZGoF9`, sans écrasement : `magicmirror-full.tar`. Application entière, modules, dépendances, configuration, données personnelles de l'application et autostart complet inclus. **21 648 fichiers** contrôlés individuellement par SHA-256 dans l'archive, **643 256 320 octets**, SHA-256 `1582132120467a95cc57af1246214c0088bf88ff4164b65d68f8cc364baa4b3f`. Copie Mac reçue avec empreinte identique et permissions 0600 ; sauvegardes exclues de Git. Aucun contenu de configuration ni secret affiché.

Preuves : [audit](artifacts/preproduction-20261011-UfO9y4/magicmirror-audit.json), [vérification Pi](artifacts/preproduction-20261011-UfO9y4/backup-verification.json), [vérification copie Mac](artifacts/preproduction-20261011-UfO9y4/backup-mac-verification.json). [Plan exact, désormais exécuté](preproduction/MAGICMIRROR-REMOVAL.md).

**Désinstallation : NON EFFECTUÉE / BLOQUÉE EN ATTENTE DE CONFIRMATION**, dossiers et autostart inchangés au contrôle final. La confirmation demandée pour les deux chemins et l'audit sudo n'a pas été reçue pendant cette exécution. Ressources libérées par suppression : **0**. MagicMirror étant déjà arrêté, aucune RAM de processus n'est récupérée. La sauvegarde Pi est conservée : même après suppression des 639,2 MiB installés, le gain net depuis le début de la mission sera réduit par les 613,5 MiB environ de sauvegarde. Aucune suppression de package système ou npm global n'est proposée.

Espace disponible mesuré : **20 754 104 KiB** à l'audit, **20 093 468 KiB** au contrôle final, soit une baisse observée d'environ **645,2 MiB** pendant la mission, avec la sauvegarde complète et les deux médias de test conservés. RAM disponible initiale 589 MiB, finale 611 MiB ; cette variation ne constitue pas un gain de désinstallation, puisque rien n'a été retiré. Preuve : [final-inspection.log](artifacts/preproduction-20261011-UfO9y4/final-inspection.log).

### Tests supplémentaires — vidéo, MP3, rétention et nettoyage VALIDÉS

Répertoire neuf `/home/user/vidfetch-backend-validation-preproduction-20261011-KUuEA2Kw`. Seul bundle exécuté : `vidfetch-backend-pi-20261011.cjs`, empreinte transférée identique `d370ccfb8574a2f714e86fcde6e555ddd665a846be761ffe29256a648d4a168c`. Aucun correctif au backend, aucune recompilation pendant cette reprise.

Même film public autorisé Big Buck Bunny ; vidéo format 602/144p. Santé HTTP 200 ; yt-dlp/ffmpeg présents ; écoute **127.0.0.1:8788**. Concurrence 429. Tickets vidéo et MP3 à usage unique, réutilisation 404.

| Flux réel | Résultat reçu | Intégrité |
| --- | --- | --- |
| Vidéo MP4 VP9 + AAC | **12 257 965 octets**, compteur identique, `completed`, `error: null` | SHA-256 `f02bcb3a77f989c1ec1f5471569943e01cd9631f374fcc11c6cd17bdc5e5866b` ; ffprobe et décodage complet sortie 0, aucun stderr |
| MP3 192 kbit/s | **15 230 636 octets**, compteur identique, `completed`, `error: null`, `audio/mpeg` | SHA-256 `f6ea994b0bbcecf1c67d00867722fd4955f37d69ce37244e4061015877564fae` ; piste MP3 seule, durée 634,608 s ; ffprobe et décodage complet sortie 0, aucun stderr |

Preuve : [pi-media-results.json](artifacts/preproduction-20261011-UfO9y4/pi-media-results.json). Contrôles HTTP supplémentaires réussis : méthodes 405, tokens inconnus 404, Host/Origin 400/403, corps lent 504/TIMEOUT après 10 055 ms, voir `pi-run.log`.

Le test de rétention utilise le **délai de production exact**, sans changement d'horloge ou de TTL. Les consultations ne prolongent pas la rétention :

| Statut | Avant 30 min | Après 30 min |
| --- | --- | --- |
| Vidéo | HTTP 200 `completed` à **1 790 017 ms** | HTTP 404 `EXPIRED` à **1 801 519 ms** |
| MP3 | HTTP 200 `completed` à **1 790 041 ms** | HTTP 404 `EXPIRED` à **1 801 521 ms** |

Test du **11 octobre 2026, 20:28 à 21:03 UTC**, environ 35 min. Backend et runner sortis **0**, contrôles HTTP complémentaires sortis **0**, aucun descendant VidFetch restant et aucune écoute sur 8788 après arrêt. Les tests de l'expiration ticket 60 s et de déconnexion du premier essai restent valides ; ils n'ont pas été inutilement rejoués ici. Le serveur 8787 était inactif avant/après, son empreinte est inchangée et il n'a reçu aucune commande de démarrage/arrêt/modification. Le bon fonctionnement de ce serveur actif reste **NON TESTÉ**.

**2 122 échantillons**, environ un par seconde pendant le scénario complet :

| Mesure | Observation |
| --- | --- |
| RSS maximale Node VidFetch | **75 196 KiB / 73,4 MiB** |
| Somme RSS maximale Node + moteurs | **200 116 KiB / 195,4 MiB** |
| CPU maximal de cette famille | **183,8 % d'un cœur**, environ 1,84 cœur sur quatre |
| RAM système disponible minimale | **413 348 KiB / 403,7 MiB** |
| RAM disponible finale, tous scripts arrêtés | **611 MiB** |
| Swap initiale/finale | **133 MiB**, inchangée |

Les scripts d'observation/test et les décodages diagnostiques sont hors de la famille backend, mais consomment des ressources système. La sauvegarde était encore en vérification au début du scénario vidéo ; son coût n'est pas inclus dans les RSS/CPU de la famille. Leurs maxima sont échantillonnés et la somme RSS peut compter des pages partagées. Aucun crash ni échec des scénarios VidFetch exécutés pendant cette reprise. Ces mesures ne valident pas toutes les résolutions ou une charge multi-utilisateur.

Preuves finales : [pi-results.json](artifacts/preproduction-20261011-UfO9y4/pi-results.json), [pi-resources.json](artifacts/preproduction-20261011-UfO9y4/pi-resources.json), [pi-http-extra.json](artifacts/preproduction-20261011-UfO9y4/pi-http-extra.json), [vérification automatisée](artifacts/preproduction-20261011-UfO9y4/verification.json) — **18 contrôles de preuves réussis**, sans présenter le retrait ou la production comme réalisés.

### Service permanent — état historique avant la mission d’activation

Le blocage ci-dessous décrit la préparation initiale exigeant un contrôleur mémoire. L’utilisateur a depuis autorisé le service sans `MemoryMax` ; l’installation et les tests effectifs sont décrits en section 18.

[vidfetch.service](preproduction/vidfetch.service) et [procédure systemd](preproduction/SYSTEMD.md) préparés : compte dynamique non privilégié `vidfetch`, loopback 8788, heap Node 128 MiB, MemoryHigh 256 MiB / MemoryMax 384 MiB, swap 64 MiB, TasksMax 128, CPUQuota 150 %, nice 10, journald, redémarrage après échec limité à trois démarrages par cinq minutes, arrêt complet du cgroup. `[Install]` prépare le boot automatique sans l'activer.

**VALIDÉ** : parseur systemd 257 du Pi, sortie 0 sans diagnostic sur la version corrigée, vérification syntaxique du preflight. **BLOQUÉ** : contrôleur mémoire absent (`cpuset cpu io pids`), confirmé par lecture cgroup et `/proc/cgroups`. Le noyau supporte `CONFIG_MEMCG=y`, mais `/proc/cmdline` contient `cgroup_disable=memory` ; il faut identifier la source effective de cette option avant correction autorisée. Le preflight sort volontairement 1 et refuse le démarrage sans limite mémoire effective. **NON TESTÉ** : exécution sous ces protections, quotas cgroup réels, restart et boot automatique. Preuves : [systemd-reviewed.log](artifacts/preproduction-20261011-UfO9y4/systemd-reviewed.log), [diagnostic mémoire](artifacts/preproduction-20261011-UfO9y4/memory-controller.json). Aucun fichier dans `/etc/systemd/system` créé ; pas de daemon-reload, enable ou start.

### Architecture Vercel — étude préparée, NON DÉPLOYÉE

[Comparaison et architecture détaillées](preproduction/ACCESS-ARCHITECTURE.md), avec [exemple Tunnel public non déployable](preproduction/cloudflared.example.yml). Recommandation initiale pour l'usage personnel : réseau privé authentifié (Tailscale Serve sans Funnel, ou Cloudflare Private Network/WARP) + passerelle applicative sur 127.0.0.1:8789 ; flux directement navigateur ↔ réseau privé ↔ Pi. Vercel ne relaie aucun média. Supabase reste inchangé.

Tunnel public + Access + authentification applicative est également détaillé, **sous réserve d'une offre adaptée aux médias** : Cloudflare indique que la diffusion de vidéos/gros fichiers via les routes publiques des plans Free/Pro/Business exige un service payé approprié ; la restriction ne s'applique pas aux routes privées. Aucun contournement via désactivation du cache n'est proposé. [Politique Cloudflare](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/delivering-videos-with-cloudflare/).

La passerelle doit vérifier l'accès réseau privé (ou JWT Access dans la variante publique) et l'identité Supabase, lier tickets/statuts à leur propriétaire, limiter les sessions/quotas et gérer CORS/CSRF, streaming et déconnexion. Les adaptations précises du frontend existant sont listées dans le document. **NON IMPLÉMENTÉ / NON TESTÉ** : cette passerelle et les protections réseau de sortie.

L'inspection de `src/` et `package.json` ne trouve pas d'intégration Supabase Auth identifiable. L'utilisation d'une identité Supabase est une cible à confirmer avec les services réellement existants, pas une session frontend déjà validée. Aucun réglage Supabase ni fichier de secrets consulté.

Points bloquant la publication : les sous-requêtes/redirections des moteurs restent hors du contrôle Node complet ; isolation de sortie à préparer et tester. Le budget maximal de préparation cumulé 75 + 90 s peut dépasser le timeout edge actuellement documenté de 125 s : adapter le budget ou un protocole de job avant publication. Voir les documentations primaires citées dans l'étude. Aucun tunnel, installation cloudflared, domaine/DNS, secret ou modification Vercel/Supabase effectué.

### Actions restant à autoriser après cette préparation

1. **Depuis exécuté après confirmation** : audit root sudo en lecture seule et suppression exacte des deux dossiers MagicMirror après revalidation des sauvegardes et absence de dépendance supplémentaire ; voir section 17.
2. Toute restauration future du contrôleur mémoire ou modification boot/noyau/reboot reste à autoriser séparément ; le service sans ce contrôleur est maintenant accepté et fonctionnel.
3. **Depuis exécuté après autorisation** : installation, tests et activation du seul service VidFetch, voir section 18.
4. Choix et déploiement ultérieur de l'accès sécurisé, isolation réseau et changements frontend. Aucune publication ni push Git autorisé actuellement.

Fichiers de cette reprise : `backend/preproduction/magicmirror-audit.py`, `magicmirror-backup.py`, `magicmirror-root-audit.py`, `magicmirror-remove.py`, `MAGICMIRROR-REMOVAL.md`, `pi-final-test.mjs`, `verify-results.mjs`, `vidfetch.service`, `service-preflight.cjs`, `SYSTEMD.md`, `ACCESS-ARCHITECTURE.md`, `cloudflared.example.yml` ; rapport et README actualisés. Sauvegardes des deux documents avant modification : `artifacts/preproduction-20261011-UfO9y4/REPORT-before.md` et `README-before.md`. Les sources moteur, le frontend et le bundle corrigé sont inchangés pendant cette reprise. Pendant cette préparation précédant la confirmation : aucun sudo exécuté, aucune suppression définitive, aucune activation de service ou modification réseau/production. Le retrait autorisé ultérieur est documenté en section 17.

## 17. Désinstallation définitive MagicMirror après confirmation

**VALIDÉ — désinstallation complète de l’application et de son démarrage identifié**, le 11 octobre 2026. Autorisation explicite reçue pour les deux dossiers, leurs mécanismes de démarrage et le seul sudo nécessaire à l’audit. Le [plan](preproduction/MAGICMIRROR-REMOVAL.md) a été relu avant toute action. Les tests VidFetch déjà validés n’ont pas été recommencés et aucun backend n’a été démarré pendant ce retrait.

### Vérifications avant suppression — VALIDÉ

Les deux archives complètes sont toujours présentes, privées et intègres :

- Pi : `/home/user/vidfetch-maintenance-20261011-ALaZGoF9/magicmirror-full.tar`.
- Mac : `backend/artifacts/preproduction-20261011-UfO9y4/magicmirror-full.tar`.

Chacune fait **643 256 320 octets**, mode **0600**, SHA-256 `1582132120467a95cc57af1246214c0088bf88ff4164b65d68f8cc364baa4b3f`. Empreintes recomputées avant le retrait, puis après. Les **21 648 fichiers sources** ont également été recomparés au manifeste avant suppression : aucune divergence, aucun fichier ajouté non sauvegardé. Configuration, modules, dépendances locales, données personnelles de l’application et autostart sont inclus. Aucun contenu de configuration ni secret affiché.

L’audit actualisé ne trouve aucun lien entrant, dépendance externe, processus actif, service systemd ou PM2 utilisateur lié à MagicMirror. Le seul lancement identifié est la ligne 7 de `/home/user/.config/labwc/autostart`. L’unique commande sudo exécutée, en lecture seule, est :

```sh
sudo -n /usr/bin/python3 /home/user/vidfetch-maintenance-20261011-ALaZGoF9/magicmirror-root-audit.py
```

Résultat : **aucune crontab root et aucun des deux dumps PM2 root**. Aucune suppression supplémentaire au plan n’a été nécessaire. Preuves : [audit actualisé](artifacts/magicmirror-removal-20261011-0068tz44/magicmirror-audit-current.json), [sources et archive Pi](artifacts/magicmirror-removal-20261011-0068tz44/pre-removal-verification.json), [archive Mac avant retrait](artifacts/magicmirror-removal-20261011-0068tz44/backup-mac-rechecked.json), [preuves récupérées du Pi et audit root](artifacts/magicmirror-removal-20261011-0068tz44/remote-evidence.json).

### Opérations réalisées — VALIDÉ

Le script préparé, dont l’empreinte a été contrôlée avant exécution, a tourné **sous `user`, sans sudo**, de **21:15:50 à 21:16:50 UTC**, avec priorité `nice 19` :

```sh
nice -n 19 /usr/bin/python3 /home/user/vidfetch-maintenance-20261011-ALaZGoF9/magicmirror-remove.py --confirmed-exact-paths
```

Sortie **0**, stderr vide. Il a supprimé exclusivement `/home/user/MagicMirror` et `/home/user/.config/magicmirror`, après contrôle des liens, montages, processus, archive et empreinte de l’autostart. Les dépendances npm/Electron locales contenues dans l’installation sont donc retirées. Aucun package apt/npm global, cache global ou dépendance partagée supprimé.

La seule commande de lancement ligne 7 de l’autostart a été remplacée par un commentaire. Toutes les autres lignes, le mode **0775** et le propriétaire/groupe **user:user** sont conservés. L’original reste dans `autostart-before-removal` et la version proposée dans `autostart-proposed`, sous le répertoire privé de maintenance Pi. Empreinte finale de l’autostart : `b195130ad9761e9b19ecc8bc4553bb7074512368601525ba44ffb8e96bf46aca`.

MagicMirror étant déjà arrêté, aucun processus ni service n’a nécessité d’arrêt. Aucun redémarrage de labwc, de la session graphique ou du Pi. Preuve : [commande et résultat](artifacts/magicmirror-removal-20261011-0068tz44/removal-invocation.json).

### Contrôles après suppression et ressources

| Contrôle | État et preuve observée |
| --- | --- |
| Dossiers et processus MagicMirror | **VALIDÉ** : deux dossiers absents, aucun processus associé ni commande de lancement restante |
| Autostart et autres services | **VALIDÉ** : seule la ligne 7 changée ; permissions préservées ; aucune unité ou entrée cron/PM2 supplémentaire trouvée |
| Outils partagés | **VALIDÉ** : empreintes Node, npm, yt-dlp, ffmpeg, ffprobe et client SSH inchangées ; Node **22.22.2**, npm **10.9.7**, yt-dlp **2026.08.19**, ffmpeg **7.1.5-0+deb13u1+rpt2** toujours exécutables |
| SSH | **VALIDÉ** : service `ssh` actif et nouvelles connexions non interactives après retrait |
| VidFetch | **VALIDÉ** : serveur préexistant et deux bundles Pi surveillés inchangés ; bundle Mac corrigé inchangé ; backend toujours arrêté |
| Ports 8787/8788/8080 | **VALIDÉ pour leur préservation** : aucune écoute avant ni après ; aucune commande de démarrage/arrêt/modification du serveur 8787 |
| Serveur 8787 actif | **NON TESTÉ** : inactif dès l’inspection ; ne pas présenter son fonctionnement HTTP comme validé |
| Démarrage après reboot | **NON TESTÉ** : aucune commande de reboot ; absence de lancement vérifiée dans le fichier effectif |
| Échecs de désinstallation ou de contrôle final | **ÉCHEC : aucun** ; **32 contrôles de preuves sur 32 réussis** |
| Blocages pour ce retrait | **BLOQUÉ : aucun** ; les prérequis du service permanent et de l’accès externe en section 14 restent à résoudre séparément |

Relevés immédiats du script :

| Mesure | Avant retrait | Après retrait |
| --- | --- | --- |
| Espace disque disponible `df -k` | **20 093 448 KiB** | **20 748 016 KiB** |
| Espace utilisé | **8 717 964 KiB** | **8 063 396 KiB** |
| RAM disponible `free -m` | **602 MiB** | **599 MiB** |
| Swap utilisée | **133 MiB** | **133 MiB** |

**Disque récupéré pendant la suppression : 654 568 KiB / 639,2 MiB**, correspondant aux deux dossiers. Les archives Pi et Mac restent conservées. Les écritures ultérieures de preuves expliquent le disponible final de **20 748 004 KiB**. Depuis le tout premier audit avant création de l’archive et des médias de test, le disponible reste inférieur de **6 100 KiB / 6,0 MiB** : ne pas confondre ce bilan global avec le volume réellement désinstallé.

Au dernier relevé, **21:19:57 UTC**, tous les scripts terminés : RAM totale **905 MiB**, disponible **619 MiB**, swap utilisée toujours **133 MiB**. Aucun Node, Electron, yt-dlp, ffmpeg ou script Python utilisateur restant. **Aucun gain de RAM de processus attribuable à MagicMirror**, déjà inactif avant retrait ; les variations mesurées dépendent des scripts et du cache système.

Preuves : [contrôle de préservation après retrait](artifacts/magicmirror-removal-20261011-0068tz44/preservation-after.json), [audit après retrait](artifacts/magicmirror-removal-20261011-0068tz44/magicmirror-audit-after.json), [archive Mac après retrait](artifacts/magicmirror-removal-20261011-0068tz44/backup-mac-after.json), [relevé final](artifacts/magicmirror-removal-20261011-0068tz44/final-inspection.log), [32 contrôles de preuves](artifacts/magicmirror-removal-20261011-0068tz44/verification.json).

Fichiers locaux ajoutés pour ces contrôles : `backend/preproduction/magicmirror-pre-removal.py`, `magicmirror-preservation.py` et le nouveau répertoire d’artefacts `backend/artifacts/magicmirror-removal-20261011-0068tz44/`. Rapport, README et plan actualisés ; copies supplémentaires de leurs versions précédentes conservées dans ce répertoire. Aucun fichier backend source ou bundle modifié, aucun service permanent, changement réseau, changement Vercel/Supabase ou push Git.

## 18. Service systemd VidFetch installé et activé

**VALIDÉ — service permanent actif et activé**, le 11 octobre 2026, selon l’autorisation explicite de l’utilisateur. Écoute exclusivement **127.0.0.1:8788**, santé **HTTP 200 / `ok: true`**, yt-dlp **2026.08.19** et ffmpeg disponibles. Le service reste en fonctionnement à la fin de cette mission. La procédure actuelle est dans [SYSTEMD.md](preproduction/SYSTEMD.md).

### Inspection, bundle et installation — VALIDÉ

Pi Debian ARM64, Node **22.22.2**, systemd **257.13**. Avant intervention : unité VidFetch absente, port 8788 libre, serveur 8787 inactif, SSH actif PID **867**. L’ancien `/home/user/vidfetch-backend/server.js` et les répertoires de validation sont conservés. Preuve : [avant installation](artifacts/systemd-activation-20261011-eu3x4mea/before-install.log).

Le bundle corrigé de **52 635 octets** conserve son SHA-256 `d370ccfb8574a2f714e86fcde6e555ddd665a846be761ffe29256a648d4a168c`, vérifié sur Mac, dans le staging Pi et dans la release installée. Aucune recompilation, modification de source backend, installation de paquet ou reprise des tests Mac. `node --check` sur bundle et preflight et `systemd-analyze verify` sur la configuration finale sont sortis **0** sur Pi.

Nouveaux chemins uniquement :

- Staging et tests : `/home/user/vidfetch-systemd-staging-20261011-xG0uZFm0`.
- Release root : `/opt/vidfetch/releases/20261011-eu3x4mea/`, contenant le bundle et le preflight ; fichiers 0644, répertoires 0755.
- Unité : `/etc/systemd/system/vidfetch.service`, root, 0644.
- Lien d’activation : `/etc/systemd/system/multi-user.target.wants/vidfetch.service`, pointant vers cette unité.

L’installateur refuse une unité, release, répertoire privé/runtime ou port déjà occupé ; aucun fichier existant écrasé. Sauvegardes locales supplémentaires avant modification : `REPORT.md.before`, `README.md.before`, `vidfetch.service.before`, `service-preflight.cjs.before`, `SYSTEMD.md.before` sous `backend/artifacts/systemd-activation-20261011-eu3x4mea/`. Les précédentes archives MagicMirror restent conservées.

Sudo a servi uniquement à l’installateur dédié VidFetch, son `daemon-reload`, et aux commandes `start`, `stop`, `kill --kill-whom=main --signal=SIGKILL`, `reset-failed`, `enable` ciblant **vidfetch.service**. Aucun autre service géré. Preuve d’installation et empreintes : [install.log](artifacts/systemd-activation-20261011-eu3x4mea/install.log), [bundle](artifacts/systemd-activation-20261011-eu3x4mea/bundle-verification.json).

### Contrôleurs et protections effectives

Cgroup v2 : contrôleurs racine **`cpuset cpu io pids`**, `system.slice` **`cpu pids`**. **`memory` absent**, `/proc/cmdline` contient `cgroup_disable=memory`. Le service utilise donc le mode expressément autorisé : **aucun `MemoryMax`, `MemoryHigh` ou `MemorySwapMax`**, `MemoryAccounting=no`. Les valeurs systemd `infinity` reflètent cette absence de limite. Aucun changement de boot/noyau ou des contrôleurs globaux, aucun reboot.

Le preflight vérifie Linux ARM64, le SHA-256 exact, HOST/PORT, port disponible, et CPU/tâches appliqués. Valeurs réellement lues dans le cgroup : **`cpu.max = 150000 100000`**, **`cpu.weight = 50`**, **`pids.max = 128`**. Nice **10**, heap Node **128 MiB**, 1 024 descripteurs et core dumps désactivés. Le heap ne plafonne pas la RAM totale Node/moteurs. Une seule opération coûteuse et les limites applicatives 256 MiB/10 min, métadonnées/corps/tickets/statuts sont conservées dans le bundle inchangé.

Compte dynamique non privilégié **`vidfetch`, UID/GID 64999** pendant ces tests. `NoNewPrivs=1`, `CapEff=0` effectivement lus dans le processus. `PrivateTmp`, `PrivateDevices`, `ProtectSystem=strict`, `ProtectHome`, `ProtectControlGroups` et protections préparées du noyau sont conservés. Répertoires privés gérés par systemd ; HOME/TMPDIR dédiés. `After=network.target` suffit au serveur loopback, sans activation d’un service d’attente réseau. [Paramètres officiels systemd 257](https://raw.githubusercontent.com/systemd/systemd/v257/man/systemd.resource-control.xml).

**Absence de plafond RAM global : limitation connue et acceptée pour cette mission**, sans annoncer une protection mémoire cgroup inexistante. L’authentification et l’isolation réseau secondaire avant une future exposition restent hors de ce déploiement local.

### Tests sous le service — VALIDÉ

Scénario du **21:30:00 au 21:37:13 UTC**, runner sortie **0**, avec le film public autorisé Big Buck Bunny. Les téléchargements ont réellement tourné dans le cgroup et le sandbox du service :

| Cas | Résultat réel |
| --- | --- |
| Santé initiale, après arrêt/start et après panne | HTTP **200**, `ok: true`, yt-dlp/ffmpeg présents |
| Méthode / JSON invalide / URL privée / corps > 8 KiB | HTTP **405 / 400 / 400 / 413** ; statuts préservés |
| Extraction et formats | HTTP **200**, format vidéo **602 / 144p** utilisé |
| Vidéo MP4 VP9 + AAC | **12 257 965 octets**, `completed`, compteur identique, `error: null`, ffprobe réussi |
| MP3 réel | **15 230 636 octets**, `audio/mpeg`, MP3 seul, `completed`, compteur identique, ffprobe réussi |
| Réutilisation des deux tickets | HTTP **404** |
| Demande concurrente pendant réservation | HTTP **429** |
| Stop avec Node + yt-dlp + ffmpeg actifs | Trois anciens processus disparus ; port 8788 libéré ; service encore `inactive` après **16 s** |
| Start après arrêt administratif | Nouveau PID **19094**, santé rétablie en **12,79 s** |
| Panne simulée sur le seul PID principal | SIGKILL via systemctl ; reprise programmée après **15 s**, PID **19166**, compteur `NRestarts` **0 → 1**, santé retrouvée en **29,24 s** au total |
| Nettoyage après panne avec moteurs actifs | Anciens PID **19094/19133/19134** disparus ; un seul processus Node dans le cgroup final |
| Activation | `active/running`, `enabled`, lien `multi-user.target.wants` présent |

Les deux fichiers reçus sont **identiques par SHA-256 aux médias précédemment décodés intégralement** : vidéo `f02bcb3a77f989c1ec1f5471569943e01cd9631f374fcc11c6cd17bdc5e5866b`, MP3 `f6ea994b0bbcecf1c67d00867722fd4955f37d69ce37244e4061015877564fae`. Le décodage complet n’a pas été répété pour ces mêmes octets. Le transfert vidéo a pris **7,11 s**, le MP3 **167,54 s**, hors préparation et avec contrôle ffprobe inclus.

Après preuve de reprise, `reset-failed vidfetch.service` a remis à zéro les compteurs consommés par l’essai volontaire, puis `enable` a activé uniquement ce service. Le compteur final zéro ne masque pas l’événement : le journal et les résultats conservent le passage à 1. La ligne de journal « Failed with result signal » correspond exactement à la panne injectée ; aucune panne spontanée constatée.

Preuves : [tests réels](artifacts/systemd-activation-20261011-eu3x4mea/systemd-test-results.json), [snapshot avant cycle de vie](artifacts/systemd-activation-20261011-eu3x4mea/runtime-before-lifecycle.json), [snapshot final](artifacts/systemd-activation-20261011-eu3x4mea/runtime-final.json), [journal et santé](artifacts/systemd-activation-20261011-eu3x4mea/journal-and-health-final.log).

### Ressources mesurées

**853 échantillons**, intervalle nominal **500 ms**, de la famille de processus dans le cgroup VidFetch. Le runner/observateur est en dehors du cgroup.

| Mesure | Observation |
| --- | --- |
| RSS maximal du Node principal | **77 052 KiB / 75,2 MiB** |
| Somme RSS maximale Node + moteurs | **200 124 KiB / 195,4 MiB** |
| Pic CPU court échantillonné | **163,6 % d’un cœur**, environ 1,64 cœur sur quatre |
| Quota CPU effectivement configuré | **150 %**, périodes de 100 ms ; limitation observée dans `cpu.stat` |
| Tâches simultanées maximales | **22**, plafond **128** |
| RAM système disponible minimale | **513 848 KiB / 501,8 MiB** |
| Node au repos, relevé séparé | **50 508 KiB / 49,3 MiB**, **7 tâches** |
| CPU au repos sur 10,002 s | **0,0041 % d’un cœur**, delta **411 µs** de CPU du cgroup |
| RAM disponible au contrôle santé final | **600 MiB** sur 905 MiB |
| Swap utilisée avant / après | **132 MiB / 132 MiB** |

Le pic CPU court peut dépasser le quota nominal à cause des bornes de périodes et de l’échantillonnage ; il ne remplace pas la lecture effective `cpu.max`. La somme RSS peut compter plusieurs fois les pages partagées et ne constitue pas une mesure physique exclusive. Maxima observés pour ces médias, sans garantie sur les instants entre échantillons ou d’autres résolutions. Aucun plafond mémoire cgroup déclaré.

Preuves : [échantillons](artifacts/systemd-activation-20261011-eu3x4mea/systemd-resource-samples.json), [repos mesuré](artifacts/systemd-activation-20261011-eu3x4mea/idle-measurement.json).

### Préservation, limites et état final

**VALIDÉ** : SSH reste actif PID **867**, empreinte de son unité inchangée et nouvelles connexions réussies ; serveur 8787 toujours inactif et son fichier conservé ; bundle, fichiers historiques, boot ID et empreinte des paramètres noyau inchangés. Aucun port forwarding, tunnel, changement Vercel/Supabase, installation de paquet, suppression de sauvegarde ou push Git.

**ÉCHEC : aucun final non résolu**. Les **32 contrôles supplémentaires de preuves sur 32** passent, distincts des 32 contrôles de désinstallation MagicMirror. Preuve : [verification.json](artifacts/systemd-activation-20261011-eu3x4mea/verification.json).

**NON TESTÉ** : démarrage après un vrai reboot, serveur 8787 en fonctionnement actif, autres résolutions/plateformes, saturation des plafonds et endurance prolongée. L’activation au boot est vérifiée par le lien systemd ; aucun reboot n’a été effectué. Rétention réelle 30 min déjà validée avec le même bundle, non rejouée ici. Arrêt/panne efface tickets et statuts en mémoire.

**BLOQUÉ : aucun pour le service local demandé**. Un plafond mémoire cgroup nécessiterait toujours une modification boot/noyau séparément autorisée ; l’utilisateur a choisi le fonctionnement sans ce plafond. L’accès depuis Vercel reste à préparer selon l’architecture sécurisée, avec accord préalable et protections décrites en section 14.

Fichiers modifiés : `backend/preproduction/vidfetch.service`, `service-preflight.cjs`, `SYSTEMD.md`, `backend/README.md`, ce rapport. Scripts dédiés ajoutés : `systemd-install.py`, `systemd-validation.py`, `systemd-inspect.py`, `systemd-idle.py`. Artefacts et copies avant modification sous `backend/artifacts/systemd-activation-20261011-eu3x4mea/`. Le backend permanent reste **actif et enabled**, PID **19166** au dernier contrôle.

## 19. Préparation GitHub et frontend Vercel — 11–12 octobre 2026

Cette mission concerne exclusivement le dépôt sur le Mac. **Aucune connexion SSH au Pi, modification de son service, modification Supabase/Vercel ou exposition réseau n'a été effectuée.** Les mesures et validations Pi de la section 18 restent historiques ; elles n'ont pas été rejouées pour le frontend.

### Audit Git et déclenchements automatiques

**VALIDÉ** : dépôt distant `https://github.com/aouirdani/vidfetch.git`, public, branche initiale `main`. HEAD local et `refs/heads/main` distant identiques : `d572cf89d790d73b7102d2fb4e308977f79cafbb`, revérifié après les tests. Aucun historique divergent, aucune fusion ou suppression de travail. Branche de livraison préparée : `release/vidfetch-vercel-20261011`, absente du distant lors de cette vérification ; `main` reste inchangée.

**BLOQUÉ pour le push avant confirmation** : les lectures GitHub montrent un contrôle `cloudflare-workers-and-pages` en échec sur le dernier commit, mais aucun déploiement ni statut Vercel. `.vercel/project.json`, CLI et authentification Vercel absents. Il est donc impossible de certifier la branche de production ou l'absence d'un déclenchement automatique. Une confirmation utilisateur a été demandée pour pousser la branche de livraison sans production, ou autoriser explicitement ce risque. Aucun push n'est exécuté tant que cette confirmation n'est pas reçue. Cette restriction suit la demande utilisateur, pas une règle ajoutée par Codex.

### Corrections ciblées et comportement Vercel

- Les routes Next utilisent une façade dont l'alias de build Vercel sélectionne des handlers sans moteur ni base. Les anciens handlers Node sont conservés sous `src/server/local-api/` ; les contrats du backend Pi restent inchangés.
- `VERCEL` ou la cible Vercel explicite désactive l'installation des moteurs, compile une origine API vide et affiche l'indisponibilité des extractions/téléchargements. Une ancienne `NEXT_PUBLIC_API_ORIGIN`, même privée, est ignorée dans ce mode.
- Santé frontend HTTP 200 : `ok=true`, moteurs absents, `downloads.available=false`. Extraction, préparation, ticket et statut : HTTP 503 JSON `BACKEND_UNAVAILABLE`, sans lecture du corps ni opération moteur/base. Autres méthodes : 405 selon Next.
- Contrôles désactivés, badge indisponible et lien partagé affiché sans extraction. Mise à jour d'état du lien partagé différée avec timer nettoyé, corrigeant l'erreur ESLint sans abandonner ce comportement.
- Image sociale référencée mais absente : JPEG 1200 × 630 ajouté, avec SVG source et générateur refusant l'écrasement. Canonicals, robots, sitemap et metadata restent cohérents avec `vidfetch.io` dans le code.
- Anciennes promesses sans limite de taille et de compteurs publiés retirées. Limites du backend Pi et conservation possible des métadonnées décrites avec précision.
- Next.js **16.2.6 → 16.4.0**, ESLint Next **16.4.0**, PostCSS **8.5.23**, lockfile synchronisé. Mise à jour nécessaire après détection de vulnérabilités critiques/hautes dans les dépendances de production. esbuild explicitement épinglé à **0.25.12** pour la maintenance du bundle Pi.
- Sauvegardes et artefacts exclus de TypeScript/ESLint ; root Turbopack fixé au projet pour éviter de prendre un lockfile du dossier personnel comme racine.

### Preuves de validation de la version finale

| Contrôle | Résultat effectivement observé |
| --- | --- |
| ESLint | **VALIDÉ**, sortie zéro, aucun avertissement final |
| TypeScript frontend | **VALIDÉ**, `npm run typecheck` et contrôle du build Next |
| TypeScript backend | **VALIDÉ**, programme dédié `backend/tsconfig.json` |
| Build Next.js Vercel simulé | **VALIDÉ**, Next 16.4.0/Turbopack ; six pages applicatives, assets SEO et trois routes API |
| Isolation au build | **VALIDÉ**, DB vide et chemins moteur inexistants, setup non désactivé artificiellement ; aucune installation ou dépendance moteur dans les trois traces API |
| Tests existants et nouveaux | **VALIDÉ**, **71/71** tests unitaires, **17/17** tests backend ciblés |
| HTTP réel sur le Mac | **VALIDÉ**, santé 200, sept appels média 503 JSON, huit requêtes concurrentes 503, trois méthodes 405, HEAD 200, six pages et cinq assets 200, deux chemins 404 |
| Navigateur Chrome réel | **VALIDÉ**, contrôles désactivés, badge, URL partagée, mobile, canonical, aucune requête API ni erreur JavaScript |
| Serveur de test | **VALIDÉ**, port loopback libre choisi dynamiquement, serveur lancé par le test arrêté et endpoint inaccessible après arrêt |
| Origine Pi dans le client compilé | **VALIDÉ**, 14 chunks JS contrôlés, aucun `192.168.1.112` ni URI d'identifiants PostgreSQL |
| Secrets et fichiers | **VALIDÉ**, motifs de clés privées, tokens, JWT et identifiants DB : aucun secret détecté dans les fichiers candidats ; placeholders loopback existants distingués des secrets, valeurs privées jamais affichées |
| Dépendances installées/lockfile | **VALIDÉ**, versions installées conformes et sections dependencies/devDependencies du lockfile identiques au manifeste |
| `npm audit --omit=dev` | **VALIDÉ**, zéro vulnérabilité finale |
| Audit npm complet | **ÉCHEC résiduel limité au développement**, neuf alertes : cinq hautes et quatre modérées ; aucun critique. Braces/fast-glob/ESLint et ancien esbuild de Drizzle Kit ; rétrogradations majeures proposées non appliquées |
| Bundle backend recompilé | **VALIDÉ**, 52 635 octets, Node syntaxe/imports natifs/chemins Mac contrôlés ; reproduction **octet pour octet** du bundle Pi, SHA-256 `d370ccfb8574a2f714e86fcde6e555ddd665a846be761ffe29256a648d4a168c` |
| Déploiement Vercel, domaine réel et configuration du compte | **NON TESTÉ**, aucun accès au projet ni requête HTTP de production |
| Passerelle distante et téléchargement via Vercel | **NON TESTÉ / indisponible**, aucune passerelle déployée ; aucune affirmation de téléchargement distant fonctionnel |
| Nouveaux tests média/Pi | **NON TESTÉ pendant cette mission**, vidéo/MP3 et systemd restent validés précédemment avec le bundle identique |

Les premiers essais ont identifié puis résolu : erreur ESLint de mise à jour synchrone dans l'effet, inclusion des copies de sauvegarde par TypeScript, asset social 404 et attente d'hydratation trop courte dans le test navigateur. Le refus de ports internes par le sandbox Mac a été résolu par l'exécution autorisée des tests/build hors sandbox ; aucune protection du Pi n'a été modifiée.

Les preuves locales privées sont sous `backend/artifacts/git-release-20261011-ehmavfxw/` : logs build/lint/TypeScript/tests/audits, `release-verification.json`, sauvegardes avant modification, bundle reproduit. Le dernier test HTTP/navigateur et son arrêt sont sous `backend/artifacts/vercel-http-AFaSH3/`. Un [résumé publiable](validation/github-vercel-20261012.json) accompagne les sources ; les archives, logs bruts, médias et sauvegardes sont exclus du dépôt public. Les scans à motifs ne constituent pas une preuve d'absence de toute forme imaginable de secret.

### Fichiers et suites de livraison

Sources backend, tests, scripts de maintenance et documents systemd/accès conservés. Fichiers frontend/API/configuration modifiés : `next.config.ts`, `tsconfig.json`, `.gitignore`, `eslint.config.mjs`, `package.json`, `package-lock.json`, routes `src/app/api/*`, `FetchForm`, `EngineBadge`, `src/lib/api.ts`, `src/app/page.tsx`, `src/lib/seo.ts`. Sources backend précédemment corrigées `engine.ts`, `extract.ts`, `engine-process.ts` incluses sans nouveau changement fonctionnel. Ajouts : `src/server/`, tests Vercel, scripts de test/scan/génération et image sociale. Aucune archive MagicMirror, donnée personnelle, `.env`, sauvegarde node_modules/lockfile ou artefact binaire backend inclus.

[DEPLOY-VERCEL.md](../DEPLOY-VERCEL.md) fournit les paramètres exacts, noms de variables, création manuelle d'une Preview depuis la branche/SHA, promotion, contrôles HTTP/SEO et rollback vers le précédent déploiement. Aucun réglage Vercel, domaine/DNS ou secret Supabase n'est changé par cette préparation. Avant une future intégration des téléchargements, la passerelle authentifiée et la sécurité des sous-requêtes moteur doivent être validées selon l'architecture préparée.

## 20. Correction du build Vercel sans DATABASE_URL — 12 octobre 2026

L'utilisateur a autorisé puis confirmé le push du commit `d2c4340082fb9b4110ffeda2aba3420f9868d602` sur `release/vidfetch-vercel-20261011`, sans push sur `main`. Sa présence a été vérifiée par Git et l'API GitHub. L'ancien blocage de la section 19 est donc levé. GitHub montrait un build Cloudflare automatique en cours ; aucun événement Vercel n'était visible à ce contrôle. L'utilisateur a ensuite signalé l'échec du premier build Vercel : `DATABASE_URL is required`, collecte de `/api/download` impossible.

### Cause reproduite et limites du précédent test

**ÉCHEC reproduit avant correction** : importer la vraie route `src/app/api/download/route.ts` sans `DATABASE_URL` ni cible/platforme échouait avec la même erreur. La façade exportait tous les handlers Node statiquement ; les routes santé/extraction et `src/lib/downloads.ts` importaient la base, qui validait immédiatement la variable et construisait son Pool au chargement.

Le précédent build validé utilisait explicitement `VIDFETCH_TARGET=vercel`. Sans sélection du mode frontend, la configuration retombait sur les handlers Node. Ce test ne couvrait donc pas le simple `npm run build` sans indicateur. Cette reproduction établit le chemin de l'erreur ; les variables effectivement exposées dans le compte Vercel restent non inspectées.

### Correctif

- Mode frontend dégradé **par défaut**, sans dépendance à `VERCEL`, `VERCEL_ENV`, `VIDFETCH_TARGET` ou une URL de base. L'alias de build conserve les fonctions frontend sans DB/moteurs.
- Opt-in des handlers Node via `VIDFETCH_TARGET=node`, refusé si les indicateurs Vercel identifient la plateforme. Helper partagé entre configuration et façade pour garder une politique cohérente.
- Façade avec contrôle avant import dynamique : importer ou appeler les routes sans opt-in ne charge plus les handlers Node et renvoie la santé frontend ou HTTP 503 `BACKEND_UNAVAILABLE`.
- Remplacement de la base exportée et initialisée immédiatement par `getDb()`, qui construit et conserve le même Pool/Drizzle au premier usage réel. Les insertions, mises à jour, schéma et sonde DB sont conservés ; aucune configuration ou donnée Supabase n'est modifiée. Une véritable fonctionnalité DB continue à réclamer une véritable `DATABASE_URL`, sans valeur de repli.
- Docker conserve son hébergement Node explicite au build et à l'exécution ; l'ancienne URL fictive de build est supprimée. Le helper de configuration est inclus dans l'image runtime. Exemple local et procédures mis à jour. Aucune image Docker déployée.
- Tests améliorés pour importer les **vraies routes**, vérifier le cas sans indicateur, l'absence de module de téléchargement chargé, la protection de l'opt-in sur Vercel et l'initialisation différée de la base. Le test HTTP retire réellement les variables de son processus et crée son dossier d'artefacts dans un clone neuf.

### Validation effectivement réalisée

| Contrôle | Résultat |
| --- | --- |
| Import réel de `/api/download` sans DB/platforme | **VALIDÉ** après correction ; l'erreur initiale est supprimée |
| `npm run build` par défaut | **VALIDÉ** dans une copie isolée sans `.env`, `.env.local`, `.env.production` ou `.env.production.local`, et avec `DATABASE_URL`, `VERCEL`, `VERCEL_ENV`, `VIDFETCH_TARGET` absents du processus |
| Build Node explicite sans DB | **VALIDÉ**, handlers DB/engines conservés compilent sans identifiants au chargement ; setup moteur désactivé pour cet essai de compilation uniquement |
| Identité des sources compilées | **VALIDÉ**, fichiers applicatifs de la copie comparés aux fichiers du dépôt |
| TypeScript frontend/backend | **VALIDÉ**, deux programmes distincts et contrôles des deux builds Next |
| ESLint | **VALIDÉ**, sortie zéro |
| Tests unitaires | **VALIDÉ**, **73/73** |
| Tests backend ciblés locaux | **VALIDÉ**, **17/17** |
| HTTP sur le build sans `.env` | **VALIDÉ**, santé 200, sept appels média 503 JSON, huit appels concurrents 503, méthodes 405 et HEAD 200, pages/SEO/404 préservés |
| Chrome réel | **VALIDÉ**, contrôles indisponibles, liens partagés sans extraction, mobile et canonical, aucune requête API ni erreur JavaScript |
| Traces des fonctions frontend | **VALIDÉ**, les trois routes excluent PostgreSQL, yt-dlp et ffmpeg ; vérifiées avant l'essai distinct du build Node |
| Arrêt du serveur HTTP de test | **VALIDÉ**, processus lancé par le test arrêté et endpoint devenu inaccessible |
| Secrets/diff | **VALIDÉ**, aucun secret détecté par le scan et aucune erreur de whitespace ; fichiers privés exclus |
| Pi | **VALIDÉ pour la préservation**, aucun SSH, changement de service ou de bundle ; empreinte locale inchangée `d370ccfb8574a2f714e86fcde6e555ddd665a846be761ffe29256a648d4a168c` |
| Requêtes à une vraie base Supabase/PostgreSQL | **NON TESTÉ**, aucune connexion réelle effectuée ; schéma et opérations conservés |
| Docker runtime et nouveau build sur Vercel | **NON TESTÉ**, validation distante à faire en Preview par l'utilisateur |

Preuves privées et sauvegardes : `backend/artifacts/vercel-db-fix-20261012-1xh__9mj/`. La copie isolée a été créée depuis les fichiers suivis/candidats, sans secrets, avec une copie locale des dépendances installées ; aucun paquet installé. `build-default.log`, `build-node.log`, `http-default.log`, `tests.log`, `backend-tests.log`, `typecheck.log`, `backend-typecheck.log`, `lint.log` et `release-check.log` conservent les résultats. Les preuves HTTP/Chrome sont sous `build-without-env/backend/artifacts/vercel-http-Oi8CWW/`. Voir le [résumé publiable](validation/vercel-database-fix-20261012.json).

La correction validée est destinée à un nouveau commit sur la **même branche**, avec push normal expressément autorisé par l'utilisateur. Aucun changement de `main`, force push, PR, fusion, réglage Vercel/Supabase/Cloudflare ou promotion en production. Les étapes Preview actualisées sont dans [DEPLOY-VERCEL.md](../DEPLOY-VERCEL.md) : sélectionner le nouveau SHA, ne pas reconstruire uniquement l'ancien commit et ne pas ajouter de fausse URL de base.

## 21. Connexion sécurisée Vercel ↔ Raspberry Pi — préparation du 12 octobre 2026

La correction précédente est désormais dans le commit de base validé `cf8cc173130f9832f2ca776c6fda563e67a6d9fb`. Pour cette nouvelle mission, branche de travail **locale uniquement** `work/vidfetch-secure-connection-20261012`. Aucun commit/push, SSH vers le Pi, modification systemd/réseau, paramètre Vercel/Supabase, tunnel public, compte externe ou service payant. Le bundle opérationnel Pi garde son SHA-256 `d370ccfb8574a2f714e86fcde6e555ddd665a846be761ffe29256a648d4a168c`.

### Recherche et recommandation

Le [plan complet](preproduction/SECURE-CONNECTION-PLAN.md) compare Cloudflare Tunnel/Access, Tailscale privé/Funnel, ngrok, OCI, petit VPS et R2, avec leurs documentations officielles consultées. Cloudflare précise maintenant expressément que ses routes Tunnel publiques Free/Pro/Business sont soumises aux restrictions média : Access ne suffit pas à autoriser ce transport. Funnel n'annonce pas de plafond numérique garanti utilisable pour dimensionner ce service ; ngrok Free fournit seulement 1 Go sortant/mois.

Architecture candidate : **VM OCI Always Free → Caddy HTTPS → relais Node authentifié → boucle distante SSH → socket Unix Pi → worker dans namespace réseau filtré**. La connexion SSH part du Pi et ne demande aucun port forwarding de box. Le navigateur reçoit ses fichiers depuis le relais ; seule l'autorisation JSON passe par Vercel. Gratuité conditionnelle à l'offre/région/quotas disponibles, reprise d'instances inactives possible. Le contrat applicable au compte est à vérifier ; aucun abonnement ou accès n'est créé. Repli payant documenté, aucune souscription.

### Code préparé

Émetteur `/api/download-access` sans DB, challenge Turnstile validé côté serveur, session courte HttpOnly et grants de 120 s avec clé navigateur P-256. Appels sensibles HMAC + preuve ECDSA liée au corps/méthode/chemin/grant, nonces anti-rejeu durables, quotas IP/visiteur/global. Autorisation anonyme sans compte personnel, Supabase inchangé.

Relais : tickets externes aléatoires liés à leur propriétaire et IP, expiry 55 s et usage unique, cookie natif de transfert court ; secret de service absent du navigateur. Le helper HTTPS est une fenêtre de premier niveau permettant un téléchargement natif sans Blob complet ni cookies tiers. Formats/onglets vidéo/audio existants, polling, état du moteur, erreurs et mode dégradé conservés. API distante activable seulement avec mode/readiness et origines HTTPS publiques valides. Aucune URL Pi privée ajoutée au JavaScript de production.

Node, yt-dlp et ffmpeg futurs sont placés dans un namespace qui doit refuser LAN/loopback/metadata/redirections privées et limiter toutes les requêtes secondaires. Le relais refuse le backend actuel sans profil d'isolation avec 503 `SECURITY_NOT_READY`. **Cette protection réseau n'est pas déclarée validée :** les modèles nftables/systemd/SSH/Caddy restent non installés, le profil root est une attestation administrative après audit et tests Linux. Aucun mécanisme d'activation du réseau hôte n'est exécuté/fourni comme installateur automatique. Avant exploitation, un seul worker doit remplacer l'ancien après accord ; deux instances distinctes auraient deux verrous indépendants.

Un problème supplémentaire a été réellement constaté : ffmpeg peut terminer avec code 0 en produisant seulement des tags ID3 lorsqu'il ne lit pas l'audio d'un MP4 non seekable. Ajout ciblé `-abort_on empty_output` à la **source future** `backend/server.ts` ; test négatif ne conclut plus completed. Le bundle installé sur Pi n'est pas remplacé. Un média MP4 non adapté au pipe peut encore être refusé proprement ; aucune promesse de conversion universelle ou chargement complet en RAM.

### Validation réelle

| Contrôle | Résultat |
| --- | --- |
| ESLint | **VALIDÉ**, sortie 0 |
| TypeScript frontend, backend et gateway/worker | **VALIDÉ**, trois programmes distincts, sorties 0 |
| Builds Next défaut et secure-gateway sans DB | **VALIDÉ**, copies isolées sans fichiers `.env`, sans `DATABASE_URL`, aucun secret fictif ; identité des sources applicatives contrôlée |
| Tests unitaires | **VALIDÉ 80/80**, zéro échec final |
| Tests backend HTTP/processus | **VALIDÉ 17/17**, zéro échec final |
| Gateway HTTPS sécurité | **VALIDÉ 1/1**, comprend auth/rejeu HMAC/PoP, owner, ticket, concurrence, expiration/rétention accélérées, déconnexion, panne moteur et isolation absente |
| Chrome HTTPS entre deux sites | **VALIDÉ**, helper natif et cookie de premier niveau, 128 000 octets exacts, statut completed, aucun Blob ; challenge simulé |
| Vidéo avec vrais moteurs Mac via HTTPS | **VALIDÉ**, fixture originale faststart de 2 s, 49 786 octets, completed, SHA-256 identique à la source, ffprobe + décodage complet |
| MP3 avec vrais moteurs Mac via HTTPS | **VALIDÉ**, 49 676 octets, completed, codec MP3, ffprobe + décodage complet |
| MP3 sans audio / fixture non streamable | **VALIDÉ après correction**, erreur terminale et absence de completed |
| Build HTTP/Chrome dégradé | **VALIDÉ**, santé 200, 8 cas média/access 503, méthodes/concurrence/SEO/mobile/traces, zéro requête API UI et arrêt du serveur test |
| Bundles Node22 CJS + node --check | **VALIDÉ sur Mac**, gateway et nouveau public-worker ; shim ffmpeg-static, imports builtin, absence de chemins Mac/modules natifs intégrés |
| Scan de fichiers candidats / whitespace | **VALIDÉ**, aucun motif de secret/fichier privé détecté ; portée limitée aux règles du scanner |
| Tour complet Internet Vercel → VM → Pi → navigateur | **NON TESTÉ**, aucun téléchargement public déclaré fonctionnel |
| Turnstile réel / certificat public / liaison SSH | **NON TESTÉ**, comptes/configurations à créer manuellement |
| nftables, namespace, futurs services systemd Linux | **NON TESTÉ**, tests adversariaux nécessaires avant exposition |
| Ressources supplémentaires Pi et relais réel | **NON TESTÉ**, 195,6 MiB était la mesure historique de l'ancien backend, pas de cette architecture |
| Activation publique | **BLOQUÉE** jusqu'à isolation prouvée, fournisseur/compte confirmé et validation complète ; arrêt volontaire avant les actions non autorisées |

Les premiers essais en **ÉCHEC** ont été conservés puis corrigés : MP3 tags seuls, appel fetch avec mauvais contexte `this` dans Chrome, lib DOM.Iterable TypeScript et normalisation IPv6 du contrôle DNS. Aucun échec restant dans les suites locales finales ; les limites et contrôles non exécutés ci-dessus demeurent explicites.

Preuves privées : `backend/artifacts/secure-connection-20261012-nd1zjwt0/` avec sauvegardes originales, `lint-complete.log`, `typecheck-complete.log`, `backend-typecheck-complete.log`, `gateway-typecheck-complete.log`, `unit-tests-complete.log`, `backend-tests.log`, `gateway-tests-complete.log`, `gateway-browser-complete.log`, `gateway-media-verified.log`, `build-verification-final.json`, deux builds sans env, `http-default-browser-final.log` et scan de livraison. Preuves média originales : `backend/artifacts/gateway-media-VerRGg/results.json` ; preuve Chrome : `backend/artifacts/secure-tls-hGGO8n/browser-results.json`. Les certificats/clés de test et médias sont exclus de Git. Le [résumé publiable](validation/secure-connection-20261012.json) expose uniquement les résultats et empreintes non secrètes.

Fichiers créés : `backend/gateway/`, `backend/public-worker/`, `backend/preproduction/secure-relay/`, `SECURE-CONNECTION-PLAN.md`, nouvelle route/crypto/client/types/widget et tests. Fichiers modifiés : `next.config.ts`, `Dockerfile`, `src/lib/api.ts`, composants formulaire/carte/badge, `backend/server.ts` (une option ffmpeg), test HTTP Vercel, README et ce rapport. Aucun nouveau paquet npm ni changement de lockfile.

Le plan fournit les comptes à créer par l'utilisateur, l'ordre de configuration Pi/VM, les noms des variables Vercel, la vérification complète et le rollback. **Restent à autoriser séparément :** nouveau réseau/namespace/units Pi, VM/SSH/public HTTPS, futur push, paramètres Preview Vercel, essai Internet et activation finale. Le service Pi actuel, SSH, 8787, Supabase et la production restent préservés.

## 22. Infrastructure gratuite et capacité Raspberry Pi — 12 octobre 2026

**Décision changée par l'utilisateur : Oracle/VPS abandonné temporairement.** Le [rapport demandé](preproduction/RASPBERRY-FREE-SCALING.md) présente la passerelle authentifiée sur le Pi, le pilote Funnel, les limites/conditions fournisseur, une file sécurisée, les mesures et hypothèses, l'alternative IPv6 et les étapes manuelles. Même branche locale de travail, aucun commit/push ; `release/vidfetch-vercel-20261011` reste à `cf8cc173…` et `main` à `d572cf89…`.

### Pi : inspection réelle et blocage matériel

SSH non interactif validé en lecture seule. Backend santé HTTP 200, Node 22.22.2/aarch64, yt-dlp 2026.08.19/ffmpeg présents. PID backend **19166**, `NRestarts=0`, SHA de son bundle opérationnel inchangé `d370ccfb…a168c`. SSH PID **867** actif, 8787 absent comme au début, backend exclusivement loopback 8788. Aucune installation, aucun sudo, reboot, changement systemd/réseau ou fichier distant. Les scripts sont exécutés par SSH depuis stdin et leurs sorties enregistrées sur Mac.

Snapshot réel : RSS backend **55,9 MiB**, RAM disponible minimum **587,6 MiB** sur **905,0 MiB**, swap occupé **132,4 MiB**, température **32,7–33,2 °C**, CPU du service inchangé pendant les six secondes de snapshot. Route Wi-Fi `wlan0`, Ethernet inactif, IPv6 globale présente sans test entrant ; Tailscale absent. Filesystem racine ~21,2 Go disponibles. Contrôleur mémoire toujours absent. Aucune charge CPU moteur nouvelle exécutée sur Pi.

**ÉCHEC matériel constaté** : `get_throttled=0x50005` persiste sur plusieurs lectures et `rpi_volt/in0_lcrit_alarm=1`. Sous-tension et throttling sont actuels, pas seulement historiques. Fréquence de 600 MHz observée au repos, pas de conclusion sur sa fréquence maximale en charge. Aucun réglage pour masquer l'alarme. Information demandée sur alimentation/câble, sans débrancher/rebooter le Pi.

La sonde d'upload est préparée à 32/64/128 KiB/s, quatre secondes chacun, **896 KiB maximum**, zéros seulement, contrôle de latence et guards. Son exécution réelle a retourné **BLOQUÉ**, code 2, **zéro byte et zéro requête de mesure WAN**, en raison de la sous-tension. Débit ISP et débit Funnel **NON TESTÉS** ; aucun speedtest saturant ou estimation présentée comme mesure.

Contrôle final à **10:05:45 UTC** : santé 200, mêmes PID backend/SSH, zéro restart, même SHA, 8787 toujours absent ; sous-tension toujours active. Un timeout SSH initial sous sandbox a été levé par la reprise autorisée hors sandbox ; aucune intervention sur le Pi n'a été nécessaire.

### Préparation du code, sans déploiement

Queue de metadata en RAM : **deux places**, FIFO, un pending par visiteur/IP, attente absolue 180 s, heartbeat 20 s, claim sous 15 s. Extraction et download partagent le verrou unique. Réponses 202 additives, endpoint gateway `/api/queue` signé et lié au propriétaire/IP, consommation unique, annulation sans moteur. Le client conserve les réponses finales existantes, affiche position/estimation et annule si fenêtre/onglet ferme. Aucun média en mémoire et aucune file Supabase.

Ticket média créé seulement après claim. Correction d'une course dans le **futur gateway** : expiration extérieure 55 s ne libère pas le worker avant la deadline Pi 60 s et une marge de nettoyage ; test accéléré couvre le cas. Quotas/nonces SQLite existants conservés. Nouvelle option mode Funnel exige headers fournisseur écrasés/hostname et peer loopback ; adaptation vers le socket Unix du worker isolé, aucune liaison VM. Source officielle actuelle consultée, version réelle Tailscale **NON TESTÉE**.

Nouveaux modèles publics : **16 MiB**, média 15 min, gateway 64 KiB/s, opération 10 min ; le worker applique aussi le plafond avant lancement pour une taille connue. Garde Pi lecture seule (alarme voltage, <65 °C, ≥256 MiB disponibles), refus 503 `RESOURCE_GUARD` avant moteur/sur santé de passerelle ; absent/inaccessible = refus. L'ancien service 256 MiB/30 min reste inchangé. Nouvelle unité gateway proposée avec heap 64 MiB, CPU 50 %, nice 19, répertoire SQLite 0700 et sans `MemoryMax`, **non installée**.

### Validation

| Contrôle | Résultat |
| --- | --- |
| Santé/empreinte/service Pi, SSH, 8787 | **VALIDÉ**, observations réelles et contrôle final |
| ESLint et trois programmes TypeScript | **VALIDÉ**, sorties 0 |
| Tests unitaires | **VALIDÉ 88/88**, suite précédente conservée, nouveaux cas queue/guards |
| Charge HTTPS synthétique Mac 1/2/4/8 | **VALIDÉ**, une opération active, deux attente max, six refus aux paliers saturés ; aucun vrai moteur ni WAN |
| Headers Funnel simulés / owner / cancel / metadata queue | **VALIDÉ**, pas de moteur supplémentaire, pas de fuite de ticket source |
| Expiration ticket / worker encore occupé | **VALIDÉ**, la file ne propose pas le tour avant cleanup source |
| Mémoire/CPU du test local | **VALIDÉ comme mesure Mac uniquement**, dernier scénario complet pic **73,4 MiB**, admission ~7–32 ms, CPU moyen ~2–8,1 % d'un cœur |
| Chrome natif après adaptations | **VALIDÉ**, cookie sécurisé/helper entre deux origines et fichier exact |
| Vidéo/MP3 avec moteurs Mac | **VALIDÉ**, un média original court, intégrité/décodage, contre-test MP3 vide conservé |
| Builds Next défaut et secure sans DB/.env | **VALIDÉ**, copies isolées, identité des sources applicatives vérifiée |
| HTTP/Chrome dégradé | **VALIDÉ**, API 503, UI/SEO/méthodes/traces/arrêt du serveur conservés |
| Bundles gateway/worker `node --check` | **VALIDÉ sur Mac**, artefacts neufs, aucun remplacement du bundle Pi |
| Scan candidats / whitespace | **VALIDÉ**, pas de secret/fichier privé détecté par les règles du scanner |
| Upload / nouvelle charge Pi | **BLOQUÉ**, sous-tension actuelle |
| Isolation Linux/Tailscale réel/Funnel/Preview public | **NON TESTÉ**, aucun accès public activé |
| Capacité de production 100–500/jour | **NON TESTÉ**, modèle hypothétique uniquement |

La suite backend précédente **17/17** et les vidéos/MP3 Pi validés restent conservés ; aucun rerun inutile du backend installé sous alarme matérielle. Le premier typecheck a signalé un type Buffer incompatible lors de la reprise du corps queued ; correction ciblée et programmes finaux valides.

Les calculs du rapport distinguent visiteurs/conversion : hypothèse 10 MiB, 20 s info/visiteur et 20 s préparation, débit 64 KiB/s, fenêtre 12 h : 100 visiteurs à 20 % demanderaient ~1,56 h de worker ; 500 à 20 %, ~7,78 h (65 %), déjà au-delà de la marge cible 60 % et au plafond 100 tentatives/jour. Pour 3 000 à 20 %, ~46,67 h : impossible dans ce scénario avec ce seul worker. **Ce ne sont pas des benchmarks.**

Funnel reste beta, débit plafonné non chiffré garanti, hostname ts.net et usage personnel non commercial ; aucune autorisation illimitée de gros médias déduite de l'absence de ban spécifique trouvé. Alternative gratuite conditionnelle : IPv6 + AAAA DNS-only + HTTPS/auth/isolation, nécessite accord d'entrée 443 et exclut les clients IPv4-only. Aucun accès gratuit universel validé si Funnel est inadapté et toute entrée est interdite. Aucun CNAME, relais vidéo Vercel ou Cloudflare Tunnel média utilisé comme contournement.

Preuves privées/sauvegardes : `backend/artifacts/free-scaling-20261012-sd3i0fof/`, snapshot/probe/scénarios, logs unitaires/charge/Chrome/média/build/lint/TS et nouveaux bundles. Charge complète finale : `backend/artifacts/secure-tls-d0lpo4/load-results.json`. Module SQLite natif Node 22.22.2 vérifié disponible sur Pi sans création de DB, encore expérimental. Le profil optionnel `VIDFETCH_PI_MODE=1` prépare aussi la même passerelle/socket/garde sous reverse proxy pour l'alternative IPv6, sans ouverture automatique. [Résumé publiable](validation/free-scaling-20261012.json). Le rapport fournit paliers 100→250→500→milliers, critères p95/429/RAM/CPU/débit/succès, instructions manuelles et rollback. Restent alimentation, mesures réelles, Linux SSRF, installation/network permissions, fournisseur, futur push/Preview et activation **à autoriser séparément**.


## 23. Migration OVH locale — 12 octobre 2026

La décision OVH remplace la cible gratuite Pi/Funnel, conservée dans l'historique. [Rapport complet demandé](preproduction/OVH-VPS-DEPLOYMENT.md), [résumé](validation/ovh-vps-20261012.json) et preuves privées `artifacts/ovh-deployment-20261012-rnllrb69/`. Même branche/base cf8 ; aucune suppression du travail existant, aucun commit/push/merge. Aucun SSH ou changement Pi, Vercel, Supabase, Cloudflare, accès public ou reboot.

**VALIDÉ** : SSH OVH, Debian 13.6 x86_64/2 vCPU/3 826 MiB RAM, contrôleurs cgroup CPU/memory/pids ; Node 22.23.3 officiel, yt-dlp 2026.08.19 officiel décompressé, ffmpeg/ffprobe 7.1.5 Debian ; nouveaux utilisateurs worker/gateway, release dédiée et secrets root 0600. Services `vidfetch.service`, `vidfetch-gateway.service`, `vidfetch-egress.service` installés/enabled ; moteur 127.0.0.1:8788 et gateway 127.0.0.1:8789, aucune écoute publique ajoutée. Mémoire cgroup 1 Gio/256 Mio, CPU 150 %/50 %, une opération et queue deux places.

**VALIDÉ** : lint/TypeScript et programmes backend explicites, 88/88 unités, 17/17 backend, 3/3 queue/charge ; nouveaux bundles Node 22 CJS autonomes, shim null, syntaxe Mac/VPS et empreintes vérifiées. Frontend inchangé dans cette migration ; builds Next sans DB et tests Chrome/HTTPS précédents conservés, aucun rerun de build prétendu.

**VALIDÉ** : 48/48 tests VPS de fonctions backend partagées sous protections et gateway réel, avec entrée temporaire de métadonnées de fixture publique autorisée W3C/Big Buck Bunny ; vrais yt-dlp/ffmpeg, validation réseau non désactivée. Vidéo Ogg **4 360 399 octets**, MP3 **792 620 octets**, ffprobe et décodage intégral, completed et compteurs exacts ; usage unique, expiration réelle 61,5 s, propriétaire/rejeu/origine, queue/concurrence, aborted après déconnexion et aucun enfant restant. Ces preuves ne sont pas une extraction YouTube réussie ni une connexion Internet Preview. Pic RSS familles **257,1 Mio**, cgroup moteur **226,5 Mio**, gateway **20,6 Mio** ; distribution décompressée finale **48/48**, pic RSS familles **254,1 Mio**, cgroup moteur **83,0 Mio**, gateway **19,5 Mio**, vidéo **3,837 s**, MP3 **3,407 s**. Mesures complètes dans le résumé.

**VALIDÉ** : cycle systemd 13/13, arrêt ports/enfants, démarrage, SIGKILL Node avec moteur actif, reprise automatique **11,548 s**, SSH PID **869** inchangé. Politique nft limitée au UID worker 999, privée/metadata/IPv6/ports interdits bloqués ; guard stop ferme les ports, politique recréée sans identifiants volatils, santé permanente restaurée. Aucun firewall entrant global remplacé.

**ÉCHECS intermédiaires corrigés** : timeout IPv6 (choix IPv4 réservé à OVH), Host ignoré par Node fetch dans le test (http.request), fixture silencieuse remplacée, limites de démarrage atteintes par tests (reset ciblé), hash nft dépendant de handles (normalisation structurelle), résidu PyInstaller après SIGKILL **85 470 495 octets** (distribution Linux décompressée : **0 répertoire/0 octet**). Quota persistant de l'IP synthétique atteint, conservé ; aucune suppression de ledger pour faciliter les tests.

**BLOQUÉ** : YouTube depuis OVH répond **401 AUTH_REQUIRED** après ~3,7 s, vérification anti-bot ; aucun cookie/session/proxy/contournement. Test de suivi réel d'un redirect public vers un canary privé bloqué par l'indisponibilité des sites de test. **NON TESTÉ** : HTTPS/Caddy public, Preview de bout en bout, autres plateformes, gros fichiers/HLS/DASH, rétention réelle 30 minutes sur VPS, reboot effectif et capacité WAN/production.

Le modèle Caddy cible `api.vidfetch.app` via DNS-only puis gateway signé ; fichiers navigateur↔VPS directement, Vercel transporte seulement les petits grants/admissions JSON. Instructions DNS, Turnstile, variables Preview (noms seulement pour secrets), whitelist exacte, vérification et rollback dans le rapport. Pas de bascule depuis le Pi ni d'exposition avant accord distinct et preuve de fonctionnement sur une plateforme accessible.

Audit final **2026-10-12T17:11:25Z** : santé 200 permanente sans marqueur fixture ; PID moteur **9270**, gateway **9271**, SSH **869** ; trois unités active/enabled, aucun enfant yt-dlp/ffmpeg ni résidu `_MEI`, RAM disponible **3 413 MiB**. Dernier cycle distribution finale **13/13**, reprise après crash contrôlé **11.31 s**. Quota persistant confirmé **429 QUOTA_EXCEEDED** ; aucun reset des quotas. Les empreintes de release finales correspondent aux bundles Mac.
