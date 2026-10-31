# PR A — outils de conversion locale

Architecture : Next.js App Router, catch-all SSR/SSG dans `src/app/(site)/[[...segments]]`, registre `src/lib/site-pages.ts`, métadonnées centralisées et sitemap statique. Les nouveaux outils ont une identité dédiée et leur propre contenu (`content/local-tools.json`) et messages, sans modifier les dictionnaires compilés dans la passerelle. Navigation, pied de page, accueils et guides concernés sont reliés aux nouvelles pages. Le worker est généré au build et auto-hébergé dans `public/local-media/generated`. CI construit l’archive OVH ; `promote.py` protège les moteurs. Ni main ni Caddy actif ne sont modifiés. Cette révision concerne uniquement la PR #24 (`feat/local-tools`) ; aucune fusion ni modification de main ou de la PR #25.

## Choix technique et licences

| Option examinée | Téléchargement / mémoire | Compatibilité / vitesse | Licence |
|---|---|---|---|
| FFmpeg WASM, core mono-thread 0.12.10 + wrapper 0.12.15 | Core environ 31 Mio avant compression, mémoire linéaire et copie des fichiers | Large couverture codecs, calcul logiciel sur un seul thread ; pas de SharedArrayBuffer requis | Wrapper MIT, **core officiel GPL-2.0-or-later**, pas supposé LGPL |
| Mediabunny 1.65.0 + extension MP3 1.65.0 + gifenc 1.0.3, retenus | Engine 655 134 octets bruts, worker MP3 ~9 ko, LAME WASM ~216 ko ; uniquement après choix de fichier | Codecs natifs WebCodecs pour décodage/encodage, dépendants du navigateur ; MP3 logiciel LAME et GIF dans des workers | Mediabunny et extension **MPL-2.0**, gifenc MIT ; LAME **LGPL-2.0-or-later** |

Sources primaires : [FFmpeg WASM](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/main/packages/core/package.json), [Mediabunny codecs](https://mediabunny.dev/guide/supported-formats-and-codecs), [extension MP3](https://mediabunny.dev/guide/extensions/mp3-encoder), [LAME](https://lame.sourceforge.io/).

Les trois nouvelles dépendances sont épinglées en devDependencies et servent au build frontend uniquement ; aucune dépendance serveur existante ne change. LAME 3.100 a été reconstruit avec Emscripten 3.1.64 à partir de l’archive officielle vérifiée SHA-256, et le worker incorporé de l’extension a été remplacé par un worker distinct relinkable. Recette et provenance : `scripts/local-tools/lame/README.md`. L’archive source originale est versionnée en deux morceaux binaires de moins de 1 Mio pour respecter le contrôle de release ; elle est reconstituée et contrôlée au build sans téléchargement tiers. Le build produit les sources correspondantes, la copie modifiée de l’intégration et toutes les licences sur le même domaine. Le pied de page ouvre la section Licences de chaque page légale. Aucun avis, note ou statistique d’usage n’a été ajouté.

## Fonctionnement et limites effectivement appliquées

- MP3 : 128/192/320 kbps, piste audio principale ; M4A : copie AAC uniquement. Aucun décodage de la vidéo nécessaire à l’extraction audio. Vidéo sans audio : refus explicite.
- Compression : **MP4 H.264 + AAC prioritaire** lorsque les encodeurs nécessaires sont disponibles ; repli WebM VP8/Opus avec avertissement traduit indiquant qu’il peut ne pas s’ouvrir sur iPhone. Cibles vidéo 2 000 000 / 1 000 000 / 500 000 bit/s, audio 128 kbps. L’estimation inclut une marge ; ce n’est pas une taille garantie. Entrée UHD 4K admise, sortie vidéo limitée au grand côté 1920 / petit côté 1080, sans agrandissement ; hauteur optionnelle 360/480/720/1080.
- Coupe : copie forcée avec élargissement possible aux images clés et durée réelle affichée, ou réencodage précis réduit au plus à 1080p. Extrait initial de 30 s, modifiable. Une grosse entrée peut être admise tandis que sa copie intégrale en mémoire est refusée ; raccourcir l’extrait ou utiliser une sortie directe disponible.
- GIF : extrait ≤15 s ; largeur 160/320/480/640, cadence 5/10/15 ; palette optimisée, sans audio. Entrée 4K admise, résultat réduit ; sortie toujours en mémoire, sans prétendre bénéficier du flux fichier.

Source unique des plafonds : `src/local-tools/limits.ts`, appliquée au choix du fichier et dans le worker. Les paragraphes SSR des 32 pages interpolent ces valeurs côté serveur ; messages, métadonnées et avertissements des huit langues sont mis à jour.

| Outil | Entrée mobile / tactile / faible mémoire | Entrée desktop | Sortie en mémoire mobile / desktop | Arrêt traitement mobile / desktop |
|---|---|---|---|---|
| Audio MP3/M4A | 200 Mio, 5 min | 1 Gio, 20 min | 64 / 64 Mio | 15 / 30 min |
| Couper | 200 Mio, 5 min | 1 Gio, 20 min | 64 / 256 Mio | 15 / 30 min |
| Compresser | 200 Mio, 5 min | 500 Mio, 10 min | 64 / 256 Mio | 20 / 60 min |
| GIF | 200 Mio, 5 min de source | 500 Mio, 20 min de source | 16 / 32 Mio | 3 / 5 min |

Les plafonds taille/durée s’appliquent simultanément. Toutes les entrées sont limitées à 3840×2160 ou portrait 2160×3840. MiB/Mio = 1 048 576 octets ; GiB/Gio = 1 073 741 824 octets. Analyse limitée à 60 s. L’admission mobile est une **proposition fondée sur des mesures Mac, à valider sur téléphones physiques**, pas une garantie qu’une vidéo caméra 4K de cinq minutes passe sous 200 Mio.

`BlobSource` conserve un cache de lecture de 8 Mio ; il ne recopie pas toute l’entrée. Lorsque `showSaveFilePicker` est disponible et qu’un nouveau fichier est choisi, `StreamTarget` écrit dans `FileSystemWritableFileStream`, par blocs d’un Mio, avec backpressure et plafond réel de **2 Gio de fichier**. MP4 standard avec métadonnées finales, sans fast-start en mémoire ni rétention de tous les paquets. Aucun téléchargement de sortie vers un serveur. Sans sélecteur, repli `BufferTarget`, estimation avant conversion puis garde avant chaque croissance. Le budget désigne les octets du résultat, **pas la mémoire totale du navigateur**. Le repli concerne notamment Safari iOS et de nombreux Chrome Android ; la disponibilité est détectée, pas déduite de la marque du navigateur. Annulation : abandon du flux, arrêt des workers et révocation des ObjectURL ; les anciennes minuteries ne peuvent pas arrêter une nouvelle conversion. La destination est proposée sous un nouveau nom ; les noms identiques à la source sont refusés.

### Mesures mémoire effectuées

**84 profils conservés**, dont la matrice demandée de **48 cas** : quatre outils × tailles encodées proches de 50/200/500 Mio × 1080p/4K × Chromium/WebKit. Données et méthode : [tableaux](docs/LOCAL-TOOLS-MEMORY.md), [JSON brut](docs/LOCAL-TOOLS-MEMORY.json), scripts de génération/profilage dans `scripts/local-tools/`. Mac 32 Gio, huit cœurs ; Chrome/Chromium 156 et WebKit Playwright 27.2. Aucun téléphone ni Safari 26 matériel testé.

Le compteur natif `phys_footprint` inclut JS, décodeurs/GPU et autres allocations des processus du navigateur, avec les processus XPC WebKit. On ne l’additionne pas au JS. Il ne permet pas d’isoler exactement les décodeurs ou les services système partagés. Chromium expose heap et backing stores des pages/workers ; **WebKit n’expose ici qu’une catégorie JS partielle** (calibration avec tableau de 100 Mio non reflétée), donc aucun pic JS complet WebKit n’est inventé. Pics échantillonnés avec délai de 100 ms et surcoût de mesure ; RSS et majorants par processus également conservés. Les temps de conversion sont des observations de laboratoire, pas des délais promis sur téléphone.

La copie intégrale de ~500 Mio en mémoire atteint **1 517–1 521 Mio physiques Chromium**, **2 982–2 989 Mio WebKit** ; MP3 reste à ~730–762 / 482–496 Mio respectivement. Compression de 4K ~500 Mio : ~730 / 764 Mio, sortie réduite en MP4 ; sous WebKit elle prend ~483 s pour ~305 s de source, ce qui justifie le protocole de durée et les délais distincts. GIF 4K : ~581 / 281 Mio. Ces chiffres incluent la base du navigateur. La matrice isolée autorise volontairement les grosses sorties pour mesurer le problème ; cette dérogation n’existe dans aucun actif de production.

Avec les limites finales, les quatre copies intégrales de 500 Mio en repli mémoire sont refusées `OUTPUT` avant allocation (pics ~438–453 Mio Chromium / ~160–164 Mio WebKit). Huit essais avec le profil mobile **sur Mac** ont réussi depuis des sources encodées ~195 Mio / 4 min 59 s : MP3 complet et coupes de 30 s, dans les deux résolutions/navigateurs. Huit autres ont réussi depuis ~1 011–1 014 Mio / 19 min 50 s sous le profil desktop. Quatre sorties complètes depuis ces grosses sources ont réussi en flux sous Chromium ; la coupe de ~1 Gio reste à ~1,6 Gio physiques. L’écriture en flux est testée avec un vrai handle OPFS substitué à la boîte de dialogue native ; le sélecteur système et les destinations mobiles restent à vérifier manuellement.

Les mires répètent dix secondes de contenu et ne sont pas des prises de vue HEVC/HDR. Leur AAC copié en boucle comporte des trous d’horodatage : Chromium conserve la durée des échantillons décodés, WebKit remplit les trous (jusqu’à ~1,9 s d’écart sur 19 min 50 s ; analyse ffprobe détaillée dans le rapport mémoire). Ce n’est pas une preuve de synchronisation d’un enregistrement caméra continu. Les fixtures avec remplissage `free` restent uniquement des tests d’admission exacte à 200 Mio / 1 Gio et de refus un octet au-dessus ; elles ne servent à aucune conclusion mémoire.

Safari 26+ est nécessaire aux opérations utilisant AudioDecoder/AudioEncoder ([WebKit](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)). Les codecs réels sont contrôlés à l’exécution, sans repli serveur. La copie AAC n’exige pas d’encodeur audio ; l’entrée HEVC dépend de l’opération et des codecs de l’appareil.

AdSense est absent des pages outils locales : aucun contact tiers pendant l’utilisation. Le test réseau interdit requêtes tierces, méthodes autres que GET et corps réseau ; aucun POST d’API n’est effectué. Les fichiers ne sont pas envoyés. La sélection reste explicite, le moteur lourd est dans un worker et son chargement est paresseux. Aucun COOP/COEP ni changement du Caddyfile actif. Next sert le WASM en `application/wasm` ; la validation du cache/CSP Cloudflare actif revient à l’administrateur. Si une CSP est introduite, autoriser les workers same-origin et la compilation WASM selon les navigateurs ; ne pas imposer d’isolation cross-origin. Purger le cache des assets de conversion après mise à jour.

## Nouvelles URL (32, aucun conflit de slug)

- en: `https://vidfetch.app/video-to-mp3`, `https://vidfetch.app/compress-video`, `https://vidfetch.app/trim-video`, `https://vidfetch.app/video-to-gif`
- fr: `https://vidfetch.app/fr/convertir-video-en-mp3`, `https://vidfetch.app/fr/compresser-video`, `https://vidfetch.app/fr/couper-video`, `https://vidfetch.app/fr/video-en-gif`
- es: `https://vidfetch.app/es/convertir-video-a-mp3`, `https://vidfetch.app/es/comprimir-video`, `https://vidfetch.app/es/cortar-video`, `https://vidfetch.app/es/video-a-gif`
- pt-BR: `https://vidfetch.app/pt/converter-video-para-mp3`, `https://vidfetch.app/pt/comprimir-video`, `https://vidfetch.app/pt/cortar-video`, `https://vidfetch.app/pt/video-para-gif`
- id: `https://vidfetch.app/id/konversi-video-ke-mp3`, `https://vidfetch.app/id/kompres-video`, `https://vidfetch.app/id/potong-video`, `https://vidfetch.app/id/video-ke-gif`
- de: `https://vidfetch.app/de/video-in-mp3-umwandeln`, `https://vidfetch.app/de/video-komprimieren`, `https://vidfetch.app/de/video-schneiden`, `https://vidfetch.app/de/video-in-gif`
- it: `https://vidfetch.app/it/convertire-video-in-mp3`, `https://vidfetch.app/it/comprimere-video`, `https://vidfetch.app/it/tagliare-video`, `https://vidfetch.app/it/video-in-gif`
- ar: `https://vidfetch.app/ar/tahwil-video-ila-mp3`, `https://vidfetch.app/ar/daght-video`, `https://vidfetch.app/ar/qass-video`, `https://vidfetch.app/ar/video-ila-gif`

Chaque page a son contenu serveur de 700–1000 mots, trois étapes visibles propres au choix de sortie, un H1, title ≤60, description ≤155, un groupe réciproque complet de huit langues, x-default EN, canonical et JSON-LD WebApplication gratuit/Breadcrumb/FAQ identique au texte visible. Les guides de compression/résolution/bitrate renvoient au compresseur ; les guides audio/MP3-M4A à l’extracteur. Les liens retour ciblent les guides réellement disponibles dans la langue, ou leurs versions anglaises explicitement signalées lorsque la traduction n’est pas publiée. Aucune route de guide brouillon n’est liée.

## Vérifications et limites de l’environnement

- `npm test` : **185 tests passés**, 0 échec.
- `npm run lint`, `npm run typecheck`, `npm run check:release` : passés.
- Build de production `VIDFETCH_TARGET=ovh npm run build -- --webpack` : passé. Le build Turbopack normal rencontre une restriction locale de port interne, également sur main ; ce n’est pas présenté comme un succès local. Le workflow Linux conserve le build normal.
- `npm run seo-check` : **82 URL, PASS**, HTTP, index, SSR sans JS, hreflang, canonical, FAQ JSON-LD, liens internes et actifs de licences en 200, 301 et 404. `npm run test:i18n` : huit accueils, 16 transferts TikTok localisés et erreurs de quota, RTL, sélecteurs et API existantes passés.
- Tests locaux : **25 sorties Chromium et 22 WebKit contrôlées par ffprobe** (MP4/H.264, MOV/H.264-AAC, WebM/VP8-Opus, quatre outils, trois débits MP3, AAC copié, coupe précise et trois profils de compression, réduction 4K, priorité MP4 et repli WebM forcé, trois sorties en flux Chromium), 32 pages et erreurs traduites, chargement différé, annulation et refus de taille. Aucun envoi ni contact tiers détecté. Annulation d’un flux à écriture retardée : destination préexistante conservée ; annulation du sélecteur et repli mémoire si indisponible testés. Fixtures générées avec FFmpeg ; aucun média tiers téléchargé.
- Backend existant : 17 tests passés. Passerelle existante : 3 tests passés ; charge/file : 5 tests passés. Le test Python de déploiement via conteneurs est très long localement ; sa validation complète est confiée au workflow Linux. Les logs locaux ne sont pas présentés comme une réussite de toute la suite Python.
- Recompilation des moteurs à partir de main et des deux branches : SHA-256 identiques. OVH `fa0d3d4e15a5a45ca0deb2b35e7ba03adc95c31b87500378068121f291c42287`, passerelle `0fa1404530c272b76aaec9aee18125660e8561c744e4ccc1fbb9c7dbee9850e5` (comparaison avec le même esbuild local). Aucun fichier de moteur protégé ni comportement YouTube modifié.

## Performances

Builds OVH de main (`3eea9bd1`) et de cette branche  même Chrome  trois répétitions. JS initial : **609 083 → 619 174 octets bruts (+1.66 %)**  gzip **191 176 → 194 741 (+1.86 %)** sur les quatre pages communes. /video-to-mp3 a le même budget initial. L’engine de 655 134 octets  le worker MP3 de 9 064 et LAME de 216 438 sont chargés seulement après sélection  jamais au premier affichage.

Lighthouse mobile standard : trois essais par branche et page en alternant l’ordre ; requêtes tierces bloquées de façon identique. Médianes :

| Page | LCP main → PR (ms) | Écart | CLS main → PR | TBT main → PR (ms) | Écart TBT |
|---|---|---|---|---|---|
| / | 817.3 → 816.9 | -0.05 % | 0 → 0 | 37 → 40 | +8.11 % |
| /id/download-video-tiktok | 815.2 → 815.2 | -0.00 % | 0 → 0 | 35 → 34 | -2.86 % |
| /fr/tiktok-en-mp3 | 814.1 → 813.8 | -0.04 % | 0 → 0 | 36 → 37 | +2.78 % |
| /blog/mp4-vs-webm | 814.4 → 813.2 | -0.15 % | 0 → 0 | 34 → 36 | +5.88 % |

Score Lighthouse 100 sur les 24 essais. **Aucune régression supérieure à 10 % sur LCP  CLS  TBT ou JS initial** dans cette série. Les budgets demandés de LCP et JS initial sont respectés. Un relevé complémentaire avec Chrome mobile simulé 390×844  CPU ×4  réseau 1 6 Mbit/s / latence 40 ms est également conservé. Il s’agit de laboratoire  pas de Core Web Vitals terrain ou de mémoire de téléphone. Données brutes : `docs/LOCAL-TOOLS-VALIDATION.json` ; mémoire dans `docs/LOCAL-TOOLS-MEMORY.json`.


CI : [workflow de la PR A](https://github.com/aouirdani/vidfetch/actions?query=branch%3Afeat%2Flocal-tools), avec fixtures FFmpeg, confidentialité et conversions. La validation définitive est celle des checks du dernier commit ; aucun push main n’est effectué.

## Actions humaines

Relire les huit langues ; priorité arabe (termes du worker, ordre des unités latines) et indonésien (« keyframe », « pengodean ulang presisi », différence galeri/Downloads). Faire vérifier les formulations techniques de coupe sur image clé, bitrate cible et copies AAC dans toutes les langues. Plusieurs explications médias reprennent notre prose éditoriale existante, sélectionnée par sujet ; elles ne constituent pas une validation native indépendante.

Appliquer le protocole appareils ci-dessous sur iPhone/Safari 26 et Android/Chrome, en particulier mémoire, HEVC/HDR/rotation, plafonds par outil, copie sur images clés et destination Photos/galerie. Tester les formats de sortie dans les applications destinataires. Vérifier MIME/cache/CSP à travers le Caddy et Cloudflare actifs, sans toucher leur configuration dans cette PR. La PR restera en brouillon tant que ces validations matérielles ne sont pas faites.

Après validation et déploiement humain : purge Cloudflare, inspection Search Console EN/FR/ID/PT de chacun des quatre outils, soumission de `https://vidfetch.app/sitemap.xml`, puis demande d’indexation des nouvelles URL. Aucune fusion ou activation de production réalisée.

Les accueils et pages légales portent le 30/10 comme date réelle de leur ajout de liens/licences. Le timing GIF à 15 i/s est réparti en centièmes pour éviter un allongement artificiel ; un test vérifie une seconde réelle ainsi que les débits MP3 mesurés.

WebKit affiche des erreurs de préchargement RSC lors des navigations rapides et des messages Blob lors de l’annulation ; les 22 sorties WebKit et les contrôles réseau passent. Le contrôle sur Safari matériel reste à faire.

La première CI Linux a bien construit la release mais a signalé le contrat explicite Caddy encore limité à 50 routes. Les 32 URL ont été ajoutées à la fixture, sans assouplir le crawler ni les gates. Le test unitaire compare désormais le registre indexable et ce contrat avant construction.

Le test ciblé avec le vrai Caddyfile public et Docker est désormais **PASS : 82 routes attendues**, avec accès 200 aux workers, WASM et licences/sources, MIME `application/wasm` et absence de COOP/COEP. Seuls TLS et l’adresse upstream sont adaptés en local ; Caddy actif reste intact. Lecture seule de l’accueil public le 31/10 : HTTP 200, CSP/COOP/COEP absents, Cloudflare DYNAMIC. Les nouveaux assets ne sont pas encore en production : cache et en-têtes de leurs URL Cloudflare restent à contrôler après déploiement.

Le WASM incorpore aussi le runtime de compilation : Emscripten 3.1.64 (MIT ou NCSA, MIT retenue), musl (MIT avec notices additionnelles) et compiler-rt (Apache-2.0 WITH LLVM-exception). Les textes exacts extraits de l’image de compilation sont auto-hébergés dans la section Licences et inclus dans le kit source, avec les références au code du SDK. Ces composants ne changent pas la licence LGPL du code LAME ni la MPL du pont.

## Protocole opérateur avant les essais sur appareils

La PR reste en brouillon. Les mesures Playwright sur Mac ne valident ni la mémoire d’un téléphone, ni Safari 26 sur iPhone. Prévoir un iPhone récent sous **Safari 26** et un Android récent sous **Chrome**, sans navigateur intégré à une application. Noter modèle, RAM si connue, versions OS/navigateur, stockage libre et mode économie d’énergie. Utiliser uniquement ses propres enregistrements ; conserver les originaux en sauvegarde. Si un poste de profilage est disponible, joindre les compteurs Web Inspector/DevTools et les mesures système Instruments/Android Studio ; ne pas assimiler la taille du heap JS à la mémoire totale des décodeurs. Noter toute impossibilité de mesure.

Sur **chaque appareil**, filmer une mire mobile avec du son pendant **30 s, 2 min et 5 min**, en **1080p puis en 4K** : six sources par appareil, chacune essayée avec les quatre outils. Ajouter au moins un MOV **HEVC enregistré par l’iPhone**, avec son, orientation portrait ; noter s’il est HDR. Un fichier H.264 synthétique renommé MOV ne couvre pas cet essai. Relever taille exacte, durée, codecs, orientation et fréquence d’images. Conserver les fichiers dépassant 200 Mio : leur refus attendu est un résultat utile, pas un succès de conversion. Les plafonds taille/durée s’appliquent simultanément ; une vidéo caméra de 5 minutes en 4K peut dépasser le plafond d’entrée et être refusée.

| Outil | Manipulations sur chacune des six sources | Résultat attendu dans les limites |
|---|---|---|
| Audio | MP3 à 128, 192 et 320 kbps ; M4A sur piste AAC ; M4A sur autre codec | MP3 sans piste vidéo, durée proche de la source ; M4A copie AAC sans réencodage, refus traduit si la piste n’est pas AAC. HEVC concerne la vidéo : l’extraction audio ne doit pas exiger de la décoder. |
| Compresser | Trois préréglages ; sortie automatique puis 720p ; essayer les entrées 4K portrait/paysage | MP4 H.264/AAC si les encodeurs existent, sinon WebM VP8/Opus avec avertissement iPhone. Aucun agrandissement, grand côté ≤1920 et petit côté ≤1080 ; son présent si la source en a. Comparer estimation et taille réelle, sans exiger un fichier toujours plus petit. Le préréglage léger sur cinq minutes peut dépasser le budget mémoire mobile : refus avant encodage, ou choisir équilibré/fort. |
| Couper | Extrait 10–30 s au milieu ; copie sur images clés, puis coupe précise ; tenter aussi toute la source | Copie sans réencodage pouvant élargir aux images clés ; durée réelle affichée. Coupe précise proche des bornes choisies, sortie réduite au plus à 1080p. Une copie intégrale dépassant le budget de sortie doit être refusée avant allocation ; réduire l’extrait. Tester un extrait tardif pour contrôler les accès au fichier en flux. |
| GIF | Extraits 5 s puis 15 s ; largeurs 320 et 640 ; 10 et 15 i/s ; tenter 15,1 s | GIF animé sans audio, bonnes dimensions et durée ; source 4K réduite. Refus au-delà de 15 s ou du budget de sortie. Un GIF complexe peut atteindre le budget : message traduit, pas de plantage. |

Pour chaque essai, chronométrer **choix → prêt**, **convertir → fichier disponible**, relever le temps total, la progression, l’échauffement et toute fermeture/recharge de l’onglet. Ne pas inventer de délai cible à partir du Mac : reporter la durée observée et la comparer au délai d’arrêt propre à l’outil. Tester au moins une annulation pendant un traitement long, puis une nouvelle conversion et « convertir un autre fichier » ; aucune ancienne minuterie ne doit interrompre la nouvelle opération. Passer brièvement l’onglet en arrière-plan et noter toute suspension : aucune conversion en arrière-plan n’est garantie.

Relever si `showSaveFilePicker` est réellement disponible. S’il l’est, choisir un nouveau fichier de destination, vérifier la sortie directe, l’annulation de la boîte de dialogue et l’intégrité de l’original. Safari iOS et de nombreux Chrome Android utilisent le repli en mémoire : ne pas supposer que Chrome implique l’écriture directe. Le budget est **64 Mio** sur mobile pour audio/coupe/compression et **16 Mio** pour GIF ; la taille d’entrée admise n’est pas une promesse de sortie intégrale en mémoire. Sur ordinateur, vérifier en complément un fichier proche de **1 Gio / 20 min** pour audio et coupe, en écriture directe et en repli mémoire (un long extrait copié peut être refusé dans ce dernier mode).

Ouvrir chaque vidéo MP4 dans **Photos sur iPhone / Galerie sur Android**, puis l’envoyer dans **WhatsApp** et la relire après réception ; contrôler son, orientation, synchronisation et début/fin. Tester explicitement le WebM si le repli survient : un refus de Photos/iPhone est annoncé, pas dissimulé. MP3/M4A s’ouvrent depuis **Fichiers / lecteur audio**, pas depuis Photos ; vérifier leur envoi WhatsApp comme document/audio. Pour le GIF, vérifier l’animation dans Photos/Galerie et WhatsApp, en notant une éventuelle transformation par l’application destinataire. Ne pas promettre une compatibilité de partage déduite du seul `ffprobe`.

Gabarit de relevé : `appareil | OS/navigateur | outil/options | source/codec/Mio/durée/résolution | sortie directe ou mémoire | prêt en s | traitement en s | format/Mio/durée/pistes | Photos/Galerie | WhatsApp | annulation | erreur/rechargement`. Enregistrer les échecs et les refus attendus au même titre que les succès. Une fermeture d’onglet, un fichier illisible, une perte de son/orientation ou un dépassement mémoire impose de réduire les plafonds du profil concerné ou de corriger avant publication. Refaire ensuite les 32 pages, `seo-check` et les tests de confidentialité ; ne pas ouvrir la PR à la fusion sur la seule base des mesures Mac.
