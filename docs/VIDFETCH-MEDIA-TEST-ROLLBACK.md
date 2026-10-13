# Rollback complet du dispositif « media-test »

Procédure d'administrateur, **non exécutée et non testée sur le VPS** (aucun accès VPS dans cette mission). Elle suppose les sauvegardes horodatées prévues à l'étape 2 du plan d'activation (`docs/VIDFETCH-PHASE9-ACTIVATION.md` §G). Garder une seconde session SSH ouverte pendant toute la procédure. **Ne jamais utiliser `firewall.py rollback` pour ce retour arrière** : il arrête Caddy et supprime toute la table d'ingress (l'apex disparaît aussi). On restaure l'ancienne table à la place.

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
