# Capacité VidFetch — phase 2

## Architecture et réglages

Le frontend Next.js transmet les requêtes à la passerelle Node (`backend/gateway/server.ts`), qui contrôle origine, grant, preuve, file d'attente et quota, puis relaie les flux avec backpressure vers le moteur isolé (`backend/server.ts`, lancé par `backend/ovh/main.ts`). La passerelle conserve les réservations dans SQLite sans URL ni IP en clair. Le CI construit les deux bundles protégés dans l'archive de release ; `deploy/ovh/ci/promote.py` refuse leur activation automatique. La procédure existante de promotion administrateur (`deploy/ovh/vidfetch-promote.py`) sait promouvoir une release complète et restaurer l'ancienne si les contrôles de santé échouent.

Toutes les valeurs sont désormais réglables par variables `VIDFETCH_*`. Les valeurs de quota, débit, taille, durée, concurrence et rate limit conservent les limites actuelles par défaut. La file reste bornée en mémoire et peut maintenant aller jusqu'à 32 entrées / 10 minutes ; son défaut applicatif est de 8 lorsqu'elle est activée. L'environnement OVH déjà installé fixe toutefois encore `VIDFETCH_QUEUE_MAX=2` : le code ne remplace pas cette valeur sur le serveur.

| Limite | Valeur actuelle par défaut | Variable | Source antérieure |
|---|---:|---|---|
| Taille max download | 256 Mio passerelle et moteur OVH | `VIDFETCH_PUBLIC_MAX_MIB` | `backend/gateway/main.ts`, `backend/ovh/main.ts`, `backend/server.ts` |
| Durée média | 30 min OVH | `VIDFETCH_PUBLIC_MAX_MINUTES` | `backend/ovh/main.ts`, `backend/server.ts` |
| Durée opération | 10 min | `VIDFETCH_PUBLIC_MAX_OPERATION_MINUTES` | `backend/server.ts` |
| Opérations / identité et jour | 8 | `VIDFETCH_QUOTA_IDENTITY_OPS_DAY` | `backend/gateway/ledger.ts` |
| Opérations globales / jour | 100 | `VIDFETCH_QUOTA_GLOBAL_OPS_DAY` | `backend/gateway/ledger.ts` |
| Volume / identité et jour | 1 Gio | `VIDFETCH_QUOTA_IDENTITY_MIB_DAY=1024` | `backend/gateway/ledger.ts` |
| Volume global / jour | 4 Gio | `VIDFETCH_QUOTA_GLOBAL_MIB_DAY=4096` | `backend/gateway/ledger.ts` |
| Concurrence du moteur | 1 opération | `VIDFETCH_PUBLIC_MAX_CONCURRENT` | `backend/server.ts` |
| File d'attente | OVH actuel : 2 places, défaut code activé : 8 | `VIDFETCH_QUEUE_MAX` | `backend/gateway/main.ts`, `backend/preproduction/ovh/install-app.py` |
| Débit de relais | 2 Mio/s | `VIDFETCH_STREAM_KIBPS=2048` | `backend/gateway/main.ts` |

Un téléchargement annonce la taille de format reçue de l'extracteur. La passerelle réserve cette taille avec une marge de 10 % (minimum 1 Mio, maximum 16 Mio), plafonnée au maximum de fichier. L'annonce est non fiable : pendant le relais, chaque dépassement de la réservation entraîne une extension atomique vérifiant les plafonds identité/IP et globaux. Si elle échoue, le flux est interrompu avant d'envoyer les octets excédentaires. En l'absence de taille annoncée, le plafond complet est réservé. Les tentatives restent comptées comme auparavant ; les octets inutilisés sont libérés.

## Banc de charge isolé

Commande : `npm run load:isolated`. Le script crée un court MP4 de mire et son local avec ffmpeg, puis exécute le banc HTTPS sur des sockets loopback, un faux moteur local et huit clients synthétiques. Aucune plateforme ni URL publique n'est contactée. Le garde arrête le processus si la mémoire libre descend sous 512 Mio (modifiable par `VIDFETCH_LOAD_MIN_FREE_MIB`, minimum autorisé 256 Mio).

Dernière exécution locale : vidéo fixture 396 790 octets ; scénario 1/2/4/8 clients, au plus 1 moteur simultané, jusqu'à 3 opérations menées à terme avec la file actuelle du scénario (2 places), pic RSS du processus 85,6 Mio. Cette mesure valide le comportement local du gateway et ses bornes ; elle **ne prédit pas** le débit OVH, les performances yt-dlp/ffmpeg réelles, Cloudflare, ni une capacité de plusieurs centaines de visiteurs quotidiens. Aucun profil de production n'est déduit d'un faux moteur.

## Compteurs, rapport journalier et alertes

La table `metrics` ne contient que des compteurs journaliers de requêtes, rejets de quota, indisponibilités et autres erreurs serveur. Elle ne stocke ni lien, ni titre, ni IP, ni identifiant de session. Les réservations quota existantes gardent leurs identifiants HMAC et les métriques sont purgées après 90 jours.

Après transfert du nouvel outil de rapport dans une release, l'opérateur peut l'exécuter chaque jour sous un compte autorisé à lire le ledger :

```sh
VIDFETCH_QUOTA_DB=/var/lib/vidfetch-gateway/quotas.sqlite \
VIDFETCH_GATEWAY_ENV=/etc/vidfetch/gateway.env \
/opt/vidfetch/tools/node-v22.23.3-linux-x64/bin/node \
/opt/vidfetch-web-preproduction-20261013/current/tools/daily-capacity-report.mjs
```

Le script signale un usage global à 80 %, un taux d'erreur supérieur à 5 % à partir de 20 requêtes, ou trois indisponibilités dans la journée. Un canal peut être activé en fournissant `VIDFETCH_CAPACITY_ALERT_WEBHOOK` (HTTPS uniquement) au service planifié. Il n'existe pas encore de webhook configuré ici ; l'URL secrète doit rester dans l'environnement root-owned et ne jamais être copiée dans le dépôt. Le rapport ne publie que des agrégats.

## État de mise en production

La compilation/release CI et la promotion protégée séparent frontend, moteur et passerelle. Après fusion, le promoteur CI doit refuser les bundles modifiés par `ENGINE_FILES`, comme prévu. L'activation doit passer par la procédure admin versionnée `deploy/ovh/vidfetch-promote.py`, qui sauvegarde les releases et revient à la release précédente après échec de santé. Aucune modification de Caddy ou Cloudflare n'est nécessaire.

Le banc n'a pas été exécuté sur le VPS : la connexion SSH avec la clé disponible dans GitHub Actions n'est pas présente dans cet environnement, et il n'y a pas de sudo local sur l'OVH. Il serait dangereux de déclarer une capacité ou d'augmenter les quotas sans le banc VPS demandé. En conséquence, les limites de production restent les valeurs en place. L'action opérateur restant est de lancer le workflow `load:isolated` sur une instance OVH isolée, sous surveillance RAM, puis de choisir les variables à appliquer avec sauvegarde et rollback via les scripts d'administration. Les seuils d'alertes peuvent être activés dès qu'un canal HTTPS de supervision existe.
