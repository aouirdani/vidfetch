# VidFetch : refus AdSense et lot SEO 2 (27/10/2026)

Branche locale `work/vidfetch-seo-lot2-20261027`, basée sur `main` (`485712c0`), non poussée.

Rien n'a été fait en dehors de cette branche :
- aucune PR, fusion ou déploiement ;
- aucun changement sur le VPS, le DNS, le moteur ou la passerelle ;
- aucune action dans AdSense ;
- `VIDFETCH_DEPLOY_ENABLED=false`.

Données : production `485712c0`, Search Console lue le 27/10 (données jusqu'au 24/10), code de la branche.

## 1. Verdict

**NO-GO pour une nouvelle demande de réexamen : éligibilité incertaine, et site pas encore prêt.**

Deux raisons, de nature différente :

1. **Un obstacle de règle, indépendant de la qualité du contenu.**
   - **La règle Google :** les Google Publisher Policies, section « Incitation à un comportement malhonnête », citent en exemple : « pages favorisant ou permettant le téléchargement de vidéos en streaming, lorsque leur fournisseur l'interdit ».
   - **Les conditions de TikTok :**
     - version EEE, §4.5 : elles interdisent d'extraire du contenu de la plateforme par un système ou un logiciel automatisé non fourni ou non approuvé par écrit par TikTok ;
     - version US, §3.4 : même interdiction.
   - **Le droit de téléchargement accordé aux utilisateurs** s'exerce « using the Platform », selon les réglages du créateur (EEE, §4.9).
   - **Ce que fait VidFetch :** sa fonction principale est d'extraire les médias TikTok avec un logiciel automatisé (yt-dlp).
   - **Lecture :** c'est ma lecture des textes, pas un avis juridique. La décision appartient à Google. Ajouter du contenu ne lève pas cet obstacle.
2. **Des défauts confirmés de valeur et de confiance** (section 2). Le lot 2 en corrige une partie localement, mais rien n'est publié. Restent ouverts :
   - des contacts qui ne reçoivent aucun courriel ;
   - le consentement aux cookies (CMP) ;
   - l'identité de l'éditeur ;
   - le contenu original.

Ne pas cocher « J'ai corrigé les problèmes » dans AdSense tant que les points de la section 8 ne sont pas déployés et vérifiés. Aucune approbation ne peut être garantie.

## 2. Diagnostic AdSense fondé sur des preuves

« Confirmé » signifie constaté dans le code ou en production. « Hypothèse » signifie plausible mais non vérifiable d'ici.

| # | Problème constaté | Preuve | Règle | Gravité | Correction | Vérification |
|---|---|---|---|---|---|---|
| 1 | Fonction principale : télécharger des vidéos TikTok par extraction automatisée | Moteur yt-dlp. CGU TikTok EEE §4.5 et US §3.4 | Publisher Policies, « Enabling dishonest behavior » : *download streaming videos if prohibited by the content provider* | **Bloquante. Confirmée pour les textes, incertaine pour l'application** | Aucune par le contenu. Décision du propriétaire (section 9) | — |
| 2 | 7 index de guides vides (« Les guides dans cette langue sont en cours de relecture ») liés depuis l'en-tête, le pied de page et l'accueil en fr, es, pt, id, de, it, ar | Production : `/fr/guides`, `/es/guias`… répondent 200, noindex, avec le message `blogEmpty`. Les 7 accueils affichent une section « guides » sans aucun guide | AdSense 10015918 (pages manquantes ou non pertinentes) ; Publisher Policies (écrans « en construction » ou « de navigation ») | **Élevée, confirmée** | Lot 2 : 404, plus aucun lien, section masquée | Tests unitaires et verify-site (404 + liens) |
| 3 | Pages « YouTube Video Downloader », « Instagram Reels Downloader », « Twitter / X Video Downloader » accessibles (200, noindex) avec la balise AdSense | `/youtube-video-downloader` etc. : H1 au nom de la plateforme, avertissement « disponibilité en cours de vérification » | AdSense 10015918 (« fausses allégations concernant du contenu téléchargeable ») ; règle n° 1 pour YouTube | **Élevée, confirmée** | Lot 2 : 404 | Tests unitaires, verify-site, fixture d'indexation |
| 4 | Balise AdSense sur toutes les pages : 404, pages légales, brouillons noindex | `layout.tsx` charge le script sans condition | Publisher Policies 11112688 (pas d'annonces sur les pages d'erreur ni sur les écrans sans contenu) | **Moyenne, confirmée** | Lot 2 : balise seulement sur les pages indexables de contenu (accueils, pages TikTok, guides publiés) | `showsAds` testée sur toutes les pages ; verify-site vérifie accueil oui, page légale et 404 non |
| 5 | Le formulaire annonce « Reconnaît YouTube, TikTok, Instagram et X » et propose un bouton d'exemple Instagram, alors que seul TikTok est prouvé en production | `supportedHint` ; étude du 21/10 : « Instagram and X do not yet [have production evidence] » ; YouTube bloqué | AdSense 10015918 (fournir les services annoncés) | **Moyenne, confirmée** | Lot 2 : texte TikTok-first ; Instagram et X « pas encore vérifiés », YouTube « indisponible » | Tests unitaires |
| 6 | Les boutons « Essayer un exemple » lançaient l'extraction réelle de la vidéo d'un créateur tiers (`@pokemonlife22`) et d'un Reel Instagram | `PLATFORM_META.*.examples` utilisés par `FetchForm` | Propriété intellectuelle ; cohérence avec « ne téléchargez que ce que vous avez le droit de garder » | **Moyenne, confirmée** | Lot 2 : formes de liens en texte, sans bouton | Tests unitaires et verify-site (aucun bouton TikTok, Instagram ni YouTube) |
| 7 | Adresses de contact qui ne reçoivent aucun courriel : `legal@`, `privacy@`, `abuse@` et `support@` sur un ancien domaine (`vidfetch.io`) qui n'est pas celui de VidFetch | DNS du 27/10 : ce domaine n'existe pas (NXDOMAIN) ; `vidfetch.app` n'a pas de MX | AdSense 10015918 (présence cohérente, confiance) ; RGPD (droits des personnes) | **Élevée, confirmée** | `vidfetch.app` est le seul domaine officiel. PR : adresses affichées en `@vidfetch.app` (au rendu, sans toucher aux dictionnaires de la passerelle). Propriétaire : Cloudflare Email Routing sur `vidfetch.app` (voir le plan contacts) | `dig MX vidfetch.app`, un courriel test reçu sur chaque adresse ; verify-site : aucune page ne contient `vidfetch.io` |
| 8 | Les mentions légales n'identifient ni l'éditeur (nom ou raison sociale, adresse) ni l'hébergeur | `notice1` : « VidFetch is an automated media analysis and download service… Contact… legal@vidfetch.io » | En France, LCEN art. 6-III (si l'éditeur relève du droit français) ; confiance (E-E-A-T) | **Élevée, à confirmer selon la situation de l'éditeur** | Informations réelles à fournir par le propriétaire ; aucune identité inventée | Relecture |
| 9 | Aucune bannière de consentement dans le code : la balise AdSense se charge sans CMP | Code : aucun CMP ; la configuration « Confidentialité et messages » d'AdSense n'a pas été vérifiée (pas d'accès autorisé) | AdSense 13554116 : CMP certifiée par Google et intégrée au TCF, obligatoire depuis le 16/01/2024 (EEE, Royaume-Uni) et le 31/07/2024 (Suisse) pour les annonces personnalisées ; règles de consentement de l'UE | **Élevée pour la conformité, hypothèse sur la configuration du compte** | Propriétaire : activer le message RGPD de Google (CMP certifiée) ou une CMP certifiée | Visite depuis l'EEE : bannière visible, aucun cookie publicitaire avant consentement |
| 10 | Peu de contenu original : accueils de 250 à 330 mots génériques, traduits en 8 langues ; 10 guides anglais génériques non publiés ; aucune donnée, capture ni test propre ; aucune page « À propos » | Crawl du 26/10 ; `content/guides` | AdSense 10015918 (« suffisamment de contenu unique ») ; contenu utile (« original information ») | **Élevée, confirmée** | Lot 2 : sections pratiques TikTok. Le reste en section 4 | Relecture |
| 11 | Site très jeune et peu d'usage réel : domaine enregistré le 11/10, 0 lien externe, 89 impressions sur 7 jours | WHOIS, Search Console | « Intérêt réel des utilisateurs » ; Google ne publie aucun seuil | **Moyenne, hypothèse** | Temps, mentions authentiques, trafic | Search Console |
| 12 | Débordement horizontal sur mobile des pages TikTok MP4 (EN et FR), 478 et 487 px | Crawl du 26/10 | Expérience mobile | **Faible, confirmée** | Lot 2 : retour à la ligne des liens longs | 31 pages à 390 px sans débordement |
| 13 | Emplacement des annonces : aucun bloc manuel, seulement la balise des annonces automatiques | Code | Publisher Policies 11035030 (prudence près des boutons de téléchargement) | **À surveiller** | Si AdSense est approuvé : exclure la zone du formulaire dans les réglages des annonces automatiques (propriétaire) | Inspection après approbation |

## 3. Causes probables du refus, par gravité

1. **Bloquante :** la nature du service (règle n° 1). Le motif notifié est « contenu à faible valeur informative », mais un examinateur peut aussi s'appuyer sur la règle des téléchargements. Cela reste une hypothèse : Google n'a pas cité cette règle.
2. **Élevées :**
   - les pages vides ou trompeuses (n° 2 et 3), présentes au moment de l'examen ;
   - un contenu surtout générique et traduit (n° 10) ;
   - des contacts inopérants et un éditeur non identifié (n° 7 et 8).
3. **Moyennes :**
   - des annonces sur des écrans sans contenu (n° 4) ;
   - des plateformes annoncées mais non vérifiées (n° 5) ;
   - des exemples portant sur des contenus de tiers (n° 6) ;
   - un site très jeune (n° 11).
4. **Conformité, sans lien avec le motif :** le consentement (n° 9).

## 4. Valeur informative réelle : ce qui est fait et ce qui reste

**Fait dans le lot 2.** Sections pratiques sur les 4 pages TikTok, en EN et en FR :
- retrouver le fichier sur iPhone et sur Android, d'après les pages d'aide Apple et Google ;
- que faire quand un téléchargement s'arrête : vérification, file d'attente, 10 minutes par préparation, 8 téléchargements par jour, lien à usage unique ;
- ce que VidFetch fait du lien ;
- MP3 ou piste d'origine ;
- la musique et les droits.

Chaque limite citée est testée contre le moteur et la passerelle.

**Reste à faire.** Le propriétaire est indispensable pour ces points :
- Tests réels sur **ses propres vidéos TikTok** :
  - formats et résolutions renvoyés, tailles, codecs, présence d'un filigrane ;
  - captures d'écran du parcours.

  Cela donnerait des données originales et datées, ce que les concurrents n'ont pas.
- Une page « À propos » : qui édite VidFetch, pourquoi, comment le service est financé, ce qu'il refuse de faire (contournement, comptes privés, YouTube). Uniquement avec des informations réelles.
- Une FAQ fondée sur de vrais problèmes d'utilisateurs : courriels reçus, erreurs les plus fréquentes dans les journaux agrégés du service, sans données personnelles.

**Guides existants.** Modifier le corps d'un guide anglais invalide l'empreinte de provenance de ses 7 traductions (`sourceBodySha256`, testée). Ces traductions devront alors être revues, ce qui est sans gravité puisqu'elles ne sont pas publiées.

| Guide | Proposition | Raison |
|---|---|---|
| `video-download-fails` | **Publier** après relecture et ajout des limites réelles de VidFetch (déjà sur les pages TikTok) | Propre au service : dépannage concret |
| `video-to-audio` | **Publier** après relecture | Complète `/tiktok-to-mp3` (MP3 à 192 kbps, piste d'origine) |
| `video-format-smartphone` | **Publier** après ajout des chemins iPhone et Android vérifiés | Intention mobile majoritaire (81 impressions mobiles sur 138 en 28 jours) |
| `mp3-vs-m4a` | **Publier** après relecture | Utile au choix audio, lié à la page MP3 |
| `backup-your-videos` | **Réécrire** en « Sauvegarder ses propres vidéos TikTok », seulement après vérification des fonctions officielles de TikTok sur support.tiktok.com | Angle autorisé et réellement utile ; non vérifié à ce jour |
| `720p-1080p-4k`, `bitrate-vs-resolution`, `h264-h265-av1`, `mp4-vs-webm`, `reduce-video-size` | **Ne pas publier** pour l'instant | Sujets génériques déjà largement couverts, faible lien avec l'usage TikTok, risque de « contenu à faible valeur » |

Aucune traduction en masse : publier une langue seulement après relecture native.

## 5. Lot SEO 2 : contenu de la branche

Commit `7bc87ac6`, 21 fichiers, frontend uniquement. Aucun fichier `src/i18n/messages` n'est modifié.

Nouveaux modules :
- `src/lib/home-copy.ts` : textes des 8 accueils ;
- `src/lib/form-copy.ts` : lignes sous le formulaire, quelques chaînes envoyées au navigateur.

Contenu du lot :
1. **Liens internes :**
   - l'en-tête (ordinateur) affiche « TikTok to MP4 / TikTok to MP3 » en EN et « TikTok en MP4 / en MP3 » en FR ;
   - le pied de page de toutes les pages, pages légales comprises, renvoie aux pages TikTok de la langue, sinon aux pages anglaises marquées `hreflang="en"` et « (page en anglais) » ;
   - le texte légal lui-même reste sans lien commercial.
2. **Accueils anglais et français :** titre, description et H1 centrés sur TikTok MP4/MP3, « VidFetch » dans chaque titre. Les 6 autres langues gardent leur formulation publiée, faute de relecture native fiable (décision du 27/10). Voir la section 6.
3. **Pages TikTok :** 3 ou 4 sections pratiques par page (section 4). Texte propre à chaque page (copie du catalogue) :
   - MP4 EN : 489 → 849 mots ;
   - MP4 FR : 502 → 871 mots ;
   - MP3 EN : 382 → 611 mots ;
   - MP3 FR : 421 → 664 mots.
4. **Navigation :** « Guides » apparaît seulement dans une langue qui a des guides. Plus aucune page vide.
5. **Formulaire :**
   - indication TikTok-first : sur les pages TikTok, uniquement TikTok ;
   - formes de liens acceptées en texte : `tiktok.com/@…/video/…`, `vm.tiktok.com/…`, `tiktok.com/t/…`.
6. **`favicon.ico`** en 16, 32 et 48 px, déclaré et mis en cache.
7. **Indexation inchangée :**
   - les 20 URL du sitemap ;
   - canonical sur chaque page vers sa propre URL ;
   - hreflang réciproques ;
   - lastmod : pages TikTok et accueils au 27/10, pages légales au 12/10.

   Pages retirées (404, absentes du sitemap, déjà noindex) : 7 index de guides vides, plus les pages YouTube, Instagram et X.

Cannibalisation : l'accueil vise « TikTok MP4 + MP3 » de façon générale (hub). `/tiktok-video-downloader` vise la vidéo MP4, `/tiktok-to-mp3` le son. Les titres et H1 sont distincts (testé).

## 6. Avant/après

| Langue | Titre avant | Titre après | H1 avant | H1 après |
|---|---|---|---|---|
| en | VidFetch — Video Downloader & MP3 Audio Converter | TikTok Downloader – Save MP4 Video or MP3 Audio \| VidFetch | A video worth keeping. A simple way to save it. | Save TikTok videos as MP4 or keep the sound as MP3. |
| fr | VidFetch — Téléchargement vidéo et conversion MP3 | Télécharger des vidéos TikTok en MP4 ou MP3 \| VidFetch | Une vidéo à conserver. Un moyen simple de la sauvegarder. | Enregistrez vos vidéos TikTok en MP4 ou gardez seulement le son en MP3. |
| es | VidFetch — Descarga de vídeos y conversión a MP3 | Descargar vídeos de TikTok en MP4 o MP3 \| VidFetch | Un vídeo que quieres conservar… | Guarda tus vídeos de TikTok en MP4 o quédate solo con el sonido en MP3. |
| pt-BR | VidFetch — Download de vídeos e conversão para MP3 | Baixar vídeos do TikTok em MP4 ou MP3 \| VidFetch | Um vídeo que vale guardar… | Salve seus vídeos do TikTok em MP4 ou fique só com o áudio em MP3. |
| id | VidFetch — Unduh Video dan Konversi Audio MP3 | Download Video TikTok MP4 atau MP3 Gratis \| VidFetch | Video yang layak disimpan… | Simpan video TikTok sebagai MP4 atau ambil suaranya saja sebagai MP3. |
| de | VidFetch — Videos herunterladen und MP3 umwandeln | TikTok-Videos als MP4 oder MP3 herunterladen \| VidFetch | Ein Video, das du behalten möchtest… | Speichere TikTok-Videos als MP4 oder behalte nur den Ton als MP3. |
| it | VidFetch — Download video e conversione MP3 | Scaricare video TikTok in MP4 o MP3 \| VidFetch | Un video da conservare… | Salva i video TikTok in MP4 oppure tieni solo l'audio in MP3. |
| ar | VidFetch — تنزيل الفيديو وتحويل الصوت إلى MP3 | تنزيل فيديوهات تيك توك MP4 أو MP3 مجانًا \| VidFetch | فيديو يستحق الاحتفاظ به… | احفظ فيديوهات تيك توك بصيغة MP4 أو احتفظ بالصوت فقط بصيغة MP3. |

**Descriptions :**
- avant, elles étaient centrées sur la permission (EN : « Save videos you own or have permission to download… »), et la FR faisait 169 caractères ;
- après, elles décrivent l'usage TikTok MP4/MP3, la gratuité, l'absence de compte et d'application, et le support mobile ou ordinateur. Elles font de 131 à 160 caractères.
- La permission reste rappelée dans le paragraphe sous le H1 et sous le formulaire.

**Maillage :**
- avant : les pages TikTok n'étaient liées que depuis la section « Télécharger par plateforme » des accueils et depuis les pages TikTok elles-mêmes ;
- après, il s'y ajoute l'en-tête EN/FR et le pied de page des 31 pages rendues (pages légales comprises).

**Mise à jour du 27/10 (décision du propriétaire) :** sans vérification linguistique native fiable, es, pt-BR, id, de, it et ar gardent leurs titres, descriptions, H1, réponse de FAQ et ligne du formulaire déjà publiés. Les colonnes « après » de ces 6 langues ne sont qu'une proposition pour une relecture future. Leur pied de page reprend les libellés des pages anglaises déjà publiés sur leur accueil.

## 7. Risques et conformité AdSense

| Élément | État | Action | Qui |
|---|---|---|---|
| Règle sur les téléchargements (n° 1) | Ouvert, structurel | Décider si VidFetch reste candidat AdSense ; toute autre régie a ses propres règles à vérifier avant inscription | Propriétaire |
| Contacts | Préparé dans la PR (adresses en `@vidfetch.app`) ; réception à activer | Activer Cloudflare Email Routing sur `vidfetch.app` (gratuit, DNS déjà chez Cloudflare) avant de déployer la PR. Détail : `docs/VIDFETCH-CONTACTS-COMPLIANCE-PLAN-20261027.md` | Propriétaire (DNS), puis GO déploiement |
| Identité de l'éditeur et de l'hébergeur | Ouvert | Fournir le nom ou la raison sociale, une adresse ou une domiciliation, et l'hébergeur (OVH) | Propriétaire |
| Consentement EEE, Royaume-Uni, Suisse | À vérifier | AdSense > Confidentialité et messages > message RGPD (CMP certifiée Google), ou CMP tierce certifiée | Propriétaire |
| Politique de confidentialité | En place (`ADVERTISING_PRIVACY` : cookies Google, lien adssettings) | Ajouter le lien « Comment Google utilise les données… » (google.com/policies/privacy/partners) | Moi, sur GO |
| Pages vides ou trompeuses, annonces sur 404 et pages légales | Corrigé localement | Déployer le lot 2 | GO séparés |
| Exemples de contenus de tiers | Corrigé localement | Remettre un exemple cliquable seulement avec une vidéo du propriétaire | Propriétaire |
| Signalement d'abus et droits d'auteur | Procédure décrite (`report1`, `report2`), mais adresse inopérante | Dépend des contacts | Propriétaire |

## 8. Checklist avant toute demande de réexamen

- [ ] Décision du propriétaire sur la règle n° 1, prise en connaissance de cause
- [ ] Lot 2 fusionné, déployé et vérifié en production (crawl, 404, balise AdSense)
- [ ] Test réel TikTok MP4 et MP3 réussi (compteurs, aucune fuite)
- [ ] Adresses de contact fonctionnelles, avec un courriel test reçu sur chacune
- [ ] Mentions légales avec l'éditeur et l'hébergeur réels
- [ ] CMP certifiée active et testée depuis l'EEE
- [ ] 3 ou 4 guides utiles publiés après relecture ; aucun guide générique de remplissage
- [ ] Une page « À propos » réelle
- [ ] Aucune page vide, trompeuse ou en construction (crawl complet)
- [ ] Mobile : 0 débordement, 0 erreur JS (crawl à 390 px)
- [ ] Search Console : 0 erreur d'indexation sur les 20 URL, pages TikTok indexées
- [ ] Aucun problème critique ouvert dans ce tableau

## 9. Plan SEO sur 30 jours vers 1 000 clics par semaine

**Point de départ (18–24/10) :** 89 impressions, 6 clics, CTR 6,7 %, position moyenne 11,4. Requêtes visibles :
- « video fetch » : 19 impressions, 3 clics ;
- « vidfetch » : 12 impressions, 1 clic ;
- « mp3 tiktok » : 1 impression, position 128.

**Ce que demanderaient 1 000 clics par semaine :**
- c'est 167 fois le niveau actuel ;
- avec un CTR de 3 à 5 % sur des requêtes hors marque, il faudrait environ 20 000 à 33 000 impressions par semaine ;
- ce n'est pas atteignable en 30 jours pour un domaine de 16 jours sans liens. C'est un objectif à 6–12 mois, sous réserve d'autorité.

**Indicateurs à 30 jours :**
- 4 pages TikTok sur 4 indexées ;
- requêtes TikTok hors marque visibles dans Search Console ;
- impressions hebdomadaires en hausse nette par rapport à 89, sans prévision chiffrée inventée.

| Semaine | Actions | Mesure |
|---|---|---|
| 1 (27/10–2/11) | GO, relecture native et PR du lot 2, CI, fusion et déploiement contrôlé (GO séparés) ; tests réels TikTok (filigrane compris) ; contacts ; Bing Webmaster Tools (import depuis Search Console) | Production crawlée ; Search Console : sitemap relu après déploiement |
| 2 (3–9/11) | Publier 3 ou 4 guides relus ; données originales tirées des tests sur les vidéos du propriétaire ; page « À propos » | Inspection des URL TikTok ; impressions par page |
| 3 (10–16/11) | Pages TikTok es et pt-BR (entrées du catalogue prêtes, rédaction native) ; 3 à 5 mentions authentiques (AlternativeTo, communautés, en indiquant être l'éditeur) | Pages en/fr/es/pt indexées ; premières impressions hors marque |
| 4 (17–26/11) | Ajuster titres et descriptions selon les requêtes réelles (position 8–20 et CTR faible) ; décider id, de, it, ar ; bilan | Comparaison au 89/6 ; requêtes et pages qui progressent |

**GEO et AI Mode :**
- pas de technique dédiée : Google recommande du contenu utile et une indexation propre ;
- `llms.txt` reste optionnel et de priorité basse ;
- le levier principal est la présence sur des sites tiers, avec une description cohérente : « outil TikTok MP4/MP3, sans contournement ».

## 10. Tests et preuves (27/10)

- `npm run lint` : 0 ; `npm run typecheck` : 0.
- `npm test` : 184 sur 184, exécutés fichier par fichier. Une exécution parallèle sur ce Mac s'est bloquée sur les ports 8788/8789 des tests de disponibilité, à cause d'une seconde exécution concurrente. Aucun rapport avec ce lot ; les deux tests passent seuls.
- `npm run test:i18n` (verify-site) :
  - 31 pages rendues côté serveur, 8 langues, 404 localisées ;
  - hreflang réciproques ;
  - transferts simulés dans les 8 langues : pas de régression du parcours de téléchargement ;
  - aucun accès réseau public.
- Build Next 16.4.2 (`VIDFETCH_TARGET=ovh`) : 31 pages pré-rendues (41 avant).
- Empreintes reconstruites, identiques à la production :
  - moteur `fa0d3d4e15a5a45ca0deb2b35e7ba03adc95c31b87500378068121f291c42287` ;
  - passerelle `0fa1404530c272b76aaec9aee18125660e8561c744e4ccc1fbb9c7dbee9850e5`.
- Mobile 390 px, 31 pages : 0 débordement, 0 erreur JS, un H1 par page. Balise AdSense sur les accueils et les pages TikTok seulement.
- Captures mobile et ordinateur : accueils en, fr, es, ar ; pages TikTok ; pages légales ; `/blog`.
- `check:release` : 481 fichiers, 0 secret.
- `python3 -m unittest discover -s deploy/ovh/tests` : 81 tests OK, 4 ignorés.
- `public-indexing.test.sh`, avec le vrai Caddy 2.11.7 dans Docker : ALL PASSED, 53 contrôles :
  - le sitemap contient exactement les 20 URL attendues ;
  - exactement 11 pages pré-rendues hors sitemap, toutes en noindex ;
  - les API restent fermées.
- `node backend/gateway/run-tests.mjs` : 3 sur 3.

## Sources

- [Expérience utilisateur et contenu avec Google AdSense](https://support.google.com/adsense/answer/10015918?hl=fr)
- [Règlement Google pour les éditeurs](https://support.google.com/adsense/answer/9335564?hl=fr)
- [Google Publisher Policies](https://support.google.com/publisherpolicies/answer/10502938?hl=en)
- [Enabling dishonest behavior](https://support.google.com/publisherpolicies/answer/10436828?hl=en)
- [Screens without publisher-content](https://support.google.com/publisherpolicies/answer/11112688?hl=en)
- [Ads interfering](https://support.google.com/publisherpolicies/answer/11035030?hl=en)
- [AdSense Program policies](https://support.google.com/adsense/answer/48182?hl=en)
- [Consent requirements: EEA, UK, Switzerland](https://support.google.com/adsense/answer/13554116?hl=en)
- [EU user consent policy](https://www.google.com/about/company/user-consent-policy/)
- [Creating helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [TikTok Terms of Service, EEA](https://www.tiktok.com/legal/page/eea/terms-of-service/en)
- [TikTok Terms of Service, US](https://www.tiktok.com/legal/page/us/terms-of-service/en)
- [Apple: find your downloaded files on iPhone](https://support.apple.com/guide/iphone/find-your-downloaded-files-on-iphone-iphc9cd7266c/ios)
- [Apple: where to find downloads](https://support.apple.com/en-lamr/102440)
- [Chrome Android: download a file](https://support.google.com/chrome/answer/95759?hl=en&co=GENIE.Platform%3DAndroid)
