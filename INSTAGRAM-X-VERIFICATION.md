# PR B — Instagram et X : vérifier avant de publier

Architecture : Next.js App Router avec catch-all SSR/SSG, `src/lib/site-pages.ts`, `src/lib/platform-pages.ts` et `content/platforms/catalogue.json`. Le même registre alimente routes, métadonnées, hreflang, sélection des langues, navigation et sitemap. Une page plateforme existe seulement si `published`, `authorizedMediaVerified`, `copyReviewed` et `permissionToPublish` sont tous vrais, avec une copie complète et datée. CI construit la release OVH et `deploy/ovh/ci/promote.py` compare les moteurs protégés. Branche indépendante de la PR A ; aucune nouvelle dépendance, aucun changement du Caddy actif, aucun push main ou déploiement.

## Résultat de publication

Les 16 pages sont **préparées et non publiées**. Les deux candidats `instagram-video` et `x-video` ont `published: false` et leurs trois gates à `false`. Ils remplacent les anciens candidats génériques non publiés `instagram-video-downloader` et `twitter-video-downloader`, évitant une collision de slug. Aucun ancien contenu public n’est perdu. Les autres candidats restent inchangés, notamment toutes les entrées YouTube. Le candidat Reels historique reste fermé séparément.

Les textes des huit langues comportent environ 902–945 mots par page : instructions, formats/limites, téléphone, dépannage, traitement du lien, droits et FAQ. Ils ne constituent pas une preuve d’accès aux plateformes. Les types et formats proposés sont des **valeurs à confirmer**, pas un fonctionnement établi. Les gates sont la barrière de publication ; le statut rédactionnel `ready` permet au test de fixture d’exercer le fonctionnement du registre, sans attester une relecture humaine ou une vérification média. Les dates actuelles datent la rédaction préparatoire ; elles devront refléter la publication finale.

## Audit du chemin actuel

- `src/lib/platforms.ts` reconnaît les liens individuels Instagram `/p/`, `/reel/`, `/reels/`, `/tv/`, certains liens partagés et stories, puis normalise le lien. Il reconnaît aussi les statuts X/Twitter. **Reconnaissance syntaxique ne signifie pas compatibilité.** Le vérificateur se limite à `/reel/`, `/p/` et aux statuts X ; aucune story n’est promise.
- `src/components/FetchForm.tsx` analyse le lien, conserve les avertissements actuels et passe par la vérification humaine de VidFetch. `src/lib/secure-client.ts` gère clé navigateur, grant et preuves de requête. L’API publique d’analyse est `/api/fetch-info`, la préparation `/api/download`, avec la file existante et tickets temporaires. `VideoCard.tsx` sélectionne uniquement les formats réellement retournés.
- La passerelle contrôle origine, preuve d’accès, quotas et capacité, puis appelle le moteur. `backend/server.ts` analyse via l’extracteur existant, filtre les formats et prépare le média. Une vidéo combinée MP4 peut être transférée ; un flux séparé peut exiger remuxage. Une piste sonore disponible peut être convertie en MP3 à 192 kbps. Aucun MP3 n’est inventé pour une publication sans audio. `tests/media.test.ts` couvre notamment Instagram sans codecs explicites et les publications photo/silencieuses.
- Une IP OVH peut être refusée, limitée ou confrontée à une demande de connexion malgré une page publique. Le contenu peut être privé, supprimé, géorestreint ou modifié entre analyse et transfert. Les erreurs de connexion requise, contenu indisponible, débit, file, quota ou timeout ne démontrent pas un support partiel fiable. Aucun contournement n’est ajouté et aucune vérification réelle sur la production n’a été lancée.

Les moteurs et leurs réglages restent ceux du code existant ; cette PR ne modifie ni leurs sources ni leurs artefacts. Comparaison par recompilation avec le même esbuild : SHA-256 OVH `fa0d3d4e15a5a45ca0deb2b35e7ba03adc95c31b87500378068121f291c42287`, passerelle `0fa1404530c272b76aaec9aee18125660e8561c744e4ccc1fbb9c7dbee9850e5`, identiques sur main, A et B.

## Vérificateur opérateur

`scripts/ovh/verify-platform-links.mjs` utilise un **navigateur Playwright normal visible** et le formulaire du site public réel, afin de conserver vérification humaine, preuves d’accès, quotas, file et tickets. Aucune route directe vers les moteurs et aucun contournement de Turnstile. Le script exige `--confirm-rights` puis la saisie interactive exacte `I HAVE PERMISSION`. Il accepte uniquement des liens individuels HTTPS fournis par l’opérateur, sans données d’accès ni query string. Il refuse les options de profil, cookie, proxy et identifiants. Un contexte neuf ne possède aucun cookie de compte. Les navigations directes vers Instagram/X sont bloquées dans ce navigateur.

L’analyse est suivie du téléchargement MP4 puis MP3 si ces formats sont réellement proposés. Chaque résultat est contrôlé par ffprobe : conteneur MP4 avec vidéo, ou audio MP3 sans vidéo, durée positive et pistes. Une absence de son est consignée sans inventer une sortie. Les téléchargements sont temporaires, supprimés après validation. Le script produit JSON et Markdown par plateforme : liens fournis, types, résultats, codes normalisés, temps et données de pistes ; pas d’URL de média signée, auteur, titre, cookie, grant, ticket ou réponse brute. Pas de relance automatique ni de concurrence ; arrêt sur quota/limitation/capacité.

Le test automatisé emploie uniquement des fixtures et vérifie parseur, validation média, refus des entrées sensibles, normalisation des codes et rapport. **Le script n’a pas été exécuté contre la production**, conformément à la mission. L’intégration réelle avec le contrôle humain et les téléchargements doit donc être validée par l’opérateur ; elle n’est pas présentée comme testée.

Commande et procédure détaillée : `docs/PUBLISH-INSTAGRAM-X.md`. Dépendances existantes réutilisées : Playwright, Node ; ffprobe fourni par l’opérateur. Aucune bibliothèque ni aucun binaire redistribué dans B.

## Limites et valeurs à confirmer

| Source | Valeur du code | Vérification restante |
|---|---|---|
| `backend/server.ts`, limites | 256 × 1024² octets, 30 minutes, 10 minutes/opération | Limite publique effective et politique de déploiement |
| `backend/gateway/main.ts`, `VIDFETCH_PUBLIC_MAX_MIB` | OVH par défaut 256 Mio, configurable de 1 à 256 | Valeur active sur le VPS, sans demander de secret |
| `backend/gateway/ledger.ts` | 8 préparations/jour UTC et 1 Gio réservé par identité navigateur/IP ; plafond réseau partagé 100/4 Gio | Budget réellement restant et usage partagé |
| `backend/server.ts`, conversion | MP3 192 kbps | Présence de son et conversion réelle pour chaque type |
| Plateformes tierces | Aucun résultat réel acquis dans cette mission | Reels, /p/ vidéo, X natif, alias, formats et refus depuis OVH |

Le nombre et le volume sont appliqués ensemble ; huit préparations ne sont pas garanties. Une réservation échouée peut rester comptée. Les limites des candidats sont exprimées en Mio/MiB plutôt qu’un arrondi trompeur. Privé, stories, comptes protégés et publications supprimées restent exclus. Les FAQ sur le filigrane disent qu’un filigrane incrusté n’est pas retiré.

## URL préparées, actuellement 404 (ne pas soumettre à l’indexation)

- en: `https://vidfetch.app/instagram-video-downloader`, `https://vidfetch.app/x-video-downloader`
- fr: `https://vidfetch.app/fr/telecharger-video-instagram`, `https://vidfetch.app/fr/telecharger-video-x`
- es: `https://vidfetch.app/es/descargar-video-instagram`, `https://vidfetch.app/es/descargar-video-x`
- pt-BR: `https://vidfetch.app/pt/baixar-video-instagram`, `https://vidfetch.app/pt/baixar-video-x`
- id: `https://vidfetch.app/id/download-video-instagram`, `https://vidfetch.app/id/download-video-x`
- de: `https://vidfetch.app/de/instagram-video-herunterladen`, `https://vidfetch.app/de/x-video-herunterladen`
- it: `https://vidfetch.app/it/scaricare-video-instagram`, `https://vidfetch.app/it/scaricare-video-x`
- ar: `https://vidfetch.app/ar/tahmil-video-instagram`, `https://vidfetch.app/ar/tahmil-video-x`

## Tests

- `npm test` : **186 tests passés**, 0 échec. Inclut fermeture des routes/liens/sitemap et ouverture des quatre switches sur une **copie en mémoire** : 16 routes, groupes de huit langues réciproques, canonical, sitemap, WebApplication/Breadcrumb/FAQ JSON-LD. Le catalogue sur disque est contrôlé inchangé après la fixture.
- `npm run lint`, `npm run typecheck`, `npm run check:release` : passés.
- Build de production OVH avec Webpack : passé. Turbopack local est bloqué sur son port interne également sur main ; le pipeline Linux garde le build normal.
- `npm run seo-check` : **50 URL, PASS**. Aucun candidat fermé dans le sitemap, aucun noindex introduit sur le contenu public.
- `npm run test:i18n` : passé, incluant les huit accueils, 16 transferts TikTok localisés et erreurs de quota, RTL/sélecteurs et statuts 404 des 16 nouveaux chemins fermés.
- Tests d’opérateur : fixtures seulement, aucune exécution de production. CI finale et vérifications communes : lien ajouté après exécution.

## Publication et actions humaines

Seuil recommandé : 100 % de réussite de bout en bout sur au moins trois publications indépendantes autorisées par type annoncé, réparties sur au moins deux jours UTC et pour chaque format annoncé. Ce seuil sert la précision de la promesse et ne fournit aucune garantie statistique générale. Respecter toutes les limites ; avec une réservation de 256 Mio, quatre préparations peuvent déjà épuiser l’enveloppe de 1 Gio. Échecs de connexion ou blocages : rester fermé. Réduire les types et formats promis si seuls certains sont prouvés, puis refaire la campagne.

L’opérateur doit fournir ses liens autorisés, réaliser la campagne réelle, ajuster les textes et dates, puis faire relire les huit langues. Priorité arabe (« إثبات وصول المتصفح », unités latines) et indonésien (« bukti akses browser », « calon dukungan »). Les explications médias utilisent aussi de la prose éditoriale existante sélectionnée par sujet ; aucune relecture native indépendante n’est prétendue.

Après validation seulement, ouvrir les quatre switches du candidat concerné dans une nouvelle PR ; retirer sa seule réserve « sans garantie » dans le formulaire, en conservant celle de l’autre plateforme et sans toucher YouTube ou les dictionnaires des moteurs. Tester SEO/i18n/CI et obtenir une décision humaine. Aucun lien préparé ne doit être soumis à Search Console aujourd’hui.

Après une publication ultérieure approuvée : purge Cloudflare, vérification directe du HTML et des en-têtes des versions EN/FR/ID/PT, soumission de `https://vidfetch.app/sitemap.xml`, puis indexation prioritaire des pages nouvellement ouvertes. Si un blocage durable apparaît, refermer les gates et retirer les liens. Aucune fusion ou activation de production dans cette mission.
