# Certificat TLS pour `dl.vidfetch.app` : HTTP-01 ou DNS-01

Étude du 13 octobre 2026. Rien n'est installé ni émis. Le DNS `dl` est déjà en DNS only vers `15.235.127.165`.

## Contraintes

- `dl` doit rester inaccessible aux visiteurs non autorisés : 443 réservé aux IP testeurs (nftables + `remote_ip` Caddy).
- Pas de nouveau binaire non audité, pas de secret DNS large sur le VPS, pas de service payant.
- L'apex garde Basic Auth et noindex ; le proxy Cloudflare ne doit pas être activé sur `dl` (médias volumineux).

## Option A — HTTP-01 (Caddy natif)  **recommandée**

Let's Encrypt valide depuis plusieurs points de vue du réseau, avec des adresses qu'on ne peut pas lister. **Le port 80 doit donc être joignable de partout**, et le rester : Caddy renouvelle environ 30 jours avant l'expiration, port 80 fermé = renouvellement silencieusement en échec.

Exposition réelle mesurée avec Caddy 2.11.7 (même version que le VPS) : sur le port 80, **toute requête**, quel que soit l'hôte (`dl`, apex, hôte inconnu, IP) et le chemin, reçoit uniquement un **308** vers HTTPS, sans corps, sans contact avec Next.js (3001) ni la passerelle (8789). Les médias restent protégés par le 443 (nftables + `remote_ip`).

| Aspect | Évaluation |
|---|---|
| Binaire / dépendances | aucun ajout : Caddy actuel, `disable_tlsalpn_challenge` déjà présent |
| Secret supplémentaire | **aucun** |
| Surface ajoutée | TCP 80 mondial, redirection 308 uniquement |
| Panne | renouvellement impossible si 80 refermé ; à surveiller |
| Rollback | retirer la règle `tcp dport 80 accept` ; le certificat existant reste valide jusqu'à expiration |

Mise en œuvre : générer la table avec `render-ingress.py --open-port-80`, l'appliquer via `public-test/firewall.py apply` (atomique, `nft --check`), recharger Caddy, observer l'émission dans le journal, vérifier la chaîne en TLS strict.

## Option B — DNS-01 via Cloudflare

| Aspect | Évaluation |
|---|---|
| Binaire | nécessite Caddy compilé avec le module `caddy-dns/cloudflare` (xcaddy) : **remplacement du binaire de production**, nouvelle chaîne d'approvisionnement à auditer |
| Secret | jeton API Cloudflare `Zone:DNS:Edit` sur `vidfetch.app` : Cloudflare ne permet pas de le limiter à un seul enregistrement ; **sa fuite permet de modifier tous les DNS de la zone** (rediriger l'apex, intercepter le trafic) |
| Surface réseau | aucun port 80 requis ; 443 reste testeurs-uniquement |
| Atténuation possible | délégation `_acme-challenge.dl` par CNAME vers une zone dédiée, jeton limité à cette zone : plus sûr mais plus de pièces mobiles à créer côté Cloudflare |

## Verdict

**HTTP-01.** Il n'ajoute ni binaire ni secret ; son seul coût est un port 80 qui ne renvoie que des redirections. DNS-01 déplace le risque vers un jeton capable de détourner tout le domaine, ce qui est pire que la surface qu'il évite. Revoir si un durcissement du port 80 devient exigé : alors DNS-01 avec délégation `_acme-challenge` et jeton limité à la zone déléguée.

## Points à ne pas oublier

- Aucun `tls internal`, aucune désactivation de validation TLS.
- Le certificat apparaîtra dans les journaux Certificate Transparency ; le nom `dl.vidfetch.app` est de toute façon public en DNS.
- Premier certificat réussi ≠ renouvellement prouvé : vérifier `caddy` journal à J+30 ou forcer un test avec le staging de Let's Encrypt (`acme_ca`) avant, dans une fenêtre dédiée.
- Stockage Caddy persistant (`/var/lib/caddy` ou équivalent) à sauvegarder avant tout changement.
