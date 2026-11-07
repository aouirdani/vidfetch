# Plan de 30 guides — validation OpenSEO du 7 novembre 2026

**Statut : plan validé par le propriétaire avec les modifications de la section Revue appliquée ci-dessous.** Trente sujets distincts sont retenus au stade du plan après mesure et remplacement des candidats faibles ou incompatibles. Leur rang est un ordre de travail proposé ; les identifiants G01–G30 restent stables pour la revue. La réalisation suit les trois PR demandées ; les contenus dont les informations d’auteur/éditeur restent à compléter ne sont pas publiés.

Marché des métriques : **États-Unis (`us`, `locationCode=2840`), anglais (`en`)**, projet existant `0289621d-1d2e-411b-b57b-df52dc7f5515`. Mesures MCP OpenSEO du 07/11/2026, entre **12:29:13 et 12:31:46 UTC**. Base de code : `7a8da1996057a18c63b27bbe1289555b87ec2b99` (`origin/main`). Aucun guide ni fichier applicatif modifié. **Coût de cette étape : 0,51 USD / 1,50 USD**, indépendant du budget de l’audit précédent.

## Méthode et limites des mesures

### Revue appliquée — 7 novembre 2026

La revue du propriétaire prime sur le classement initial : **les rangs restent figés**, PR 2 = rangs 1–15, PR 3 = rangs 16–30. Les scores de G17/G25 sont actualisés sans déplacer les lots. Le coût et les mesures du plan initial sont conservés comme historique ; le présent complément est compté séparément.

- **G17** : principal `tiktok aspect ratio`, US/en, **2 400/mois, difficulté 1**, données OpenSEO déjà mesurées le 07/11. Slug `tiktok-aspect-ratio`. Guide de géométrie et format 9:16, avec 16:9/1:1/4:5 ; G29 conserve le diagnostic des bandes noires, aucun recadrage annoncé.
- **G25** : `audio clipping` est retiré. Remplacement mesuré `split video into parts`, US/en, **480/mois, difficulté 14**, adéquation **3** avec `/trim-video`. Mesure à `2026-11-07T12:58:56.356Z`. Variante `how to split video into parts` : 390/D20 ; générique `split video` : 720/D17, conservé comme secondaire. Une vidéo originale donne plusieurs fichiers par opérations successives ; ce n’est ni un lot automatique ni une simple copie du tutoriel de coupe G18. La démonstration décidera si cette distinction justifie une page ou une fusion.
- Recherche G25 : dry-run gratuit, puis un appel plafonné à **0,04 USD**, coût **0,04 USD / 0,50 USD** autorisé. Treize formulations mesurées, aucune recherche sans dry-run.
- **Traductions FR imposées**, sans substitution : G18, G10, G01, G11, G12, G30, G02, G16, G19, G17. Deux lots OpenSEO France/fr, chacun précédé de son dry-run, coût total **0,08 USD / 0,50 USD** autorisé ; plafonds réels cumulés 0,08 USD. Horodatages : `12:58:56.366Z` et `13:10:27.268Z` le 07/11/2026.

| ID | Requête FR mesurée retenue / repère | Volume France /mois | Difficulté | Titre proposé pour la traduction | Slug français |
| --- | --- | --- | --- | --- | --- |
| G18 | couper une vidéo iphone | 720 | 0 | Couper une vidéo sur iPhone et Android | couper-video-telephone |
| G10 | compresser vidéo iphone | 210 | 0 | Compresser une vidéo sur téléphone | compresser-video-telephone |
| G01 | extraire son video iphone | 170 | 0 | Extraire le son d’une vidéo sur iPhone | extraire-son-video-iphone |
| G11 | convertir mov en mp4 | 4 400 | 0 | Convertir un MOV en MP4 : méthode locale | convertir-mov-mp4 |
| G12 | créer un gif à partir d'une vidéo | 590 | 0 | Créer un GIF à partir d’une vidéo | creer-gif-video |
| G30 | mov vs mp4 | 90 | 0 | MOV ou MP4 : quelle copie conserver ? | mov-ou-mp4 |
| G02 | convertir enregistrement écran en mp3 | ND | ND | Convertir une capture vidéo en MP3 | enregistrement-ecran-mp3 |
| G16 | 30 fps ou 60 fps | 50 | 27 | Vidéo à 30 ou 60 images par seconde | video-30-ou-60-fps |
| G19 | image clé | 390 | 4 | Images clés vidéo : comprendre la coupe | images-cles-video |
| G17 | format vidéo tiktok | 480 | 0 | Format TikTok : ratio 9:16 et alternatives | format-video-tiktok |

Toutes ces données sont **France/fr**, pas les volumes américains. Une réponse de volume 0 est distincte de ND : `extraire audio vidéo iphone` et `extraire le son d'une vidéo iphone` sont retournés à **0**, alors que les formulations sans accents ci-dessus ont des estimations non nulles ; ne pas les additionner. Pour G02, la formulation spécifique n’est pas retournée ; le repère générique `convertir vidéo en mp3` est à 2 400/D0 mais **ce n’est pas le volume de la capture écran**. La traduction est maintenue parce qu’elle est expressément demandée, sans lui inventer de demande mesurée. `image clé` est un terme large, pas un volume garanti pour l’intention précise du guide. La requête GIF FR est classée transactionnelle ; le guide montrera la procédure et renverra à l’outil existant.

Les regroupements restent autorisés si une démonstration n’apporte pas de matière originale : les signaler dans le rapport plutôt que produire une page mince.

`keyword_metrics` a mesuré les 30 candidats, puis deux lots de 80 et 59 variantes/remplacements choisis après lecture des premiers résultats et des suggestions. `keyword_ideas` a exploré dix graines, 30 résultats maximum par graine, avec le même marché. Chaque appel facturable a été précédé de son dry-run gratuit. Aucun clickstream, `refresh=true`, SERP ou audit payant supplémentaire.

Le volume est l’estimation mensuelle renvoyée pour une formulation, pas un trafic garanti. Les variantes proches ne s’additionnent pas. La difficulté est le champ `difficulty` sur 100, **pas la concurrence publicitaire** ; une valeur 0 est conservée comme estimation fournisseur et ne prouve pas une absence de concurrence. **ND signifie que le fournisseur n’a retourné aucune ligne**, pas un volume nul. Seuil éditorial de présélection : ne pas ouvrir une page autonome pour une requête ND ou ≤40/mois ; les volumes 50–99 resteraient fragiles. Les 30 requêtes principales finalement retenues atteignent toutes au moins 140/mois.

L’intention ci-dessous reprend OpenSEO : **I** informationnelle, **T** transactionnelle, **N** navigationnelle. Le fournisseur classe 29 principales retenues I et « compress video for email » T ; cette dernière exige de vérifier avant rédaction que le guide de préparation répond à une demande distincte de la page outil. Cela ne dispense pas d’une revue de la page de résultats avant rédaction : une demande de conversion peut aussi attendre un outil. Le guide doit répondre par une procédure ou une démonstration, avec le lien vers la page outil existante ; aucune seconde page outil concurrente n’est proposée.

Le tri est reproductible : `score = 40 × min(log10(volume + 1) / 5, 1) + 25 × (1 − difficulté / 100) + 10 × adéquation + bonus GSC`. Adéquation **3** : usage direct d’une commande existante ou démonstration directement liée ; **2** : explication/diagnostic utile sans fonction de correction promise ; **1** : parcours natif TikTok, lien produit contextuel seulement. Le bonus GSC vaut **0 pour les 30 sujets** : aucun signal exact EN/US attribuable à une nouvelle page. Un signal dans une autre langue ou déjà capté par un guide n’est pas transformé en preuve de demande américaine. À égalité : volume, puis identifiant.

## Ordre de livraison validé — rangs figés pour les PR 2 et 3

Le slug est proposé sous `/blog/`. Les codes GSC renvoient au tableau Search Console plus bas : **0** aucun signal proche exploitable, **A** famille audio indirecte dans la lecture mondiale, **G** famille GIF indirecte dans la lecture mondiale, **T** thème TikTok déjà couvert par un guide existant. Ces trois derniers codes ne constituent pas un bonus de classement.

| Rang / ID | Score /100 | Requête principale | Volume /mois | Difficulté /100 | Int. | Adéquation / GSC | Slug proposé | Page outil à relier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 · G18 | 85.7 | how to trim a video on iphone | 9 900 | 5 | I | 3 / 0 | `trim-video-phone` | [/trim-video](https://vidfetch.app/trim-video) |
| 2 · G10 | 84.9 | how to compress a video from iphone | 5 400 | 0 | I | 3 / 0 | `compress-video-phone` | [/compress-video](https://vidfetch.app/compress-video) |
| 3 · G01 | 82.0 | how to extract audio from video on iphone | 2 400 | 0 | I | 3 / A | `extract-audio-phone` | [/video-to-mp3](https://vidfetch.app/video-to-mp3) |
| 4 · G11 | 80.9 | how to convert mov to mp4 | 4 400 | 13 | I | 3 / 0 | `mov-to-mp4` | [/compress-video](https://vidfetch.app/compress-video) |
| 5 · G07 | 78.1 | compress video for discord | 1 600 | 10 | I | 3 / 0 | `compress-video-discord` | [/compress-video](https://vidfetch.app/compress-video) |
| 6 · G02 | 77.9 | screen recording to mp3 | 1 600 | 11 | I | 3 / A | `screen-recording-to-mp3` | [/video-to-mp3](https://vidfetch.app/video-to-mp3) |
| 7 · G19 | 77.7 | what is a keyframe | 1 300 | 9 | I | 3 / 0 | `video-keyframes` | [/trim-video](https://vidfetch.app/trim-video) |
| 8 · G12 | 75.4 | how to make a gif from a video | 5 400 | 38 | I | 3 / G | `make-gif-from-video` | [/video-to-gif](https://vidfetch.app/video-to-gif) |
| 9 · G20 | 74.2 | video compression artifacts | 480 | 9 | I | 3 / 0 | `video-compression-artifacts` | [/compress-video](https://vidfetch.app/compress-video) |
| 10 · G14 | 73.6 | gif frame rate | 210 | 0 | I | 3 / G | `gif-frame-rate` | [/video-to-gif](https://vidfetch.app/video-to-gif) |
| 11 · G05 | 73.5 | mono vs stereo | 3 600 | 0 | I | 2 / A | `mono-vs-stereo` | [/video-to-mp3](https://vidfetch.app/video-to-mp3) |
| 12 · G30 | 73.5 | mp4 vs mov | 3 600 | 0 | I | 2 / 0 | `mov-vs-mp4` | [/compress-video](https://vidfetch.app/compress-video) |
| 13 · G03 | 71.6 | mp3 bitrate | 320 | 14 | I | 3 / A | `choose-mp3-bitrate` | [/video-to-mp3](https://vidfetch.app/video-to-mp3) |
| 14 · G13 | 71.1 | gif quality | 210 | 10 | I | 3 / G | `gif-quality` | [/video-to-gif](https://vidfetch.app/video-to-gif) |
| 15 · G29 | 70.6 | video black bars | 1 600 | 0 | I | 2 / 0 | `video-black-bars` | [/compress-video](https://vidfetch.app/compress-video) |
| 16 · G08 | 69.9 | compress video for email | 590 | 29 | T | 3 / 0 | `compress-video-email` | [/compress-video](https://vidfetch.app/compress-video) |
| 17 · G16 | 69.0 | 30 vs 60 fps | 1 000 | 0 | I | 2 / 0 | `30-vs-60-fps` | [/compress-video](https://vidfetch.app/compress-video) |
| 18 · G09 | 68.1 | compress video for whatsapp | 210 | 22 | I | 3 / 0 | `compress-video-whatsapp` | [/compress-video](https://vidfetch.app/compress-video) |
| 19 · G06 | 67.9 | cbr vs vbr | 720 | 0 | I | 2 / A | `cbr-vs-vbr` | [/video-to-mp3](https://vidfetch.app/video-to-mp3) |
| 20 · G22 | 67.2 | video codec not supported | 590 | 0 | I | 2 / 0 | `unsupported-video-codec` | [/compress-video](https://vidfetch.app/compress-video) |
| 21 · G23 | 67.2 | no audio in video | 590 | 0 | I | 2 / A | `video-no-audio` | [/video-to-mp3](https://vidfetch.app/video-to-mp3) |
| 22 · G24 | 67.2 | audio out of sync with video | 590 | 0 | I | 2 / 0 | `audio-video-sync` | [/trim-video](https://vidfetch.app/trim-video) |
| 23 · G15 | 63.8 | how to reduce video resolution | 210 | 39 | I | 3 / 0 | `reduce-video-resolution` | [/compress-video](https://vidfetch.app/compress-video) |
| 24 · G21 | 63.2 | video metadata | 390 | 10 | I | 2 / 0 | `read-video-metadata` | [/video-to-mp3](https://vidfetch.app/video-to-mp3) |
| 25 · G17 | 71.8 | tiktok aspect ratio | 2 400 | 1 | I | 2 / 0 | `tiktok-aspect-ratio` | [/compress-video](https://vidfetch.app/compress-video) |
| 26 · G28 | 61.2 | how to save tiktok draft to camera roll | 1 900 | 0 | I | 1 / T | `save-tiktok-draft` | [/tiktok-video-downloader](https://vidfetch.app/tiktok-video-downloader) |
| 27 · G26 | 59.8 | video file corrupted | 260 | 18 | I | 2 / 0 | `corrupted-video-file` | [/trim-video](https://vidfetch.app/trim-video) |
| 28 · G04 | 59.7 | sample rate vs bitrate | 140 | 10 | I | 2 / A | `sample-rate-vs-bitrate` | [/video-to-mp3](https://vidfetch.app/video-to-mp3) |
| 29 · G25 | 73.0 | split video into parts | 480 | 14 | I | 3 / 0 | `split-video-into-parts` | [/trim-video](https://vidfetch.app/trim-video) |
| 30 · G27 | 52.8 | how to download tiktok data | 320 | 9 | I | 1 / T | `download-tiktok-account-data` | [/tiktok-video-downloader](https://vidfetch.app/tiktok-video-downloader) |

## Angle distinct et limites pour chaque sujet

Ces lignes sont des spécifications éditoriales, pas des guides rédigés. Les expériences sont **à réaliser**, leurs résultats ne sont pas encore disponibles. Si un sujet ne justifie finalement qu’une réponse courte déjà contenue dans un autre guide, le fusionner en revue au lieu de remplir artificiellement 900 mots.

- **G18** — Procédure de découpe sur mobile, fichier local et téléchargement, avec Android dans la même page. Montrer début/fin réels, renvoyer à G19 pour les images clés ; aucun outil de crop.
- **G10** — Procédure mobile, fichiers et téléchargement, contraintes Safari/Chrome. Inclure Android dans la même page ; distinguer ce parcours du guide général de compression en ligne de commande.
- **G01** — Procédure mobile sur fichier déjà présent, iPhone et Android réunis. Sélection du fichier, codec et sauvegarde ; ne pas refaire le tutoriel FFmpeg de video-to-audio ni créer une page Android jumelle.
- **G11** — Conversion d’un MOV personnel compatible, codec réel, re-encodage et vérification du MP4. Sortie MP4 conditionnelle aux encodeurs du navigateur ; signaler le fallback WebM, pas de conversion universelle HEVC.
- **G07** — Livraison d’un clip dans Discord : plafond effectif du compte à vérifier officiellement, estimation, contrôle du fichier final et échec éventuel. Ne pas reprendre le guide général reduce-video-size.
- **G02** — Cas des captures d’écran vidéo personnelles : vérifier présence et origine du son, puis extraire. Pas de méthode pour enregistrer un flux protégé ; pas de duplication du parcours mobile général.
- **G19** — Démonstration de la frontière d’image clé en mode copie versus coupe réencodée. Référence sur la précision et les compromis ; ne pas doubler le tutoriel mobile de découpe.
- **G12** — Une seule procédure complète de création depuis une vidéo locale, sélection d’extrait et sauvegarde. Pas de GIF depuis URL YouTube ni de GIF vers vidéo ; réserver qualité et timing aux deux références spécialisées.
- **G20** — Reconnaître blocs, halos et pertes de détails par scènes tests. Diagnostic visuel ; ni recette générique de réduction de taille ni restauration de détail absent de la source.
- **G14** — Cadence, durée, arrondi des délais et lecture de la même animation à 5/10/15 fps. Référence temporelle ; ne pas réécrire le tutoriel de création ou le diagnostic de couleurs.
- **G05** — Canaux, localisation et compatibilité d’un enregistrement personnel ; inspecter les résultats. Aucun commutateur mono/stéréo ni séparation de voix à annoncer.
- **G30** — Choix du conteneur lors d’un export et conservation de l’original ; comparer les mêmes pistes audio/vidéo. Réserver le tutoriel de conversion à G11, les codecs à h264-h265-av1 et WebM à mp4-vs-webm.
- **G03** — Comparer 128/192/320 sur les mêmes sources autorisées, taille et écoute à niveau égal. Décision sur le débit seulement ; réserver codecs/conteneurs à mp3-vs-m4a et les unités vidéo à bitrate-vs-resolution.
- **G13** — Artefacts de palette et qualité visuelle, avec scènes et gradients comparés ; expliquer la limite de couleurs. Ne pas prétendre réparer/importer un GIF existant ou disposer d’un réglage de palette/dithering.
- **G29** — Détecter bandes encodées versus ajoutées par le lecteur et expliquer la mesure des dimensions. Pas de suppression de bandes/crop promis ; guide de diagnostic, distinct de la définition des ratios G17.
- **G08** — Pièce jointe, encodage du message et limites du fournisseur ; un seul guide couvre Gmail/Outlook. Aucun plafond universel ni envoi depuis VidFetch.
- **G16** — Comparer cadence du fichier, mouvement et source ; aucune interpolation ni conversion 30→60 à promettre. Réserver le cas GIF et ses délais à G14.
- **G09** — Envoi vidéo versus document, qualité et limites officielles à vérifier ; tester la copie locale. Pas de garantie que WhatsApp conservera le fichier ou la qualité inchangés.
- **G06** — Débit constant/variable et prévisibilité de taille sur des exemples. Référence de lecture des fichiers, distincte du choix 128/192/320 ; ne pas inventer un sélecteur CBR/VBR.
- **G22** — Refus du navigateur : différencier décodage, encodage et conteneur sur fichiers valides. Cas du traitement local ; ne pas refaire video-format-smartphone ni installer/contourner des codecs par un service distant.
- **G23** — Différencier piste absente, piste silencieuse et audio non décodable. Fichiers de test positifs/négatifs ; ne pas promettre recréation de son ou rétablissement de musique retirée par une plateforme.
- **G24** — Diagnostiquer un décalage déjà présent ou constaté après coupe par comparaison temporelle. Aucun curseur de resynchronisation ni réparation automatique à annoncer.
- **G15** — Manipulation des plafonds de dimensions sur une même vidéo, relevé des pixels obtenus et absence d’agrandissement. Tutoriel mesuré ; renvoyer les définitions à 720p-1080p-4k et le budget de débit à bitrate-vs-resolution.
- **G21** — Lire conteneur, codec, pistes, débit et durée d’un fichier sans le modifier. Inclure how to check video codec ici ; VidFetch n’est pas un inspecteur complet ni un effaceur de métadonnées.
- **G17** — Format et ratio des vidéos TikTok (9:16), avec 16:9, 1:1 et 4:5 pour comparer la géométrie. Aucun recadrage promis ; G29 diagnostique les bandes déjà encodées ou ajoutées par le lecteur, sans refaire cette explication des formats.
- **G28** — Sauvegarde native avant publication et limites des brouillons, sur son propre contenu. Revalider la procédure officielle avant rédaction ; pas de récupération privée, pas de publication provisoire comme détour, VidFetch n’accède pas aux brouillons.
- **G26** — Distinguer fichier local tronqué/structure illisible et incompatibilité, garder une copie. Diagnostic de fichier, séparé des échecs réseau/quotas de video-download-fails ; aucune réparation garantie.
- **G04** — Distinguer fréquence d’échantillonnage et débit avec lecture des pistes ; inclure 44,1/48 kHz ici. Ne pas promettre un réglage de fréquence dans l’interface.
- **G25** — Découper une vidéo personnelle en plusieurs fichiers par sélections successives et sauvegardes distinctes. Réinitialiser/réouvrir le même original si nécessaire ; aucun lot ni découpage automatique. G18 reste une seule coupe mobile, G19 explique les images clés. Démontrer deux sorties et leur couverture temporelle avant de conserver une page séparée.
- **G27** — Export natif de données de son propre compte : ce qui est documenté et limites de l’archive. Le lien vers l’outil est contextuel pour une vidéo publique autorisée distincte ; VidFetch n’exporte aucun compte ni brouillon.

## Décision sur chacun des 30 candidats initiaux

Les remplacements de **même intention** sont distingués des **remplacements éditoriaux**, qui changent volontairement la tâche. Les nouveaux sujets G05, G15, G19, G24, G25, G29 et G30 complètent les places libérées ; ils ont leurs propres mesures et angles ci-dessus. Une fusion libère une place : trente propositions ne signifient pas trente candidats initiaux à publier.

| N° | Requête initiale | Volume / difficulté / intention OpenSEO | Décision et destination | Justification / variante |
| --- | --- | --- | --- | --- |
| 1 | download my own tiktok videos | ND / ND / ND | **Fusionner** → save-tiktok-phone-gallery / why-cant-i-save-tiktok existants | La variante proposée par OpenSEO « why wont tiktok let me download my own videos » (210 ; D1 ; I) reprend le diagnostic du second guide. La variante sans filigrane (40 ; D20) est exclue. |
| 2 | how to allow downloads on tiktok | 30 / 6 / I | **Intégrer à l’existant** → why-cant-i-save-tiktok | 30/mois ; variantes enable (20 ; D47) et turn on (30 ; D2) non supérieures. Une section sur ses propres réglages suffit, sans contournement des choix du créateur. |
| 3 | save tiktok drafts to camera roll | 70 / 6 / I | **Reformuler** → G28 | Variante mesurée « how to save tiktok draft to camera roll » : 1 900 ; D0 ; I, contre 70. Même tâche native, sans accès aux brouillons par VidFetch. |
| 4 | download tiktok video on pc | 70 / 39 / T | **Écarter comme page autonome** → G18, remplacement éditorial | 70 ; D39 et recouvrement du téléchargement déjà expliqué. La variante computer (10 ; D0 ; T) est pire. Remplacement d’intention assumé par une procédure locale de découpe mobile. |
| 5 | saved tiktok video blurry | ND / ND / ND | **Intégrer à l’existant** → 720p-1080p-4k / bitrate-vs-resolution | La variante « why are my tiktok videos blurry » atteint seulement 90 ; D0 et vise aussi la publication, pas uniquement le fichier enregistré. Les nouveaux diagnostics locaux sont G20/G22, sans promesse de restaurer du détail. |
| 6 | saved tiktok video no sound | ND / ND / ND | **Remplacer** → G23 | « tiktok no sound » (210 ; D0 ; I) est plus large et vise aussi l’application ; ce n’est pas une variante de même intention. G23 cible « no audio in video » (590 ; D0), diagnostic d’un fichier autorisé, sans rétablir une musique retirée. |
| 7 | save tiktok photo slideshow | ND / ND / ND | **Écarter** → G12, remplacement éditorial | Un slideshow/photos n’est pas un téléchargement vidéo pris en charge. Remplacement d’intention : créer un GIF depuis sa vidéo, sans annonce de prise en charge des publications photo. |
| 8 | download tiktok data | 140 / 7 / T | **Reformuler** → G27 | « how to download tiktok data » : 320 ; D9 ; I, contre 140 ; D7 ; T. Export natif de son compte, distinct d’une sauvegarde garantie de toutes les vidéos. |
| 9 | how to copy tiktok link | 110 / 3 / I | **Intégrer à l’existant** → save-tiktok-sound-mp3 / video-download-fails | 110 ; D3. Une étape de copie du lien figure déjà dans les guides ; la variante avec « a » n’atteint que 30 ; D0. |
| 10 | can i repost someone's tiktok | ND / ND / ND | **Écarter** → G26, remplacement éditorial | Demande de permission/republication potentiellement juridique, faible lien avec une commande du produit. Aucun conseil juridique ni règle universelle ; place réaffectée au diagnostic de fichier corrompu. |
| 11 | extract audio from video iphone | 1600 / 0 / I | **Reformuler** → G01 | Suggestion OpenSEO « how to extract audio from video on iphone » : 2 400 ; D0 ; I, contre 1 600. Procédure mobile spécifique, sans nouvelle page générique video-to-audio. |
| 12 | extract audio from video android | 390 / 8 / I | **Fusionner** → G01 | 390 ; D8. Même résultat utilisateur que le parcours iPhone : section Android dans un guide mobile unique, pas une seconde page quasi identique. |
| 13 | 128 vs 320 kbps | 40 / 0 / I | **Élargir en un guide unique** → G03 | 40 ; D0. Les variantes 128kbps/320kbps atteignent 90 ; D0. Requête principale « mp3 bitrate » (320 ; D14), avec les trois débits réellement proposés ; ne pas additionner les variantes. |
| 14 | aac vs mp3 | 880 / 8 / I | **Intégrer à l’existant** → mp3-vs-m4a | 880 ; D8 mais AAC est déjà au cœur de la comparaison MP3/M4A ; cannibalisation. Place réaffectée à G04, question différente sur fréquence et débit. |
| 15 | convert screen recording to mp3 | 320 / 5 / I | **Reformuler** → G02 | « screen recording to mp3 » : 1 600 ; D11 ; I, contre 320 ; D5. Même conversion d’une capture vidéo locale personnelle. |
| 16 | compress video for whatsapp | 210 / 22 / I | **Conserver** → G09 | 210 ; D22 ; la variante « whatsapp video compression » reste à 210 ; D13 : aucun gain de demande démontré. Parcours de destination distinct du guide générique. |
| 17 | compress video for email | 590 / 29 / T | **Conserver** → G08 | 590 ; D29 ; T. Ne pas créer des clones Gmail (40) / Outlook (10). Revue éditoriale I/T : guide de livraison, page outil existante pour exécuter. |
| 18 | compress video for discord | 1600 / 10 / I | **Conserver** → G07 | 1 600 ; D10 ; I. « discord video compressor » (6 600 ; D19 ; T) est plus demandé mais attend surtout un outil : expression secondaire/lien vers /compress-video, pas remplacement de la requête du guide. |
| 19 | video file size calculator | 880 / 9 / I | **Écarter comme nouveau guide** → bitrate-vs-resolution ; G21 remplacement éditorial | 880 ; D9, mais intention de calculateur que le site n’offre pas. Formule déjà dans le guide existant ; G21 apporte un diagnostic de métadonnées distinct sans construire un calculateur. |
| 20 | convert mov to mp4 | 18100 / 15 / I | **Préciser** → G11 | 18 100 ; D15 ; I selon OpenSEO, avec forte composante outil en revue éditoriale. « how to convert mov to mp4 » (4 400 ; D13) convient mieux à une procédure honnête et conditionnelle. |
| 21 | free up storage videos phone | ND / ND / ND | **Écarter** → backup-your-videos ; G10 remplacement éditorial | Nettoyage/suppression et sauvegarde se recouvrent avec l’existant ; VidFetch ne gère pas le stockage du téléphone. G10 traite la compression mobile, mesurée, sans suppression automatique. |
| 22 | vertical video size for tiktok reels shorts | ND / ND / ND | **Fusionner** → G17 | Intention composée et chevauchement avec le ratio générique. « tiktok aspect ratio » (2 400 ; D1) est une variante de périmètre plus étroit, pas un total à ajouter ; cas TikTok dans G17, sans service de téléchargement Reels/Shorts. |
| 23 | how to trim a video | 1600 / 26 / I | **Recentrer** → G18 | Suggestion « how to trim a video on iphone » : 9 900 ; D5, contre 1 600 ; D26 pour le générique. Une procédure mobile avec Android dans la même page et renvoi à l’outil. |
| 24 | make gif from video | 9900 / 33 / I | **Recentrer en tutoriel** → G12 | 9 900 ; D33 pour le générique ; « how to make a gif from a video » : 5 400 ; D38, mieux formulé pour un guide. Les variantes sans « how » restent sur le même sujet, pas des pages nouvelles. |
| 25 | gif vs mp4 | 40 / 0 / I | **Écarter comme page autonome** → G13/G14, remplacements éditoriaux | 40 ; D0 ; gif vs video reste à 40, la variante file size à 10. Les places vont aux questions de qualité et cadence mesurées, en séparant les deux intentions. |
| 26 | 30 vs 60 fps | 1000 / 0 / I | **Conserver** → G16 | 1 000 ; D0 ; 30fps vs 60fps a le même volume et la même difficulté. Une seule page ; le produit n’annonce pas de sélecteur vidéo 30/60 fps. |
| 27 | are online video converters safe | ND / ND / ND | **Intégrer comme exigence transversale** → Tous les tutoriels locaux ; G22 remplacement éditorial | Suggestions vides ; « are video converters safe » également ND. Ne pas inventer une comparaison de sécurité ou des classements ; expliquer le flux local vérifié dans chaque procédure. |
| 28 | convert video in browser | ND / ND / ND | **Écarter comme guide générique** → Pages outils existantes ; G06 remplacement éditorial | « browser video converter » : 10 ; D50 ; T ; « local video converter » : 10 ; D0 ; T. La requête générique recoupe les outils et les tutoriels. G06 est une question distincte de lecture des débits. |
| 29 | video aspect ratio | 720 / 24 / I | **Conserver et fusionner le cas vertical** → G17 | 720 ; D24 ; ne pas retenir les suggestions « change aspect ratio » (1 600) : elles attendent recadrage/canevas non proposés par les outils. |
| 30 | how to check video codec | 30 / 6 / I | **Fusionner dans un guide plus complet** → G21 | 30 ; D6. « video codec checker » : 50 ; D0 mais intention d’inspecteur. Principal retenu « video metadata » : 390 ; D10 ; lecture de fichier, pas nouvel outil à annoncer. |

## Search Console disponible — gratuit

Source : `get_search_console_rows`, propriété `sc-domain:vidfetch.app`, dimensions `query,page`, `last_28_days`, limite 1 000. Période renvoyée : **08/10–04/11/2026 inclus**. Deux lectures : filtre **`country=usa`**, puis **tous pays**. Les positions sont des moyennes historiques, les impressions ne sont pas des volumes de recherche. Les variantes de domaine/chemin sont conservées comme reçues. Aucun rafraîchissement d’indexation ni soumission à Google.

La lecture américaine renvoie **8 lignes**, uniquement marque/variantes de « video fetch » : aucun signal thématique explicite pour les 30 sujets retenus dans cet extrait. La lecture mondiale renvoie **43 lignes**. L’absence dans ces lignes ne prouve pas une absence absolue d’impressions : Search Console ne restitue pas toutes les requêtes. Les signaux proches ci-dessous apparaissent dans la lecture mondiale et ne peuvent pas être attribués au marché américain ; ils soutiennent surtout les pages déjà en ligne.

| Code | Requête proche déjà visible | Page déjà positionnée | Impressions | Position | Utilisation dans le plan |
| --- | --- | --- | --- | --- | --- |
| A | convertir video de tik tok | https://vidfetch.app/es/tiktok-a-mp3 | 1 | 80 | Signal de famille seulement ; pas de bonus US. |
| A | descargar video tiktok mp3 | https://vidfetch.app/es/tiktok-a-mp3 | 1 | 73 | Signal de famille seulement ; pas de bonus US. |
| A | descargar videos de tik tok mp3 | https://vidfetch.app/es/tiktok-a-mp3 | 2 | 73 | Signal de famille seulement ; pas de bonus US. |
| A | descargar videos de tiktok mp3 | https://vidfetch.app/es/tiktok-a-mp3 | 1 | 72 | Signal de famille seulement ; pas de bonus US. |
| A | descargar videos tiktok mp3 | https://vidfetch.app/es/tiktok-a-mp3 | 2 | 74 | Signal de famille seulement ; pas de bonus US. |
| A | fetch audio | https://vidfetch.app/id/ | 1 | 7 | Signal de famille seulement ; pas de bonus US. |
| A | mp3 fetch | https://vidfetch.app/ | 1 | 50 | Signal de famille seulement ; pas de bonus US. |
| A | mp3 tiktok | https://vidfetch.app/tiktok-to-mp3 | 1 | 128 | Signal de famille seulement ; pas de bonus US. |
| T | mp4 tiktok | https://vidfetch.app/fr/telecharger-video-tiktok | 1 | 10 | Signal de famille seulement ; pas de bonus US. |
| A | pasar de video a mp3 | https://vidfetch.app/es/convertir-video-a-mp3 | 1 | 91 | Signal de famille seulement ; pas de bonus US. |
| T | télécharger vidéo tiktok mp4 | https://vidfetch.app/fr/telecharger-video-tiktok | 1 | 55 | Signal de famille seulement ; pas de bonus US. |
| T | vidget tiktok com | https://vidfetch.app/id | 1 | 8 | Signal de famille seulement ; pas de bonus US. |
| T | why cant i save videos on tiktok | https://vidfetch.app/blog/why-cant-i-save-tiktok | 2 | 8 | Position du guide existant : conserver sa cible, ne pas créer un clone. |
| G | تحويل الفيديو gif | https://vidfetch.app/ar/video-ila-gif | 2 | 89 | Signal de famille seulement ; pas de bonus US. |
| G | تحويل الفيديو الى gif | https://vidfetch.app/ar/video-ila-gif | 1 | 93 | Signal de famille seulement ; pas de bonus US. |
| G | تحويل فيديو الى gif | https://vidfetch.app/ar/video-ila-gif | 1 | 91 | Signal de famille seulement ; pas de bonus US. |
| G | تحويل من فيديو الى gif | https://vidfetch.app/ar/video-ila-gif | 1 | 89 | Signal de famille seulement ; pas de bonus US. |

Les familles « audio » et « GIF » ci-dessus ne prouvent pas une demande pour un tutoriel anglais américain : langues, pages et tâches diffèrent. Les requêtes de marque faibles « fetch audio » / « mp3 fetch » ne sont pas réinterprétées comme une demande générique d’extraction locale.

## Contrôle de cannibalisation et d’honnêteté produit

Les 13 guides EN publiés ont été relus par titre, description et sections : `720p-1080p-4k`, `backup-your-videos`, `bitrate-vs-resolution`, `h264-h265-av1`, `mp3-vs-m4a`, `mp4-vs-webm`, `reduce-video-size`, `save-tiktok-phone-gallery`, `save-tiktok-sound-mp3`, `video-download-fails`, `video-format-smartphone`, `video-to-audio`, `why-cant-i-save-tiktok`. Les sujets de permission/téléchargement déjà traités, l’AAC/MP3 et le calcul de taille sont affectés à ces guides, sans nouveau slug concurrent.

Les frontières les plus sensibles à valider en revue sont G01/G02 face à `video-to-audio`, G07–G11/G15 face à `reduce-video-size`, G12/G13/G14, G17/G29 et G11/G30. Les angles distincts sont fixés ci-dessus ; si les futures démonstrations n’apportent pas assez de matière originale, fusionner plutôt que publier deux réponses équivalentes. Le score ne mesure pas la cannibalisation ; cette appréciation vient de la lecture du contenu existant, sans analyse SERP supplémentaire.

Les pages outils EN existent dans `src/local-tools/catalogue.ts` : `/video-to-mp3`, `/compress-video`, `/trim-video`, `/video-to-gif`. Le comportement relu dans `src/local-tools/engine.worker.mjs` et les limites dans `src/local-tools/limits.ts` imposent notamment :

- Entrée avec piste vidéo obligatoire ; ne pas cibler M4A→MP3 comme outil de fichiers audio seuls. Pas de commande pour retirer le son, recadrer, normaliser l’audio, supprimer les métadonnées ou resynchroniser les pistes.
- MP3 local : 128/192/320 kbps ; M4A : copie de la piste AAC seulement. Le téléchargement TikTok MP3 à 192 kbps est un autre parcours ; ne pas lui attribuer les réglages locaux.
- MOV→MP4 conditionnel au décodage de la source et aux encodeurs disponibles ; WebM peut être choisi en fallback. Pas de garantie HEVC/HDR universelle.
- GIF créé depuis une vidéo : extrait ≤15 s, largeur 160/320/480/640, 5/10/15 fps, palette calculée à 256 couleurs maximum. Aucun import de GIF existant : « reduce gif file size » (2 400 ; D22) est écarté malgré son volume, car son intention d’outil n’est pas satisfaite.
- Découpe en copie liée aux images clés versus réencodage ; dimensions de compression conservant le ratio, sans agrandissement. Aucun contrôle d’interpolation 30/60 fps ou de recadrage à inventer.
- G22–G26/G29 sont des diagnostics et explications ; leur lien vers un outil ne promet aucune fonction de réparation. G27/G28 décrivent des parcours natifs TikTok : lien produit secondaire facultatif si pertinent, sans affirmer que VidFetch lit les données du compte ou les brouillons.

Ces constats sont des limites du code, pas des tests de procédures réalisés pour ce plan. Aucun nouveau test de conversion ni capture n’a été produit. Certaines sections des guides existants décrivent encore surtout l’ancien parcours serveur/FFmpeg ; ne pas les reprendre comme description des outils locaux actuels. Leur éventuelle mise à jour devra être revue dans la mission de rédaction, sans la déclencher ici.

## Sources et vérifications réservées à la rédaction

Consultation préparatoire du 07/11/2026 : [TikTok — Download content](https://support.tiktok.com/en/using-tiktok/exploring-videos/video-downloads//) décrit l’autorisation du créateur et la sauvegarde native avant publication ; [TikTok — Editing, posting, and deleting](https://support.tiktok.com/en/using-tiktok/creating-videos/editing-posting-and-deleting?lang=id) documente les limites de conservation/transfert des brouillons ; [MDN — Media Capabilities API](https://developer.mozilla.org/en-US/docs/Web/API/Media_Capabilities_API) distingue les capacités de décodage/encodage selon appareil et navigateur. Les pages TikTok peuvent rediriger vers un autre centre d’aide : revalider leurs contenus et chemins de menus au moment de rédiger.

Avant rédaction de G27, vérifier la documentation officielle TikTok de téléchargement des données, leur périmètre et les limites d’archive ; cette procédure n’a pas été testée. Avant G07–G09, vérifier les plafonds et conditions dans les centres d’aide officiels Discord/WhatsApp et les fournisseurs email, avec date de consultation : aucune limite chiffrée n’est présumée dans ce plan. Pour les comparaisons audio/vidéo, utiliser spécifications et documentation des encodeurs/outils, puis démonstrations reproductibles sur fichiers générés. L’auteur, l’identité de l’éditeur et les relectures ne sont pas inventés.

## Coût de l’étape et contrôles documentaires

Le plafond **global** est de 1,50 USD pour cette validation, non 1,50 USD par appel. Les dry-runs annoncent 0,04 USD maximum pour les candidats et chaque recherche de variantes, puis 0,06 et 0,05 USD pour les deux lots complémentaires. Les plafonds effectifs des appels réels totalisent **0,55 USD**, donc même leur somme maximale reste sous le budget.

| Opération | Appels réels | Plafond cumulé USD | Dépense renvoyée USD |
| --- | --- | --- | --- |
| keyword_metrics — 30 candidats | 1 | 0,04 | 0,04 |
| keyword_ideas — 10 graines × 30 lignes maximum | 10 | 0,40 | 0,37 |
| keyword_metrics — 80 variantes/remplacements | 1 | 0,06 | 0,05 |
| keyword_metrics — 59 angles complémentaires | 1 | 0,05 | 0,05 |
| Dry-runs correspondants | 13 | 0 | 0 |
| Search Console, US puis monde | 2 | 0 | 0 |
| **Total de cette étape** | **13 appels facturés** | **0,55** | **0,51 / 1,50** |

Les dix graines : download my own tiktok videos ; how to allow downloads on tiktok ; saved tiktok video blurry ; saved tiktok video no sound ; extract audio from video ; compress video ; make gif from video ; video aspect ratio ; are online video converters safe ; how to trim a video. Trois réponses sans suggestion coûtent 0,03 USD chacune ; les sept autres 0,04 USD chacune. Aucun coût nul n’est supposé pour une recherche sans résultat.

Les 30 + 80 + 59 formulations soumises comprennent des recouvrements ; ce ne sont pas 169 sujets ou volumes uniques à additionner. Les chiffres retenus et les 30 décisions initiales sont transcrits dans ce fichier. Les réponses brutes restent dans les preuves locales de session, sans ajout d’autre fichier à la PR.

Contrôles du livrable : 30 identifiants/slugs uniques, toutes les requêtes principales présentes dans une réponse OpenSEO US/en, classement recalculé, coûts et plafonds additionnés, absence de collision avec les 13 slugs EN existants, pages outils de destination existantes et `git diff --check`. Le plan initial a fait l’objet de la PR #40. Cette révision accompagne la PR des pages de confiance, sans publication automatique des contenus incomplets.
