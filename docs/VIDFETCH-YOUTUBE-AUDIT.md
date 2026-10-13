# VidFetch — audit de compatibilité YouTube sur OVH

Audit du **13 octobre 2026**, indépendant de la Phase 10. Branche locale `work/vidfetch-youtube-audit-20261013` (depuis `main` `6430aa89`), non poussée.

## Conclusion : **BLOQUÉ**

Depuis le VPS OVH (`15.235.127.165`), sans authentification, YouTube refuse toute extraction : **5 tentatives sur 5 en échec** (2 vidéos, 2 versions de yt-dlp), en 2 à 3 secondes, toujours pour la même raison. Le **même binaire**, avec les mêmes options et le même runtime JavaScript, réussit depuis une connexion résidentielle une minute plus tôt (métadonnées, formats, téléchargements audio et MP4).

- Ce n'est **pas** la version de yt-dlp : la version installée est la dernière stable, et la nightly du 10 octobre échoue de la même façon sur OVH.
- Ce n'est **pas** la configuration locale : binaire intègre, runtime JavaScript détecté, scripts EJS à jour, aucune erreur réseau.
- C'est l'**origine de la requête** : YouTube renvoie le statut `LOGIN_REQUIRED` (« Sign in to confirm you're not a bot ») à tous les clients essayés depuis cette adresse.

Portée de la conclusion : une seule adresse OVH testée, sur une fenêtre de 4 minutes. Je ne peux pas dire si le blocage vise toute la plage OVH ou cette adresse, ni s'il est permanent.

## 1. Versions et dépendances

| Élément | Sur le VPS | Référence officielle | Verdict |
|---|---|---|---|
| yt-dlp | `2026.08.19` (stable, `linux_dir`) | dernière stable : `2026.08.19` (19 août 2026) ; dernière nightly : `2026.10.10.233141` | à jour en stable ; la nightly a 3 jours |
| Intégrité | SHA-256 du binaire `58162f9b…399230a` et de l'archive dépaquetée `32e72032…d339e9` | identiques au fichier `SHA2-256SUMS` officiel | conforme |
| Runtime JavaScript | Node `22.23.3`, détecté par yt-dlp (`JS runtimes: node-22.23.3`) ; `node` est dans le PATH par défaut | minimum Node `22.0.0`, à activer avec `--js-runtimes node` | conforme (le moteur passe bien `--js-runtimes node`) |
| Scripts de défi (`yt-dlp-ejs`) | `0.8.0`, inclus dans le binaire | dernière version : `0.8.0` | à jour |
| ffmpeg / ffprobe | `7.1.5` | — | présent |
| Autres | `curl_cffi 0.16.0`, aucun plugin, aucun fournisseur de PO Token, aucun proxy | — | — |
| Options du moteur | `--js-runtimes` et `--force-ipv4` présents dans le bundle actif | — | conforme au dépôt |

Non vérifié : le contenu de `/etc/vidfetch/worker.env` (lecture root). À contrôler avec `00-preflight.sh`, qui liste les **noms** de variables : il ne doit contenir ni `YTDLP_*COOKIES`, ni `YTDLP_PROXY`. D'après `systemctl cat`, l'unité active ne comporte pas la ligne `UnsetEnvironment=` présente dans le modèle du dépôt.

## 2. Tests réalisés

Médias, tous deux sur la chaîne officielle « Blender » : *Big Buck Bunny*, dont la licence **Creative Commons Attribution** est confirmée dans les métadonnées YouTube (`Creative Commons Attribution license (reuse allowed)`), seul utilisé pour les téléchargements ; et *Sintel*, utilisé uniquement pour une lecture de métadonnées (YouTube n'indique pas de licence pour cette mise en ligne ; le film est publié sous CC BY par la Blender Foundation). Aucun cookie, aucun proxy, aucun PO Token, aucun changement de client. Options identiques à celles du moteur (`src/lib/engine.ts`). Sur le VPS : utilisateur `debian`, sans sudo, dans `~/vidfetch-youtube-audit-20261013` ; moteur, passerelle, Caddy, pare-feu et secrets non touchés.

| Origine | yt-dlp | Métadonnées | Formats | Téléchargement |
|---|---|---|---|---|
| Mac, IP résidentielle | 2026.08.19 | **OK** (4 s) | **OK** : 49 formats lisibles, jusqu'à 2160p, 32 en HTTPS et 17 en HLS | **OK** : audio 3 871 021 octets ; MP4 fusionné (H.264 144p + AAC) 8 139 400 octets, 634,7 s, décodage complet |
| Mac, IP résidentielle | nightly 2026.10.10 | **OK** (5 s) | **OK** : 57 formats lisibles | non refait |
| **VPS OVH** | 2026.08.19 (installée) | **ÉCHEC** × 3 (*Big Buck Bunny*, à 19:21, 19:23 et 19:23 UTC) | NON TESTÉ : impossible sans métadonnées | NON TESTÉ : idem |
| **VPS OVH** | 2026.08.19 (installée) | **ÉCHEC** × 1 (*Sintel*) | NON TESTÉ | NON TESTÉ |
| **VPS OVH** | nightly 2026.10.10 (copie isolée, retirée après le test) | **ÉCHEC** × 1 | NON TESTÉ | NON TESTÉ |

Empreintes des fichiers obtenus depuis le Mac (les médias eux-mêmes ne sont pas conservés) : audio `0b9cd8bc…a59b246`, MP4 `73b0a36c…907692`.

### Nature exacte de l'erreur sur OVH

```
[youtube] aqz-KE-bpKQ: Downloading webpage                       <- la page se charge
[youtube] aqz-KE-bpKQ: Downloading visionos player API JSON
[debug] visionos player response playability status: LOGIN_REQUIRED
[debug] web player response playability status: LOGIN_REQUIRED
ERROR: [youtube] aqz-KE-bpKQ: Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies …
```
Avec la nightly, le client `tv_samsung` est essayé en plus : `LOGIN_REQUIRED` aussi.

| Hypothèse | Observé | Verdict |
|---|---|---|
| Erreur réseau | `youtube.com/generate_204` répond 204 en 30 à 46 ms ; la page vidéo se charge | exclue |
| HTTP 403 sur les flux | aucun : l'échec survient avant toute demande de flux | exclue |
| HTTP 429 ou limite de session | aucun 429, aucun message « try again later » ; 5 requêtes en 4 minutes | exclue |
| Captcha | aucun | exclue |
| Problème de formats ou de défi JavaScript | aucun format n'est proposé, car la réponse du lecteur est refusée en amont | exclue comme cause |
| Vidéo privée ou limite d'âge | vidéo publique, `age_limit=0` (vu depuis le Mac) | exclue |
| **`LOGIN_REQUIRED`, variante « not a bot »** | sur tous les clients, pour les deux vidéos et les deux versions | **cause constatée** |

## 3. PO Tokens : ce que dit la documentation officielle

Sources : wiki yt-dlp, pages *PO Token Guide*, *Extractors* et *EJS* (version du 27 septembre 2026).

- Un PO Token (« Proof of Origin ») est une attestation produite par BotGuard (Web), DroidGuard (Android) ou iOSGuard, prouvant que la requête vient d'un client authentique. **yt-dlp ne peut pas en générer** : ils doivent être fournis de l'extérieur.
- Ils servent, selon le client, aux requêtes de flux (GVS), à la requête `player` ou aux sous-titres. Sans eux, les URL de formats des clients concernés « peuvent renvoyer HTTP 403, ou entraîner le blocage du compte ou de l'adresse IP ».
- Par défaut, yt-dlp utilise des clients qui n'en exigent pas ; certains formats peuvent alors manquer.
- Limites : jeton lié à l'identifiant de la vidéo (un par vidéo) ou à la session, propre à une plateforme, durée de vie peut-être limitée à 12 heures ; le sujet est décrit comme « un domaine de recherche actif », avec une application en cours de déploiement par YouTube. Les fournisseurs existants sont des plugins **non affiliés à yt-dlp**.
- Limite de débit documentée : environ 300 vidéos par heure pour une session invitée.

**Rapport avec notre blocage.** La documentation présente les PO Tokens comme une réponse aux HTTP 403 sur les formats. Notre échec est différent : c'est un `LOGIN_REQUIRED` sur la requête du lecteur, pour lequel YouTube et yt-dlp demandent une authentification. Rien dans la documentation n'indique qu'un PO Token lèverait ce contrôle. Je n'ai pas testé de fournisseur de PO Token : ces outils émulent l'attestation d'un client authentique, ce qui revient à contourner une protection anti-robot.

## 4. Erreurs vues par la passerelle et le frontend

La passerelle relaie tel quel le statut et le JSON du moteur. Le frontend traduit le **code** en message localisé, sans traiter le statut HTTP à part. Classement obtenu en exécutant le vrai code (`classifyEngineFailure`, `errorMessage`) sur les messages réels :

| Situation | Code et statut du moteur | Message affiché (fr) | Avis |
|---|---|---|---|
| **Blocage OVH réel** (capturé) | `AUTH_REQUIRED` 401 | « Cette source exige une autorisation ou est indisponible. VidFetch ne contourne pas ses restrictions. » | message honnête, **code trompeur** |
| Limite d'âge | `AUTH_REQUIRED` 401 | idem | correct |
| Vidéo privée | `PRIVATE` 404 | idem | correct |
| Limite de débit de session | `RATE_LIMITED` 429 | « Trop de demandes… » | correct |
| Captcha exigé | `UPSTREAM_BLOCKED` 503 | « L'opération n'a pas pu aboutir. Réessayez plus tard. » | vague |
| HTTP 403 sur un flux | `UPSTREAM_BLOCKED` 503 | idem | vague |
| Format demandé absent | `UNAVAILABLE` 404 | « L'analyse et les téléchargements sont temporairement indisponibles… » | **trompeur** : ressemble à une panne du service |
| Vidéo indisponible ou restriction géographique | `UNAVAILABLE` 404 | idem | **trompeur**, même raison |
| Panne DNS du serveur (réelle, hors ligne) | `ENGINE_ERROR` 502 | « L'opération n'a pas pu aboutir… » | non distinguée |
| Délai dépassé | `TIMEOUT` 504 | « L'opération a pris trop de temps… » | correct |

Constats :
1. Le blocage anti-robot d'une vidéo **publique** est classé comme une vidéo exigeant un compte. Le message anglais du moteur suggère même à l'exploitant de configurer des cookies serveur. Il n'est pas distinguable d'une vraie limite d'âge dans les journaux ou la supervision.
2. Le code `UNAVAILABLE` (vidéo indisponible) est affiché avec le message de panne du service, parce que la règle du frontend reconnaît aussi `BACKEND_UNAVAILABLE`.
3. Le parcours réel navigateur → passerelle → moteur n'a **pas** été testé : les routes médias sont fermées en production (`downloads.available=false`).

`tests/youtube-errors.test.ts` fige ce qui fonctionne (3 tests) et consigne les 4 écarts comme tests `todo`, sans changer le comportement : 140 tests, 136 réussis, 0 échec, 4 `todo`.

## 5. Possibilités de correction et risques

| Option | Effet attendu | Risques et limites | Avis |
|---|---|---|---|
| **A. Ne pas proposer YouTube depuis OVH** et l'annoncer clairement | aucun échec trompeur ; cohérent avec « VidFetch ne contourne pas ses restrictions » | YouTube absent de l'offre ; les textes qui citent YouTube sont à revoir | **recommandée** tant que le blocage dure |
| **B. Corriger le classement des erreurs** (blocage anti-robot → `UPSTREAM_BLOCKED` ; `UNAVAILABLE` affiché comme contenu indisponible) | diagnostics exacts ; ne débloque rien | la partie moteur change le bundle du moteur : le promoteur CI refuse alors un déploiement frontend seul, il faut une livraison moteur par l'administrateur. La partie frontend (`src/i18n/errors.ts`) se déploie normalement | recommandée, à planifier |
| C. Cookies d'un compte YouTube côté serveur (ce que demande le message) | lèverait probablement le contrôle ; **non testé** | la documentation avertit du risque de bannissement du compte ; tous les visiteurs passeraient par un seul compte ; cookies à renouveler et à protéger comme un secret ; contraire à « sans authentification » ; question de conformité aux conditions de YouTube | déconseillée ; décision de ta part uniquement |
| D. Fournisseur de PO Token | incertain : non documenté comme remède à ce blocage ; **non testé** | émule une attestation de client authentique : contournement d'une protection anti-robot ; plugins tiers, fragiles | exclue par tes contraintes |
| E. Autre adresse de sortie (proxy résidentiel, autre hébergeur, IPv6) | **non testé** | changer d'adresse pour échapper au contrôle est un contournement ; un proxy est un service payant ; l'IPv6 est interdite au moteur par l'isolation | exclue par tes contraintes |
| F. Surveillance légère | savoir si le blocage est permanent ou intermittent | une requête de métadonnées par jour suffit ; au-delà, on aggrave la réputation de l'adresse | utile avant de trancher |

Au-delà de la technique : les conditions d'utilisation de YouTube encadrent le téléchargement, même pour un contenu sous licence libre. Proposer YouTube est une décision d'exploitation qui te revient.

## 6. Ce qui n'a pas été testé

- Le moteur actif lui-même, sous son compte `vidfetch-worker` et ses règles de sortie : j'ai utilisé le même binaire, le même Node et les mêmes options en tant que `debian`. L'adresse IPv4 de sortie est la même.
- Le parcours complet frontend → passerelle → moteur (routes fermées, `ready=0`).
- Formats et téléchargement **depuis OVH** : impossibles sans métadonnées.
- Shorts, directs, vidéos avec limite d'âge, autres plateformes.
- Cookies, PO Tokens, proxys, IPv6, autres clients YouTube : volontairement non essayés.
- La durée du blocage et son étendue (cette adresse ou toute la plage OVH).

## 7. Traces

- VPS : `~/vidfetch-youtube-audit-20261013/` (script et journaux, 48 Ko ; binaire nightly supprimé ; aucun processus restant). Services inchangés après les tests : moteur, passerelle et Caddy actifs, release `f23ca65b…`, `downloads.available=false`, apex 401.
- Local, hors Git : `backend/artifacts/youtube-audit-20261013/evidence/`. Les métadonnées obtenues depuis le Mac contiennent l'adresse IP du testeur dans les URL de flux : ne pas les versionner.
- Résumé versionné : `backend/validation/youtube-audit-20261013.json`.
