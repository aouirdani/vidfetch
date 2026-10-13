# VidFetch — Phase 5 : HTTPS public en mode test protégé

Rapport du **13 octobre 2026**. **Le frontend multilingue est accessible en HTTPS avec authentification obligatoire. Les téléchargements et l'indexation restent fermés.** Aucun push ni changement DNS/Cloudflare, Vercel, Supabase ou Raspberry Pi n'a été effectué.

## 1. État initial et périmètre autorisé

Base Git : `80bc04b57306c2266b301c982b41f6441e13f974`, branche Phase 4 conservée. Nouvelle branche : **`work/vidfetch-public-https-test-20261013`**. Checkout : `backend/artifacts/public-https-20261013/checkout`.

Avant intervention : SSH par clé fonctionnel avec `BatchMode=yes`, `StrictHostKeyChecking=yes` ; Caddy absent des services actifs ; aucune écoute 80/443 ; le domaine et www répondaient 521. Frontends locaux 3000/3001, passerelle 8789 et moteur 8788 actifs. Le seul ruleset nft était celui de sortie du worker. systemd-resolved écoutait déjà sur 5355 et le client DHCP sur 68.

La release applicative reste **`689c592141287a1ca1e45569a89e5d76f18133ed`**, déjà compilée et testée en Phase 4. Aucune reconstruction du frontend ni réinstallation d'un moteur n'était nécessaire. Aucun fichier applicatif, environnement backend ou contenu éditorial n'a changé. Les **87 fichiers** du travail initial et la référence Phase 4 sont inchangés.

## 2. Configuration Caddy appliquée

Chemin actif : `/etc/vidfetch/public-https-test/current`, lien vers `Caddyfile` dans le même répertoire. Sources versionnées : `deploy/ovh/public-test/`.

| Route | Comportement appliqué |
|---|---|
| HTTP apex/www | Redirection 308 vers HTTPS ; challenges ACME gérés par Caddy |
| HTTPS www | Redirection 301 vers `https://vidfetch.app`, chemin et query conservés |
| Pages, assets, `/api/health` | Authentification Basic Caddy puis proxy vers **127.0.0.1:3001** |
| `/api/fetch-info`, `/api/download`, `/api/queue`, `/api/download-access` | **503 BACKEND_UNAVAILABLE**, toutes méthodes testées GET/POST |
| `/auth/transfer`, `/download-helper` | **503 BACKEND_UNAVAILABLE** |
| `/auth/admission`, `/auth/deployment`, `/internal/*` | **404**, aucun proxy vers les services internes |
| `/sitemap.xml` et chemins `/sitemap*` | **404**, même après authentification |
| `/robots.txt` | `User-agent: *` puis `Disallow: /`, aucune référence à un sitemap |

Caddy **2.11.7** existant est conservé. Le nouveau compte système `vidfetch-proxy` est non privilégié, sans shell de connexion. Le service n'accorde que `CAP_NET_BIND_SERVICE`, utilise `NoNewPrivileges`, un système de fichiers protégé, MemoryMax 192 MiB, CPUQuota 50 % et TasksMax 64. Son API d'administration utilise le socket Unix privé `/run/vidfetch-caddy/admin.sock`, pas un port public.

Les réponses portent `X-Robots-Tag: noindex, nofollow`, `Cache-Control: private, no-store, max-age=0`, `nosniff` et la politique Referrer adaptée. Cela inclut les erreurs d'authentification. Les pages Next ne peuvent pas remplacer ces headers par leur cache de prerender. Les réponses authentifiées contrôlées ne sont pas servies depuis un cache Cloudflare HIT ; un nouvel appel anonyme après consultation authentifiée reste 401.

L'en-tête Authorization de l'accès de test est retiré avant le proxy Next.js. Aucun secret de service n'est injecté dans le JavaScript. L'adresse client n'est acceptée via `CF-Connecting-IP` que depuis les 22 plages officielles Cloudflare ; les autres en-têtes d'identité sont remplacés ou retirés. Corps limités à 32 KiB pour le frontend, délais de lecture et de connexion bornés. Aucun endpoint média n'atteint la passerelle.

Pas de journal d'accès Caddy contenant des URL/tickets. Les champs Authorization, Cookie et preuves d'accès sont filtrés dans les logs d'erreur. Le journal contrôlé ne contient ni l'identifiant de test ni son hash. Ce contrôle concerne les journaux du VPS inspectés, pas une inspection des systèmes internes de Cloudflare.

## 3. Certificats HTTPS et Cloudflare

Un bootstrap HTTP sans frontend a confirmé que le chemin ACME atteignait le VPS à travers Cloudflare pour **les deux noms** : HTTP 200 avec contenu de contrôle attendu. Ensuite, Caddy a obtenu deux certificats **Let's Encrypt**, par HTTP-01. TLS-ALPN-01 est désactivé, car le TLS public est terminé par Cloudflare.

| Segment contrôlé | Résultat réel |
|---|---|
| Navigateur/client → Cloudflare, apex et www | Chaîne et nom vérifiés, TLS 1.3, certificat edge expirant le **9 janvier 2027** |
| Client strict local → Caddy, SNI `vidfetch.app` | Chaîne et nom vérifiés avec les autorités système, TLS 1.3, expiration **11 janvier 2027 à 07:41:17 UTC** |
| Client strict local → Caddy, SNI `www.vidfetch.app` | Même contrôle strict, expiration **11 janvier 2027 à 07:41:18 UTC** |
| Émission réelle à l'origine | Deux succès enregistrés dans les logs Caddy |
| Rechargement et redémarrage Caddy | Certificats persistants réutilisés ; HTTPS toujours fonctionnel |
| Maintenance de renouvellement | Démarrée et stockage persistant privé configuré |
| Renouvellement réel d'un certificat arrivant à échéance | **NON TESTÉ** ; aucune expiration ni rotation réelle simulée |

Aucun `-k`, `insecure_skip_verify`, certificat autosigné public ou mode Flexible n'a été utilisé. Les tests navigateur publics conservent la validation TLS normale.

**Limite explicite : le réglage SSL/TLS affiché dans le compte Cloudflare n'a pas été consulté ni modifié.** Une confirmation a été demandée. La réussite publique et la validité de l'origine vérifient les prérequis techniques de Full (strict), mais ne prouvent pas que ce mode est celui actuellement sélectionné. Sa validation définitive reste **BLOQUÉE sur cette confirmation manuelle**. Dans Cloudflare → vidfetch.app → SSL/TLS → Overview, relever le mode sans changer les DNS ; si ce n'est pas Full (strict), planifier sa sélection puis refaire les contrôles 401/301/503. Ne pas choisir Flexible. [Exigences officielles Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/).

Les tests confirment le passage HTTP-01 à l'instant de la recette. Conserver l'accès au challenge sur 80 pour le renouvellement, sans authentification, cache ou challenge WAF ajouté à ce chemin. Caddy gère émission et renouvellement tant qu'il reste actif avec son stockage accessible. [HTTPS automatique Caddy](https://caddyserver.com/docs/automatic-https).

Le proxy DNS est observé par les réponses `server: cloudflare` et `cf-cache-status: DYNAMIC`. Les enregistrements A/CNAME et le TXT Google Search Console n'ont fait l'objet d'aucune écriture. Aucun jeton Cloudflare n'a été créé ou utilisé.

## 4. Ports et pare-feu

Une seule nouvelle table est appliquée : **`inet vidfetch_https_test_ingress`**. La table `vidfetch_egress`, ses chaînes/règles et le filtrage UID du moteur sont inchangés.

- SSH TCP 22 conservé sans restriction nouvelle d'adresse.
- TCP 80/443 acceptés depuis les **15 plages IPv4 et 7 IPv6 Cloudflare** vérifiées auprès des endpoints officiels le 13 octobre.
- Loopback, connexions établies/associées, ICMP/ICMPv6 et réponses DHCP UDP 67→68 préservés pour le fonctionnement réseau.
- TCP 3000/3001/8788/8789 refusés hors loopback. UDP 443 fermé ; Caddy utilise HTTP/1.1 et HTTP/2, Cloudflare peut proposer HTTP/3 à ses visiteurs.
- Les autres nouvelles connexions entrantes sont bloquées. Le listener système 5355 n'a pas été arrêté, mais il n'est plus joignable directement depuis Internet.

Une nouvelle connexion SSH **sans multiplexage** a été réussie après l'application des règles, puis après le redémarrage Caddy. Les contrôles TCP depuis le Mac ont confirmé le refus de 3000/3001/8788/8789, le blocage de 5355 et le refus d'accès direct à 80/443 hors Cloudflare. Le site reste joignable via Cloudflare.

Un retour arrière temporisé de 180 secondes a effectivement retiré la seule nouvelle table avant la confirmation SSH ; il a été déclenché par le délai d'orchestration, pas par une perte de SSH. La seconde application avec une fenêtre de 300 secondes a été immédiatement suivie d'une reconnexion indépendante, puis de l'annulation du timer. Ce premier incident confirme le fonctionnement du garde de retour arrière ; il n'a pas touché au ruleset egress ni aux backends.

Les règles réseau privées OVH n'ont pas été inspectées via le compte fournisseur. Le trafic réel Cloudflare→origine sur 80/443 a néanmoins été validé. Aucun paramètre SSH ni configuration réseau générale n'a été modifié.

## 5. Protection d'accès et utilisation manuelle

Caddy exige un compte de test et un mot de passe aléatoire. Seul un hash **bcrypt coût 12** est stocké sur le VPS, dans `/etc/vidfetch/public-https-test/auth.caddy`, root:vidfetch-proxy, mode 0640, répertoire 0750. Le mot de passe a été transmis au processus de hachage par stdin, jamais dans les arguments de commande.

Le fichier d'accès utilisateur est uniquement sur le Mac, mode **0600**, dans un répertoire privé 0700 :

`backend/artifacts/public-https-20261013/private/frontend-access.json`

Ouvrir ce fichier localement dans un éditeur puis utiliser l'invite d'authentification de **https://vidfetch.app**. Les valeurs ne sont pas présentes dans ce rapport, Git, les commandes enregistrées ou les journaux produits par les scripts. Ne pas incorporer les identifiants à une URL. Le frontend n'est pas un accès anonyme public ; toute personne disposant de ce compte peut consulter la recette et le compte devra être révoqué ou renouvelé à la fin de celle-ci.

Sans identifiants : **401**, y compris les assets et `/api/health`. Un mot de passe incorrect donne aussi 401. Après authentification : pages 200, erreurs compréhensibles lorsque l'outil est utilisé. Les médias restent 503 indépendamment des identifiants. La sécurité ne dépend pas de robots.txt. [Authentification Basic de Caddy](https://caddyserver.com/docs/caddyfile/directives/basic_auth).

## 6. Recette publique des huit langues

Recette authentifiée terminée le **13 octobre, de 08:50:20 à 08:50:59 UTC**. Aucun téléchargement réel n'a été lancé dans cette phase.

| Langue | Route | HTML serveur / mobile / sélecteur / canonical / hreflang / noindex / 404 |
|---|---|---|
| en | `/` | **VALIDÉ** |
| fr | `/fr/` | **VALIDÉ** |
| es | `/es/` | **VALIDÉ** |
| pt-BR | `/pt/` | **VALIDÉ** |
| id | `/id/` | **VALIDÉ** |
| de | `/de/` | **VALIDÉ** |
| it | `/it/` | **VALIDÉ** |
| ar | `/ar/` | **VALIDÉ**, RTL réel, champ URL LTR, absence de débordement |

Les huit H1, langues HTML et directions ont été contrôlés sur le HTML serveur. Les neuf alternates par accueil (huit langues + x-default) pointent vers leurs équivalents et sont réciproques. La navigation et les sélecteurs ont été exercés sur mobile. Les huit essais de l'outil affichent l'indisponibilité localisée. Les 404 sont réelles et localisées, sans canonical racine indue. Aucun événement `pageerror` pendant la recette.

Les tests ont aussi confirmé :

- HTTP apex et www → HTTPS : **308** ; HTTPS www → apex : **301**, chemin et query préservés.
- Authentification absente/incorrecte : **401** ; headers noindex et no-store sur les refus.
- Sitemap : **404**, avec ou sans authentification ; robots sans lien Sitemap.
- Douze requêtes GET/POST sur les six routes média : **503**, code JSON `BACKEND_UNAVAILABLE`.
- Endpoints internes : **404**.
- Les exemples de traduction et page YouTube en relecture restent **404** ; les 70 traductions n'ont pas été publiées et aucun contenu éditorial n'a été modifié.
- Après consultation authentifiée, une nouvelle requête anonyme reste **401** : aucune page privée réutilisée depuis le cache public constatée.
- **Absence de 521** durant la recette réussie et les contrôles après redémarrage.

Les validations Phase 4 concernant les 38 pages, les dix guides anglais et les fixtures vidéo/MP3 restent conservées. Elles ne sont pas présentées comme des téléchargements publics désormais ouverts.

## 7. Santé, démarrage et ressources

| Service | État final | Effet de cette phase |
|---|---|---|
| `ssh.service` | Actif, PID **869** | Inchangé ; reconnexions strictes réussies |
| `vidfetch.service` | Actif, PID **9270** | Inchangé ; moteur sain en loopback |
| `vidfetch-gateway.service` | Active, PID **9271** | Inchangée ; aucun accès média public |
| `vidfetch-web-candidate.service` | Actif, PID **12561**, boot disabled | Secours local 3000 préservé |
| `vidfetch-web-preproduction-20261013.service` | Actif, PID **25013**, **enabled** | Démarrage activé seulement après recette réussie ; unité et release inchangées |
| `vidfetch-caddy.service` | Actif, **enabled** | Compte dédié, proxy protégé 3001, restart ciblé réussi |
| `vidfetch-https-test-ingress.service` | Active (oneshot), **enabled** | Dépendance obligatoire de Caddy |

Le frontend est maintenant activé au démarrage. Les dépendances ont été vérifiées : Caddy exige le garde réseau et le frontend 3001 ; Node et la release existent ; les certificats et le hash d'accès sont persistants avec des permissions adaptées. **Aucun reboot du VPS n'a été effectué** : un démarrage après reboot réel reste NON TESTÉ.

Après restart ciblé Caddy : root 401, www 301 et média 503, frontend local sain. Les certificats d'origine restent strictement valides. Les **13 empreintes de fichiers préexistants**, les PID protégés, le pointeur de l'ancien frontend et les règles nft existantes correspondent à l'audit initial. Aucun processus yt-dlp/ffmpeg/ffprobe trouvé à la fin.

Fenêtre de mesure de **90,009 secondes**, **359 échantillons**, contenant toute la recette publique réussie :

| Ressource | Mesure |
|---|---:|
| Maximum combiné échantillonné frontend + Caddy | **97,20 MiB** |
| Pics individuels échantillonnés | Frontend **74,43 MiB**, Caddy **23,34 MiB** |
| CPU cumulé sur la fenêtre | Frontend **4,406 s**, Caddy **0,644 s** |
| Pic CPU sur un court intervalle, un cœur = 100 % | Frontend **63,42 %**, Caddy **8,40 %** |
| RAM disponible après recette/restart | **3 253 MiB** sur 3 826 MiB |
| Stockage disponible | **35 Go** affichés par `df -h` ; aucun swap ajouté |

Ces mesures concernent une recette courte de pages protégées, sans conversions ni téléchargement. Elles ne constituent pas un benchmark de capacité de production. La première fenêtre, liée au test interrompu par une assertion trop stricte, n'est pas utilisée pour ce bilan.

## 8. Sauvegardes, changements et rollback

Sauvegarde privée VPS : **`/var/backups/vidfetch-public-https-20261013-uNFJxuZ9`**, root 0700. Elle conserve `/etc/vidfetch` avant intervention, les unités concernées, l'inventaire des états/PID/empreintes et le ruleset initial. Les versions intermédiaires Caddy et leurs diagnostics y sont conservés. Anciennes releases, fichiers de test Phase 4 et checkout précédent ne sont pas supprimés.

Nouveaux éléments : compte `vidfetch-proxy`, répertoire `/etc/vidfetch/public-https-test`, état `/var/lib/vidfetch-proxy`, socket privé sous `/run/vidfetch-caddy`, deux unités dédiées et `/usr/local/libexec/vidfetch-https-test-firewall`. Le seul état permanent d'un service précédent modifié est l'activation au démarrage du frontend 3001.

Pour retirer entièrement l'exposition de test et retrouver le frontend privé initial, exécuter sur le VPS après décision de rollback :

```sh
sudo systemctl disable --now vidfetch-caddy.service
sudo systemctl disable vidfetch-web-preproduction-20261013.service
sudo systemctl disable --now vidfetch-https-test-ingress.service
sudo python3 /usr/local/libexec/vidfetch-https-test-firewall rollback
```

Le frontend 3001 reste actif en loopback mais n'est plus activé au boot. Le helper arrête Caddy et retire **uniquement** la table de cette phase. Il ne vide pas le ruleset, ne restaure pas aveuglément une table globale, ne touche pas à SSH et ne redémarre aucun backend. Cette suppression de la table revient aussi à l'état réseau antérieur du listener 5355 ; si l'on souhaite conserver le durcissement réseau, arrêter uniquement Caddy et garder le garde ingress.

Vérifier ensuite une nouvelle connexion SSH, les `/api/health` locaux sur 3000/3001/8788, les PID moteur/passerelle et l'absence d'écoute 80/443. Conserver les certificats, identifiants, fichiers et sauvegardes pour réversibilité ; aucune release à effacer, aucun DNS à modifier. L'état public redeviendra volontairement indisponible, sans bascule automatique vers Vercel.

Le rollback temporisé de la table a été réellement exécuté ; l'arrêt/reprise de Caddy et la conservation des services ont aussi été vérifiés. **La procédure complète finale, avec désactivation de tous les nouveaux états de boot, n'a pas été rejouée**, afin de laisser le site de test demandé accessible.

## 9. GitHub Actions et actions manuelles restantes

Audit GitHub en lecture seule : listes des secrets repository, des variables repository et des secrets de l'environnement Production **vides**. Aucun workflow lancé. Secrets CI à provisionner ultérieurement : **`OVH_DEPLOY_SSH_KEY`** et **`OVH_DEPLOY_KNOWN_HOSTS`**. Ne pas y copier les identifiants Basic de cette recette. La variable **`VIDFETCH_DEPLOY_ENABLED`** reste absente et le garde root `/etc/vidfetch/full-migration-ready` reste absent.

Le workflow préparé n'a pas changé. La partie validation/build reste compatible avec la release inchangée. **La promotion automatique ne doit pas être activée dans cette configuration de test** : elle cible le frontend permanent 3000 et le pointeur commun, tandis que Caddy sert ici le candidat protégé 3001. Avant activation CI, il faudra approuver la migration des services/pointeurs et du drain, adapter la cible Caddy, relire les protections de l'environnement, installer la clé CI dédiée et effectuer un véritable déploiement/rollback contrôlé. Le mode test ne contourne aucune de ces conditions.

Actions manuelles restantes :

1. Consulter le site avec les identifiants du fichier local privé et confirmer la recette fonctionnelle/éditoriale.
2. Confirmer le réglage **Full (strict)** dans Cloudflare et conserver le passage HTTP-01 lors des évolutions WAF/cache/redirections. Aucun changement DNS requis par la configuration appliquée.
3. Observer et superviser un renouvellement réel avant d'en annoncer la validation. La maintenance automatique est configurée ; le journal peut être consulté par l'administrateur sans publier son contenu brut.
4. Décider séparément de la fin de la protection de test et de l'indexation. Ne pas enlever l'authentification/noindex ni publier les articles en relecture pendant cette phase.
5. Résoudre dans une mission distincte les secrets/origines du parcours de téléchargement et les conditions du transport média via Cloudflare Proxied. Les téléchargements restent fermés ; aucun contournement YouTube n'a été tenté.
6. Configurer puis valider CI/CD seulement après approbation dédiée. Aucun push ni fusion ici.

## 10. Matrice de validation et preuves

Preuves privées : `backend/artifacts/public-https-20261013/`. Résumé versionné sans secrets : `backend/validation/public-https-20261013.json`. Les identifiants, certificats privés, médias et journaux bruts ne sont pas ajoutés à Git.

| Contrôle | Statut | Preuve / limite |
|---|---|---|
| Audit initial et sauvegarde | **VALIDÉ** | `vps-before.json`, sauvegarde root privée |
| Connexions SSH strictes avant/après firewall et restart | **VALIDÉ** | Reconnexions indépendantes sans multiplexage |
| Configurations Caddy/systemd/nft | **VALIDÉ** | Validation avant activation, ruleset dédié, unités actives |
| HTTP-01 via Cloudflare, deux noms | **VALIDÉ** | `http01-reachability.txt`, deux émissions dans les logs |
| Certificats publics edge et origine | **VALIDÉ** | `public-tests-v2.json`, `vps-final.json`, validation stricte |
| Réglage réel Full (strict) dans le compte | **BLOQUÉ** | Confirmation manuelle non reçue ; aucun accès au tableau Cloudflare |
| Huit langues, RTL, SEO, navigation et 404 | **VALIDÉ** | `public-tests-v2.json`, huit parcours réussis |
| Authentification, noindex, cache privé, sitemap fermé | **VALIDÉ** | 401 anonyme/incorrect, huit HTML 200 protégés, sitemap 404 |
| Routes média et internes | **VALIDÉ** | Douze 503, internes 404, aucun téléchargement lancé |
| Redirections et absence de 521 | **VALIDÉ** | 308/301, réponses après restart 401/301/503 |
| Ports internes et accès direct hors Cloudflare | **VALIDÉ** | `public-ports.json` |
| Préservation backend/passerelle/fichiers/egress | **VALIDÉ** | `vps-final.json`, 13 empreintes et PID inchangés |
| CPU/RAM de la recette | **VALIDÉ** | `resources-public-tests.json`, périmètre limité |
| Activation au boot et dépendances | **VALIDÉ** | enabled après tests ; aucun reboot réalisé |
| Démarrage après reboot réel | **NON TESTÉ** | Aucun reboot autorisé/exécuté |
| Renouvellement réel | **NON TESTÉ** | Maintenance démarrée, certificats nouvellement émis |
| Rollback complet de fin de test | **NON TESTÉ** | Garde temporisé et restart validés, procédure documentée |
| Déploiement GitHub Actions | **NON TESTÉ / désactivé** | Secrets et gates absents ; pas de push |
| Première validation de syntaxe ACME | **ÉCHEC corrigé** | Propriété `ca` remplacée par `dir` dans l'issuer avant toute émission |
| Première assertion canonical publique | **ÉCHEC du test corrigé** | Normalisation d'URL équivalentes ; aucune modification SEO nécessaire |

ESLint, syntaxe Python, contrôle des fichiers/secrets et `git diff --check` réussis. Les tests applicatifs et builds Phase 4 sont conservés puisque les sources frontend/backend et dépendances sont inchangées ; ils n'ont pas été inutilement rejoués. Les seules corrections de cette phase portent sur la préparation Caddy et ses tests. Le site reste volontairement en **recette protégée**, sans moteur public ni indexation.
