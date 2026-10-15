# Rollback complet du dispositif « media-test »

Procédure d'administrateur, **non exécutée et non testée sur le VPS** (aucun accès VPS dans cette mission). Elle suppose les sauvegardes horodatées prévues à l'étape 2 du plan d'activation (`docs/VIDFETCH-PHASE9-ACTIVATION.md` §G). Garder une seconde session SSH ouverte pendant toute la procédure. **Ne jamais utiliser `firewall.py rollback` pour ce retour arrière** : il arrête Caddy et supprime toute la table d'ingress (l'apex disparaît aussi). On restaure l'ancienne table à la place.

## Outils fournis (à préférer aux étapes manuelles)

Les scripts de `deploy/ovh/media/admin/` exécutent ce retour arrière ; le tableau plus bas reste la référence manuelle si un script n'est pas utilisable. Aucun de ces scripts ne supprime de répertoire ni ne supprime de façon récursive : ils retirent uniquement des fichiers nommés qu'ils ont eux-mêmes créés, après validation du chemin.

| Besoin | Commande | Ce qu'elle fait |
|---|---|---|
| **Urgence : fermer l'accès** (étapes 1 et 3 du tableau) | `sudo bash 04-cancel.sh` | remet `ingress.nft` et la table nft d'origine, le pointeur Caddy, retire le drop-in `media-test.conf`, recharge Caddy, vérifie le résultat. C'est le même script que la minuterie automatique (`restore-network.sh`) : étapes indépendantes, application directe de la table sauvegardée si l'outil pare-feu échoue. |
| **Retour complet à la sauvegarde** (étapes 1 à 5, sauf redémarrages) | `sudo bash /var/backups/vidfetch-media-test-latest/restore-full.sh /var/backups/vidfetch-media-test-latest --yes` | vérifie l'intégrité de la sauvegarde, restaure le réseau, puis **toute** l'arborescence `/etc/vidfetch` (environnements, garde CI, drapeaux) à l'identique avec propriétaires et modes, l'unité Caddy et ses drop-ins, retire les fichiers media-test et le profil CI s'il n'existait pas. **Ne redémarre rien** et indique quoi redémarrer. Ne remplace pas les certificats Caddy. |
| **Revenir sur Caddy seul** (réseau confirmé conservé ; fenêtre media-test ou publique) | `sudo bash 05-cancel.sh` | remet le pointeur Caddy d'origine, retire le drop-in `media-test.conf` et le profil CI public s'il est présent (jamais un profil media-test), recharge Caddy (le démarre s'il est arrêté), vérifie ; ne touche ni à `ingress.nft` ni à la table nft. Même script que la minuterie Caddy (`restore-caddy.sh`). |
| **Refermer les téléchargements publics** | `sudo bash 11-downloads.sh close` | `ready=0` puis profil CI `public`, contrôle de l'origine ; `dl` reste public mais n'émet plus de jeton |
| **Refermer `dl.vidfetch.app`** (téléchargements déjà fermés) | `sudo bash 10-dl-cancel.sh` | ingress testeur et `Caddyfile.public` restaurés depuis l'instantané pris à l'ouverture ; l'apex reste public. Même script que la minuterie `vidfetch-dl-rollback` (`restore-dl.sh`). |
| Fermer seulement le frontend | `sudo bash set-ready.sh 0` | `VIDFETCH_CONNECTION_READY=0`, redémarre uniquement le frontend |
| Revenir à l'ancienne passerelle | `sudo bash 08-gateway.sh rollback` | remet le bundle, le drop-in et l'environnement sauvegardés par la mise à niveau, redémarre la passerelle seule (hors transfert actif) et vérifie. Si le garde CI avait été réconcilié, remettre sa version précédente (`ci-web-test-guard.json.bak.<heure>`). |
| Retirer le profil CI | `sudo bash 06-profile.sh remove` | le promoteur revient au profil fermé |

Pendant la fenêtre réseau, la restauration réseau se déclenche **toute seule** (minuterie systemd armée par `03-network.sh`) tant que `04-confirm.sh` n'a pas été validé par une nouvelle connexion SSH depuis l'IP testeur. Pendant la fenêtre Caddy qui suit, la configuration Caddy d'origine revient **toute seule** (minuterie armée par `05-caddy.sh`) tant que `05-confirm.sh` n'a pas validé les contrôles de l'origine ; les règles réseau confirmées restent en place.

Après `restore-full.sh`, redémarrer uniquement ce dont l'environnement a changé : le frontend (`vidfetch-web-preproduction-20261013.service`) et, si son origine avait été modifiée, la passerelle (hors transfert actif). Puis faire les vérifications de l'étape 6.

## Procédure manuelle de référence

L'ordre compte : on ferme d'abord l'accès, puis on retire la configuration.

| # | Action | Effet | Vérification |
|---|---|---|---|
| 1 | **Fermer le réseau.** Restaurer la sauvegarde de `/etc/vidfetch/public-https-test/ingress.nft` (table Cloudflare-only d'origine), puis `firewall.py apply` (copie installée du script `deploy/ovh/public-test/firewall.py` : `nft --check`, remplacement atomique) | testeurs et port 80 mondial retirés en une transaction | depuis une IP testeuse : `curl -m 8 https://dl.vidfetch.app/` → échec de connexion ; SSH toujours opérationnel (2e session) |
| 2 | **Fermer le frontend.** Restaurer `web.env.bak.<horodatage>` (celui créé par `install-web-secrets.sh`, état avant secrets, `READY=0`) en `root:root 0600`, puis redémarrer **uniquement** `vidfetch-web-preproduction-20261013.service` | plus de clés Turnstile/HMAC dans l'environnement web ; `/api/download-access` → 503 | `curl -s https://vidfetch.app/api/health` avec Basic Auth : `downloads.available=false` |
| 3 | **Caddy.** Restaurer le Caddyfile sauvegardé, `caddy validate`, puis reload de `vidfetch-caddy.service` | retour à Basic Auth + noindex + médias 503, sans bloc `dl` actif | apex : `/` 401, `/api/download` 503, `/api/fetch-info` 503, sitemap 404 |
| 4 | **CI.** Supprimer `/etc/vidfetch/ci-media-test-profile.json` ; restaurer la sauvegarde de `ci-web-test-guard.json` (empreintes d'origine) | le promoteur revient au profil fermé : `downloads.available` doit être `false` | `vidfetch-promote.py status` → `"profile": "closed"` ; `ready` réussit |
| 5 | **Passerelle** (seulement si son environnement a été modifié) : restaurer l'audience précédente (`VIDFETCH_GATEWAY_ORIGIN`) depuis la sauvegarde, redémarrer la passerelle seule, sans transfert actif | audience d'origine ; SQLite des quotas **conservée** | `/etc/vidfetch` : empreintes = sauvegarde ; PID moteur inchangé |
| 6 | **Vérifications finales** : ports 3000/3001/8788/8789 fermés depuis l'extérieur ; SSH ; sitemap 404 ; 8 accueils 401 ; PID des services protégés ; `nft list table inet vidfetch_https_test_ingress` = table d'origine | | `scripts/ovh/verify-public-test.mjs` |

Si la CI avait déjà été déclenchée entre-temps, un déploiement refusé par le garde est le comportement normal : ne pas le contourner, terminer la procédure ci-dessus.

## À conserver / à traiter ensuite

- **Ne pas supprimer** : anciennes releases, SQLite des quotas, certificats et stockage Caddy, journaux de recette.
- Les fichiers `web.env.bak.*` créés par l'installeur contiennent des secrets (root 0600) : les purger après la recette, une fois le rollback validé.
- Si une clé a pu être exposée : régénérer la Secret Key Turnstile dans Cloudflare ; la clé HMAC se change dans la passerelle **et** le frontend ensemble (invalide les grants en cours, sans effet sur les quotas).
- Cloudflare / DNS : l'enregistrement `dl` et le widget Turnstile peuvent rester (inactifs, sans écoute réseau après l'étape 1). Toute modification DNS demande une autorisation distincte.

## Ordre en cas d'urgence (≤ 1 minute)

Étape 1 seule (ré-appliquer l'ancienne table) ferme `dl` à tous les testeurs ; puis l'étape 2. Les autres étapes peuvent suivre sans urgence.
