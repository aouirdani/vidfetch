# VidFetch — préparation des téléchargements MP4/MP3

Recette du **13 octobre 2026**, Phase 8. Branche locale `work/vidfetch-media-preparation-20261013`, dérivée de `f23ca65b0865ed771bf80a95de8e2a0de1ba45f1`. Checkout isolé : `backend/artifacts/media-preparation-20261013/checkout` dans le dépôt principal.

**La release publique demeure `f23ca65b0865ed771bf80a95de8e2a0de1ba45f1`. Aucun déploiement public, changement DNS, secret ou service permanent. Basic Auth, noindex et médias 503 conservés.** Les fixtures temporaires sont arrêtées ; leurs fichiers sont conservés. Les modifications frontend ci-dessous sont locales.

## 1. Architecture proposée

```text
Navigateur → HTTPS vidfetch.app → Cloudflare Proxied → Caddy → Next.js :3001
                  │ Basic Auth + Turnstile + session de test
                  └ POST /api/download-access
                       Next.js → HMAC → passerelle 127.0.0.1:8789 /auth/admission
                       ← grant court lié à la clé P-256 du navigateur

Navigateur → HTTPS dl.vidfetch.app (DNS only) → Caddy → passerelle :8789
                Bearer + preuve P-256 → métadonnées / préparation / statuts
                helper + cookie hôte + ticket unique → fichier natif
                                                          ↓
                                               moteur 127.0.0.1:8788
                                                  yt-dlp / ffmpeg
```

Les octets médias circulent directement entre le navigateur et OVH, sans Next.js, Vercel ni le CDN Cloudflare. Seules les petites demandes d'autorisation traversent le site. Le proxy Cloudflare ne doit pas être réactivé sur `dl` sans nouvelle vérification contractuelle : les services CDN comportent des restrictions pour les vidéos et gros fichiers. [Conditions Cloudflare](https://www.cloudflare.com/service-specific-terms-application-services/).

DNS only rend l'adresse OVH publique : **ce n'est pas une protection**. Les contrôles applicatifs, les limites et le pare-feu restent nécessaires. Un téléchargement public anonyme n'est pas autorisé par cette mission.

## 2. État des services et raisons de la fermeture

| Élément | État observé, inchangé |
|---|---|
| Frontend multilingue | actif, 127.0.0.1:3001, PID 45511 |
| Passerelle | active, 127.0.0.1:8789, PID 9271 |
| Moteur | actif, 127.0.0.1:8788, PID 9270 |
| Caddy | actif, PID 39987 ; Basic Auth + noindex |
| SSH | actif, PID 869 ; reconnexions strictes réussies |
| Ancien frontend | 127.0.0.1:3000 préservé |

Fermetures cumulées :

1. Caddy répond **503 BACKEND_UNAVAILABLE** sur `/api/fetch-info`, `/api/download`, `/api/queue`, `/api/download-access`, `/auth/transfer`, `/download-helper`.
2. `VIDFETCH_CONNECTION_READY=0` dans le frontend ; clés d'autorisation/Turnstile absentes de son environnement.
3. Routes médias Next.js volontairement dégradées : elles ne transportent pas les fichiers. Elles resteront 503 sur le domaine du site, même avec le futur parcours direct.
4. La passerelle attend encore `https://api.vidfetch.app`, pas `https://dl.vidfetch.app`.
5. Pas d'adresse A constatée pour `dl.vidfetch.app` ; ingress 80/443 limité aux plages Cloudflare.

Sept empreintes de configuration et cinq PID protégés comparés avant/après : **identiques**. Aucun redémarrage de ces services.

## 3. DNS et pare-feu à préparer manuellement

Après autorisation distincte seulement : créer **A `dl` → `15.235.127.165`, DNS only**. Conserver les enregistrements apex/www et le TXT Search Console ; ne pas ajouter d'AAAA tant que l'IPv6 n'est pas validé.

L'ingress actuel n'accepte 80/443 que depuis Cloudflare. Le flux direct `dl` serait donc refusé. Une adaptation administrative doit autoriser TCP 443 pour les testeurs, puis éventuellement le public après une autre validation, et TCP 80 pour HTTP-01. Aucun besoin d'ouvrir 3000, 3001, 8788 ou 8789. Conserver SSH et l'egress UID du moteur.

Le pare-feu ne distingue pas les noms d'hôte HTTPS. Le modèle Caddy ajoute donc un refus d'accès direct à l'apex hors plages Cloudflare, en complément de Basic Auth. Vérifier les plages officielles avant application. Préparer une sauvegarde nft, `nft -c` et une seconde connexion SSH avant une modification ; ne pas remplacer aveuglément la table actuelle. Aucun changement nft réalisé ici.

## 4. Configuration Caddy préparée

Fichier **`deploy/ovh/media/Caddyfile.test-only`**, non installé. Analyse avec **Caddy 2.11.7 : VALIDÉ** (`adapt`, pas démarrage ni émission ACME).

- Apex : Basic Auth et noindex conservés ; autorise uniquement le passage de `/api/download-access` à Next.js. Autres routes médias du site toujours 503 ; administration/sitemap toujours fermés.
- `dl` : liste exacte des routes publiques utiles ; `/api/health`, `/auth/admission`, `/auth/deployment` et routes inconnues non exposées.
- Accès de recette limité par `VIDFETCH_MEDIA_TEST_IPS`. La valeur de secours `192.0.2.1/32` refuse tous les vrais visiteurs. Renseigner les IP publiques des testeurs dans une configuration administrative distincte ; ne pas mettre Basic Auth devant les requêtes Bearer de la passerelle.
- IP transmise à la passerelle = pair TCP réel (`remote_host`), jamais un `X-Forwarded-For` ou `CF-Connecting-IP` fourni par le visiteur. Les contrôles du site utilisent uniquement les proxies Cloudflare déclarés fiables.
- Corps médias ≤8 KiB ; connexion amont 3 s ; attente des en-têtes 240 s. Pas de compression ni buffering complet du flux média ; annulation amont conservée.
- `noindex`, cache privé et Referrer-Policy sans référent sur les médias ; pas de journal d'accès contenant tickets/URL. Autorisation, Cookie et preuves filtrés dans les erreurs.
- HTTPS ACME HTTP-01 prévu pour `dl` ; certificat public **NON TESTÉ / BLOQUÉ par DNS et activation non autorisés**. Ne pas utiliser `tls internal` pour le public, ni désactiver la validation TLS.

Les limites de transfert restent applicatives : 10 minutes/256 MiB. Ne pas ajouter `flush_interval -1`, qui change la propagation de l'annulation du client. [Reverse proxy Caddy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [proxies de confiance](https://caddyserver.com/docs/caddyfile/options#trusted-proxies).

## 5. Secrets et configuration applicative

Audit de **présence uniquement**, sans lecture affichée des valeurs :

| Nom | Actuel | Action future |
|---|---|---|
| `VIDFETCH_ACCESS_SIGNING_KEY` | présente dans la passerelle ; absente du frontend | fournir au frontend la même clé dédiée, côté serveur uniquement, après accord |
| `TURNSTILE_SITE_KEY` | absente du frontend | clé publique du widget ; runtime OVH |
| `TURNSTILE_SECRET_KEY` | absente du frontend | clé privée Siteverify côté serveur |
| `VIDFETCH_MEDIA_ORIGIN` | absente du frontend | `https://dl.vidfetch.app` |
| `VIDFETCH_CONNECTION_READY` | `0` | conserver 0 jusqu'à recette/configuration complètes |
| `VIDFETCH_GATEWAY_ORIGIN` | ancien domaine `api` | changement administratif vers `dl`, avec contrôle d'audience |
| `VIDFETCH_SITE_ORIGINS` | domaine officiel | conserver une liste exacte, sans joker |
| `VIDFETCH_PRIVATE_BACKEND` | loopback moteur | conserver |
| `VIDFETCH_QUOTA_DB` | SQLite persistante existante | préserver ; ne pas réinitialiser les quotas |

`deploy/ovh/web.env.example` et `deploy/ovh/media/gateway.env.changes.example` sont des modèles sans secrets. Ne jamais copier un modèle entier par-dessus un fichier existant. Permissions attendues des fichiers d'environnement : root, 0600.

Aucune nouvelle clé réelle générée ; les clés aléatoires de la recette sont exclusivement éphémères, distinctes des services. Les fichiers TLS de test sont hors Git, privés. Supabase et ses secrets restent inchangés. Aucune fausse `DATABASE_URL`.

## 6. Turnstile et autorisations navigateur

Le code préparé vérifie `success`, le **hostname exact** et l'action **`vidfetch`** côté serveur. Endpoint Siteverify fixé, redirections refusées, délai 8 s, réponse ≤16 KiB et token ≤2048 caractères. Réponse invalide, panne ou délai : échec fermé 503 ; challenge refusé/expiré : nouvelle vérification demandée. L'UI traduit les erreurs existantes et traite aussi l'expiration du widget.

Les tokens Turnstile sont à usage unique, valables cinq minutes selon Cloudflare ; la session applicative existante dure au maximum 30 minutes, sans prolongation glissante, et les grants 120 secondes. Une preuve P-256 signe méthode, chemin, corps, grant, horodatage et nonce ; la clé privée navigateur n'est pas exportable. [Validation serveur Turnstile](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

Configuration manuelle future : Cloudflare Dashboard → Turnstile → créer un widget Managed pour `vidfetch.app` ; reporter les deux clés par un canal privé dans l'environnement serveur. La clé de site est publique ; **ni la clé Siteverify ni la clé HMAC ne vont dans `NEXT_PUBLIC_*` ou les secrets de build CI**. Garder la validation hostname/action même avec les domaines autorisés du widget.

**NON TESTÉ : widget réel et Siteverify avec une vraie clé.** Les tests utilisent un vérificateur simulé, explicitement identifié. Ils ne constituent pas une validation anti-bot réelle. [Tests Turnstile](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

### CORS, cookies et tickets

Les deux hôtes HTTPS sont de même site mais d'origines différentes. CORS autorise seulement `https://vidfetch.app`, les méthodes attendues et les en-têtes Bearer/preuve ; aucun joker ni cookie interorigine nécessaire aux appels JSON. CORS n'est pas une authentification.

Le helper s'ouvre sur `dl`, n'accepte que le bon opener et l'origine prévue, puis obtient un cookie Secure/HttpOnly/SameSite=Strict limité à cet hôte et au chemin `/api/download`. Pas de `Domain=.vidfetch.app`. Le navigateur effectue un téléchargement natif, sans Blob de la vidéo entière. Le ticket seul ne suffit pas : propriétaire, preuve préalable, cookie et IP sont vérifiés. Le cookie du site reste host-only. [Attributs des cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

Tickets : 55 s passerelle / 60 s moteur, consommation atomique unique ; statuts propriétaires pendant 30 min, plafond 256. Le cookie de transfert n'est créé qu'une fois ; rejouement et vols du seul token sont refusés. Un changement d'IP mobile peut invalider le transfert ; XSS ou compromission complète du navigateur reste un risque distinct.

## 7. Modifications locales et tests MP4/MP3

- Configuration média centralisée (`src/server/media-config.ts`) ; origine HTTPS publique fournie au navigateur par GET `/api/download-access`, sans clés privées.
- Client API et widget adaptés à cette origine runtime ; la même release frontend peut rester désactivée ou viser le domaine validé.
- Autorisation signée avec l'audience `dl`, admission HMAC sur **destination loopback fixe** ; contrôle authentifié de disponibilité/drain de la passerelle dans la santé frontend.
- Siteverify borné dans `src/server/turnstile.ts` ; tests de configuration, origine et erreurs.
- Recette OVH séparée (`backend/ovh/media-fixture.ts`, `media-validation.ts`), jamais importée dans les bundles production.
- Vérification publique réutilisable avec `VIDFETCH_EXPECTED_RELEASE` ; valeur historique conservée par défaut.

### Transferts réellement observés sur OVH

| Test | Résultat |
|---|---|
| MP4 W3C, trailer Big Buck Bunny | **VALIDÉ** : 11 053 871 octets, H.264 + AAC, 33,002667 s ; décodage complet ffmpeg ; statut completed ; octets identiques au fichier ; rejeu 404 |
| MP3 depuis trailer officiel Blender OGV | **VALIDÉ** : 792 620 octets, MP3 192 kb/s, 33,024 s ; préparation + transfert + décodage en 3,925 s ; completed et rejeu 404 |
| Première conversion depuis W3C | **ÉCHEC source** : yt-dlp reçoit HTTP 403. Son fallback tente ensuite YouTube et rencontre l'anti-bot. Aucun cookie/proxy/contournement ajouté ; fixture corrigée pour déclarer sa véritable URL source |
| Déconnexion du client | **VALIDÉ** sur OVH : statut aborted, jamais completed |
| Ticket non consommé | **VALIDÉ** sur OVH avec délais réels : expiration 55/60 s, attente 62 s, statut expired, accès refusé |
| Concurrence | **VALIDÉ** : seconde opération du même acteur/IP refusée 429 ; file bornée testée séparément avec charge synthétique |
| Anonyme, CORS hostile, ticket volé/rejoué | **VALIDÉ** par recette et suites passerelle |
| Rétention 30 min | configuration auditée ; purge/propriété validées avec horloge/délais raccourcis ; pas d'attente réelle de 30 min cette phase |

SHA-256 MP4 : `b2ded9ae5a20fa36ca8cec49ef923bffb5e1a51d9e8c1f8336273d2fa9d35ff0`.
SHA-256 MP3 : `38b23dc423846fff16d0d88950390ace9e9d3152d871ea8d0d0f9f676bd69ecf`.

Licence/source : **(c) copyright 2008, Blender Foundation / www.bigbuckbunny.org**, CC BY 3.0 ; [licence officielle](https://peach.blender.org/about/), [trailer](https://peach.blender.org/trailer-page/). MP4 : `media.w3.org/2010/05/bunny/trailer.mp4` ; source audio finale : `download.blender.org/peach/trailer/trailer_400p.ogg`.

**Périmètre précis :** vrais yt-dlp/ffmpeg et vrai flux HTTPS loopback sur OVH, certificat de fixture explicitement approuvé par le client (validation TLS maintenue), UID nft inchangé. Métadonnées injectées uniquement dans le moteur de test ; challenge simulé ; grants/preuves/tickets réels. Ce n'est ni une extraction YouTube réussie, ni le parcours public Next → Turnstile → `dl`. Aucun mode de contournement SSRF ajouté au moteur.

Premiers essais de recette : erreurs du client TLS local et mauvais champ de formats dans le test, corrigés ; aucune modification du moteur opérationnel. Les journaux/fixtures des essais échoués sont conservés. Les unités temporaires en état failed n'ont plus de processus.

## 8. Plateformes : aucun succès inventé

| Plateforme | Métadonnées | Formats | Vidéo | MP3 | Limitation / décision |
|---|---|---|---|---|---|
| YouTube | **ÉCHEC** anti-bot observé dans diagnostic ; blocage déjà connu | non obtenus | non validé | non validé | aucun contournement ; pages promettant cette fonction restent non publiables |
| Shorts | **NON TESTÉ** séparément | non testé | non testé | non testé | ne pas extrapoler du trailer de fixture |
| TikTok | **NON TESTÉ** | non testé | non testé | non testé | URL autorisée du testeur non fournie |
| Instagram | **NON TESTÉ** | non testé | non testé | non testé | URL autorisée non fournie ; privé/authentifié non pris en charge par cette recette |
| X/Twitter | **NON TESTÉ** | non testé | non testé | non testé | URL autorisée non fournie |

Les huit langues restent présentes ; aucun article en relecture ni nouvelle page SEO de plateforme publié. La recette valide les mécanismes, pas une compatibilité universelle des plateformes.

## 9. Sécurité, limites et ressources

Protections existantes conservées : URL utilisateur limitée aux plateformes reconnues ; DNS et adresses privées/réservées refusées ; validation des formats/fragments (32 hôtes, profondeur 12, 30 000 éléments) ; pas de shell pour les moteurs ; noms de fichiers/en-têtes nettoyés ; groupe de processus arrêté à l'annulation.

Les redirections et requêtes secondaires yt-dlp/ffmpeg ne sont pas toutes épinglées par le DNS applicatif. La barrière effective contre un rebinding ou une redirection privée est donc **l'egress nft du UID moteur** : IPv4 privé interdit, IPv6 interdit, DNS vers résolveur fixé, TCP public 80/443 seulement, aucune capacité, NoNewPrivileges. Son fichier et le profil d'isolation sont root-controlled. Les redirections Instagram partagées restent bornées au même service. Ne pas retirer cette isolation ; des hôtes CDN publics demeurent nécessaires. Le worker n'est accessible qu'en loopback.

Limites actuelles :

- Une opération moteur ; file de 2 attentes, 180 s maximum, doublon acteur/IP refusé.
- 120 requêtes/min/IP, 20 opérations/10 min/IP et sujet ; admission 10/min/IP.
- 8 téléchargements et 1 GiB/jour par IP **et** sujet, 100 téléchargements et 4 GiB/jour globalement. Réservation conservatrice, même après crash ; compteurs persistants bornés.
- 256 MiB par transfert, 30 min de durée du média, 10 min d'opération ; premier morceau 90 s, inactivité 30 s ; métadonnées ≤2 MiB, corps ≤8 KiB.
- 2 MiB/s maximum passerelle installée ; recette volontairement ralentie à 512 KiB/s pour observer le flux. Backpressure et mémoire bornée conservées.

| Mesure cgroup | Observation |
|---|---|
| Pic worker pendant MP4 | 87,47 MiB |
| Pic worker recette OGV/MP3 + interruption/expiration | 83,51 MiB |
| CPU cumulé de cette recette worker | 5,34 s CPU ; pas un pourcentage instantané |
| Pic passerelle + client de recette MP3 | 34,59 MiB ; 1,744 s CPU cumulé |
| RAM disponible VPS après recette | 3 229 MiB |
| Disque disponible | 35 GiB affichés ; aucun swap ajouté |
| Nettoyage | aucun yt-dlp/ffmpeg/ffprobe résiduel ; 18888/18889/18443 libérés |

Ces quelques fixtures ne prouvent aucune capacité de production en visiteurs/jour. Les ressources des services permanents sont consignées dans les preuves ; leurs PID et configurations restent inchangés.

### Contrôles exécutés

| Contrôle | Résultat |
|---|---|
| ESLint / TypeScript / diff whitespace | **VALIDÉ** |
| Tests unitaires | **VALIDÉ**, 133 |
| Backend | **VALIDÉ**, 17 |
| Passerelle HTTPS/auth/tickets | **VALIDÉ**, 2 suites |
| File/charge progressive synthétique | **VALIDÉ**, 4 |
| Déploiement/intégrité/rollback Python | **VALIDÉ**, 27 |
| Build Next.js Linux x64 Node 22.23.3 | **VALIDÉ**, standalone, 43 pages générées, 1 686 fichiers contrôlés |
| Build Mac | **VALIDÉ** après conservation/remplacement du symlink node_modules et du cache sandbox en erreur |
| Bundles backend `node --check` | **VALIDÉ** lors du build Linux ; hashes identiques à ceux du manifeste actif |
| HTML serveur/SEO/8 langues/RTL/mobile | **VALIDÉ**, 38 pages, sitemap 16 entrées, 8 téléchargements UI synthétiques avec helper |
| HTTPS public existant | **VALIDÉ**, 8 accueils protégés, canonical/hreflang/navigation/404 ; 12 médias 503 ; TLS strict, pas de 521 |
| Secrets et fichiers à versionner | **VALIDÉ**, aucun résultat du scanner ; aucune clé privée/configuration interne trouvée dans le JS client |
| Caddy candidat | **VALIDÉ** syntaxe uniquement |
| Rechargement réel du futur Caddy / rollback public média | **NON TESTÉ**, aucun changement public autorisé |
| Turnstile réel et E2E public `dl` | **BLOQUÉ**, configuration manuelle/autorisation manquantes |

## 10. CI/CD

Workflow inchangé : build Linux sur GitHub, release immuable, même archive vérifiée réutilisée en deploy, aucune reconstruction ni écrasement. Les nouveaux tests `tests/*.test.ts` sont pris automatiquement. Les fixtures manuelles OVH ne sont ni un composant de release ni lancées par CI.

Secrets Production constatés par **leurs noms uniquement** : `OVH_DEPLOY_SSH_KEY`, `OVH_DEPLOY_KNOWN_HOSTS`. `VIDFETCH_DEPLOY_ENABLED=true` et garde frontend ouvert, conservés conformément à l'état de départ. Aucun push ni workflow déclenché.

**Attention : le promoteur actuel exige `downloads.available=false` et protège les empreintes de Caddy/environnements/services.** Changer simplement ready=1 ou Caddy entraînerait un refus/rollback CI. Le compte `vidfetch-deploy` peut promouvoir le frontend seulement ; il ne doit pas acquérir automatiquement des droits sur Caddy, moteur, passerelle ou secrets.

Avant toute recette média active : prévoir une révision administrative du profil de santé et du garde, tests associés, empreintes actualisées après revue. Conserver Basic/noindex, le refus anonyme et le blocage des médias sur l'apex. Faire les opérations backend/Caddy via l'administrateur, séparément de l'artefact frontend. **Ne jamais contourner le garde en le supprimant.**

## 11. Procédure d'activation contrôlée, à autoriser

1. Relire cette branche et les preuves ; confirmer des URL médias autorisées et les IP de test. Ne pas annoncer YouTube compatible. Aucune fusion/push effectués ici.
2. Planifier un créneau, désactiver temporairement la variable de déploiement et fermer le garde frontend par la procédure administrative existante, en sauvegardant son état. Ces actions restent à faire, elles n'ont pas été appliquées.
3. Sauvegarder les fichiers d'environnement, Caddy, nft, garde et pointeur frontend dans un nouveau répertoire root privé horodaté ; relever les hashes et PID. Conserver une session SSH ouverte et vérifier une deuxième connexion.
4. Préparer/revoir le profil CI « recette médias » et ses tests sans élargir le compte SSH CI. Déployer d'abord le frontend validé **avec ready=0** selon le flux validate → verify → deploy et son artefact exact. Nouvelle autorisation nécessaire pour ce déploiement.
5. Créer manuellement le DNS `dl` DNS only ; vérifier résolution/absence d'AAAA inadapté. Créer le widget Turnstile et fournir les valeurs en privé. Ne rien saisir dans Git ou dans une commande journalisée.
6. Administrateur : fusionner les seules variables nécessaires dans les environnements, conserver clé HMAC/quotas existants, changer l'audience de passerelle en `dl`. Redémarrage ciblé de la passerelle uniquement après accord et absence d'opération active ; contrôler santé authentifiée et isolation.
7. Réviser ingress et Caddy candidat ; définir `VIDFETCH_MEDIA_TEST_IPS`, vérifier `caddy adapt`, `caddy validate` et `nft -c`. Exclure administration et santé interne. Appliquer seulement après validation ; confirmer SSH et ports internes toujours fermés.
8. Obtenir le certificat public `dl` via HTTP-01, vérifier chaîne/hostname/date avec validation TLS stricte, redirection HTTP→HTTPS et stockage/renouvellement persistant. Ne pas déduire un renouvellement réel d'un premier certificat réussi.
9. Activer ready=1 pour la **recette protégée** seulement après cohérence site/gateway/clé/Turnstile/domaine. Redémarrer uniquement le frontend. Vérifier que l'apex reste Basic/noindex et que les non-testeurs sont refusés sur `dl`.
10. Recette navigateur réelle : Turnstile → informations → MP4/MP3 → statuts ; ticket volé/rejoué/expiré, nouvelle IP, refus Origin, quotas, file, fermeture du navigateur ; décodage et comparaison d'octets. Vérifier huit langues/mobile/RTL et absence de données privées dans logs. Ce parcours complet reste à exécuter.
11. Vérifier le rollback avant de rouvrir le garde CI et la variable. La levée de Basic Auth, du noindex ou de la liste des testeurs exige une mission et une autorisation distinctes.

## 12. Rollback

Pour cette mission : aucun rollback production nécessaire. Les processus temporaires ont été arrêtés, sans effacer leurs fichiers. Les ports de fixture sont libres ; release, secrets, Caddy et services existants intacts.

Après une future activation : fermer immédiatement l'accès média par le blocage Caddy préalablement sauvegardé, conserver Basic/noindex, puis remettre ready=0. Préserver SSH. Restaurer la configuration de passerelle et son audience précédente, sans effacer SQLite ; redémarrer uniquement les composants modifiés et après arrêt contrôlé des transferts. Restaurer Caddy/ingress depuis les sauvegardes exactes validées ; ne pas supprimer les certificats ou anciennes releases.

Si le frontend est en cause, utiliser le pointeur de release précédente et le promoteur administratif prévu, avec le garde révisé de façon cohérente. Vérifier ensuite santé locale, TLS public, 401 anonyme, 503 médias, sitemap 404 et connexion SSH. Les tests Python couvrent le rollback existant ; cette mission n'a pas basculé réellement la release publique.

## 13. Preuves, état Git et reste à faire

Résumé versionné : `backend/validation/media-preparation-20261013.json`. Preuves détaillées privées sous `backend/artifacts/media-preparation-20261013/` : logs de tests/builds, `public-protection.json`, `http-browser-verification.json`, `vps-final.json`, bundles et fixtures. Rien de privé ajouté à Git.

VPS : nouveaux répertoires de recette `/home/debian/vidfetch-media-phase8-20261013-{a,b,c,d,e}` et `/opt/vidfetch-media-phase8-20261013-a` conservés ; uniquement des fixtures, pas une installation de remplacement. Aucun fichier/release préexistant supprimé.

**Terminées :** audit, origine runtime et autorisation préparées, bornes Turnstile, modèle Caddy, builds/tests, MP4/MP3 privés réels, déconnexion/expiration, protections publiques, comparaison de l'état final et arrêt de la recette.

**Bloquées avant activation :** DNS/certificat `dl`, vraies clés Turnstile, fourniture autorisée de la clé de service au frontend, revue ingress/Caddy/garde CI, validation des IP de test, accord de déploiement.

**Non testées :** chaîne publique complète avec vrai Turnstile et téléchargement natif réel via `dl`, plateformes sans médias autorisés, renouvellement réel du certificat `dl`, capacité/charge de production, rollback du futur parcours public média.

Le dépôt principal et les anciens checkouts/commits restent conservés. Cette branche prépare des commits locaux, sans push, fusion, modification Cloudflare/Supabase/Vercel/Raspberry Pi ni ouverture anonyme.
