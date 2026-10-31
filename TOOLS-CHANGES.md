# PR A — outils de conversion locale

Architecture : Next.js App Router, catch-all SSR/SSG dans `src/app/(site)/[[...segments]]`, registre `src/lib/site-pages.ts`, métadonnées centralisées et sitemap statique. Les nouveaux outils ont une identité dédiée et leur propre contenu (`content/local-tools.json`) et messages, sans modifier les dictionnaires compilés dans la passerelle. Navigation, pied de page, accueils et guides concernés sont reliés aux nouvelles pages. Le worker est généré au build et auto-hébergé dans `public/local-media/generated`. CI construit l’archive OVH ; `promote.py` protège les moteurs. Ni main ni Caddy actif ne sont modifiés. Les deux branches sont indépendantes, aucune n’est fusionnée.

## Choix technique et licences

| Option examinée | Téléchargement / mémoire | Compatibilité / vitesse | Licence |
|---|---|---|---|
| FFmpeg WASM, core mono-thread 0.12.10 + wrapper 0.12.15 | Core environ 31 Mio avant compression, mémoire linéaire et copie des fichiers | Large couverture codecs, calcul logiciel sur un seul thread ; pas de SharedArrayBuffer requis | Wrapper MIT, **core officiel GPL-2.0-or-later**, pas supposé LGPL |
| Mediabunny 1.65.0 + extension MP3 1.65.0 + gifenc 1.0.3, retenus | Engine ~647 ko brut, worker MP3 ~9 ko, LAME WASM ~216 ko ; uniquement après choix de fichier | Codecs natifs WebCodecs pour décodage/encodage, dépendants du navigateur ; MP3 logiciel LAME et GIF dans des workers | Mediabunny et extension **MPL-2.0**, gifenc MIT ; LAME **LGPL-2.0-or-later** |

Sources primaires : [FFmpeg WASM](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/main/packages/core/package.json), [Mediabunny codecs](https://mediabunny.dev/guide/supported-formats-and-codecs), [extension MP3](https://mediabunny.dev/guide/extensions/mp3-encoder), [LAME](https://lame.sourceforge.io/).

Les trois nouvelles dépendances sont épinglées en devDependencies et servent au build frontend uniquement ; aucune dépendance serveur existante ne change. LAME 3.100 a été reconstruit avec Emscripten 3.1.64 à partir de l’archive officielle vérifiée SHA-256, et le worker incorporé de l’extension a été remplacé par un worker distinct relinkable. Recette et provenance : `scripts/local-tools/lame/README.md`. L’archive source originale est versionnée en deux morceaux binaires de moins de 1 Mio pour respecter le contrôle de release ; elle est reconstituée et contrôlée au build sans téléchargement tiers. Le build produit les sources correspondantes, la copie modifiée de l’intégration et toutes les licences sur le même domaine. Le pied de page ouvre la section Licences de chaque page légale. Aucun avis, note ou statistique d’usage n’a été ajouté.

## Fonctionnement et limites effectivement appliquées

- MP3 : 128/192/320 kbps, seule piste audio principale. M4A : copie directe d’AAC uniquement, refus des autres codecs. Vidéo sans audio : refus explicite.
- Compression : cibles vidéo 2 000 000 / 1 000 000 / 500 000 bit/s, son 128 kbps ; hauteur maximale optionnelle. Estimation débit × durée, avertissement qu’elle peut dépasser la taille source. WebM VP8/Opus préféré ; MP4 H.264/AAC uniquement avec les encodeurs disponibles. Aucun agrandissement.
- Coupe : copie forcée avec élargissement possible aux images clés et durée réelle affichée, ou réencodage précis. Début/fin et aperçu local.
- GIF : au plus 15 s ; largeur 160/320/480/640, cadence 5/10/15 ; palette optimisée jusqu’à 256 couleurs par image, sans son.
- `src/local-tools/limits.ts` : entrée 8 Mio sur appareils tactiles/faible mémoire, 32 Mio sur autres ordinateurs ; 120 s ; 2 073 600 pixels par image, portrait compris ; sortie au plus deux fois le plafond d’entrée ; arrêt après 180 s. Refus de taille avant chargement du moteur ; contrôle des pistes, codecs et limites dans le worker. Annulation, nettoyage des workers et révocation des ObjectURL au remplacement/départ.

Ces plafonds sont conservateurs, **pas une limite mémoire démontrée sur de vrais téléphones**. Les tests automatisés vérifient l’admission de fichiers valides à 8/32 Mio et le refus un octet au-dessus, ainsi que les conversions sous Chromium et WebKit sur le Mac disponible. Les fichiers de seuil contiennent du remplissage : ils mesurent l’admission, pas une charge de décodage mobile maximale. La validation physique iPhone/Safari et Android/Chrome reste nécessaire avant de présenter ces plafonds comme validés sur ces appareils. Avec Safari, les conversions qui décodent le son nécessitent Safari 26+, qui a introduit AudioDecoder/AudioEncoder ([WebKit](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)). La copie AAC ne demande pas d’encodeur audio. Chromium Android/desktop dépend des codecs de l’appareil. WebKit Playwright a passé les mêmes vingt sorties sur Mac ; cela ne remplace pas un test Safari/iPhone réel. Le contrôle de codec est effectué à l’exécution ; aucun repli serveur n’existe. Un MOV synthétique n’est pas un échantillon réel de caméra iPhone/HEVC/HDR.

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
- Tests locaux : **20 sorties réelles contrôlées par ffprobe** (MP4/H.264, MOV/H.264-AAC, WebM/VP8-Opus, quatre outils, trois débits MP3, AAC copié, coupe précise et trois profils de compression), 32 pages et erreurs traduites, chargement différé, annulation et refus de taille. Aucun envoi ni contact tiers détecté. Fixtures générées avec FFmpeg ; aucun média tiers téléchargé.
- Backend existant : 17 tests passés. Passerelle existante : 3 tests passés ; charge/file : 5 tests passés. Le test Python de déploiement via conteneurs est très long localement ; sa validation complète est confiée au workflow Linux. Les logs locaux ne sont pas présentés comme une réussite de toute la suite Python.
- Recompilation des moteurs à partir de main et des deux branches : SHA-256 identiques. OVH `fa0d3d4e15a5a45ca0deb2b35e7ba03adc95c31b87500378068121f291c42287`, passerelle `0fa1404530c272b76aaec9aee18125660e8561c744e4ccc1fbb9c7dbee9850e5` (comparaison avec le même esbuild local). Aucun fichier de moteur protégé ni comportement YouTube modifié.

## Performances

Mesures avant/après sur les builds de production isolés de main et de cette branche, même Chrome, viewport mobile 390×844, CPU ×4, 1,6 Mbit/s et latence 40 ms, trois répétitions, médianes. Les requêtes tierces ont été bloquées dans les deux cas. Ce sont des mesures de laboratoire, pas des Core Web Vitals réels ni une mesure de mémoire de téléphone. Le moteur de conversion est exclu du JS initial et sa requête n’apparaît pas avant sélection. Le JS initial passe de 609 083 à 615 798 octets bruts (+1,1 %), et de 191 176 à 193 823 en gzip (+1,4 %) sur les quatre pages comparées. La page locale /video-to-mp3 présente le même budget initial ; l’engine est téléchargé séparément après sélection.

Lighthouse mobile standard a également été exécuté trois fois par branche et page, en alternant l’ordre, requêtes tierces bloquées des deux côtés. Médianes :

| Page | LCP main → A | Écart LCP | CLS main → A | TBT main → A |
|---|---|---|---|---|
| / | 820,9 → 826,4 ms | +0,67 % | 0 → 0 | 37 → 43 ms |
| /id/download-video-tiktok | 816,4 → 822,5 ms | +0,74 % | 0 → 0 | 39 → 44 ms |
| /fr/tiktok-en-mp3 | 816,2 → 826,9 ms | +1,31 % | 0 → 0 | 36 → 39 ms |
| /blog/mp4-vs-webm | 814,0 → 815,2 ms | +0,15 % | 0 → 0 | 39 → 38 ms |

Score Lighthouse 100 sur tous les essais. Aucun écart de plus de 10 % sur le LCP ou le JS initial, limites fixées pour ce chantier. TBT : +6 ms (+16,2 %) sur l’accueil et +5 ms (+12,8 %) sur la page ID, signalés malgré leur faible valeur absolue ; CLS reste nul. Les deux builds utilisent **VIDFETCH_TARGET=ovh**. Ces résultats de laboratoire ne prédisent pas les Core Web Vitals réels. Données brutes définitives : `docs/LOCAL-TOOLS-VALIDATION.json`.

CI : [workflow de la PR A](https://github.com/aouirdani/vidfetch/actions?query=branch%3Afeat%2Flocal-tools), avec fixtures FFmpeg, confidentialité et conversions. La validation définitive est celle des checks du dernier commit ; aucun push main n’est effectué.

## Actions humaines

Relire les huit langues ; priorité arabe (termes du worker, ordre des unités latines) et indonésien (« keyframe », « pengodean ulang presisi », différence galeri/Downloads). Faire vérifier les formulations techniques de coupe sur image clé, bitrate cible et copies AAC dans toutes les langues. Plusieurs explications médias reprennent notre prose éditoriale existante, sélectionnée par sujet ; elles ne constituent pas une validation native indépendante.

Tester de vrais iPhone/Safari et Android/Chrome, en particulier mémoire, HEVC/HDR/rotation, limites 8/32 Mio, 120 secondes, copie de coupe aux frontières et destination Photos/galerie. Tester les formats de sortie dans les applications destinataires. Vérifier MIME/cache/CSP à travers le Caddy et Cloudflare actifs, sans toucher leur configuration dans cette PR. La PR restera en brouillon tant que ces validations matérielles ne sont pas faites.

Après validation et déploiement humain : purge Cloudflare, inspection Search Console EN/FR/ID/PT de chacun des quatre outils, soumission de `https://vidfetch.app/sitemap.xml`, puis demande d’indexation des nouvelles URL. Aucune fusion ou activation de production réalisée.

Les accueils et pages légales portent le 30/10 comme date réelle de leur ajout de liens/licences. Le timing GIF à 15 i/s est réparti en centièmes pour éviter un allongement artificiel ; un test vérifie une seconde réelle ainsi que les débits MP3 mesurés.

WebKit affiche des erreurs de préchargement RSC lors des navigations rapides et des messages Blob lors de l’annulation ; les vingt sorties et les contrôles réseau passent. Le contrôle sur Safari matériel reste à faire.

La première CI Linux a bien construit la release mais a signalé le contrat explicite Caddy encore limité à 50 routes. Les 32 URL ont été ajoutées à la fixture, sans assouplir le crawler ni les gates. Le test unitaire compare désormais le registre indexable et ce contrat avant construction.

Le test ciblé avec le vrai Caddyfile public et Docker est désormais **PASS : 82 routes attendues**, avec accès 200 aux workers, WASM et licences/sources, MIME `application/wasm` et absence de COOP/COEP. Seuls TLS et l’adresse upstream sont adaptés en local ; Caddy actif reste intact. Lecture seule de l’accueil public le 31/10 : HTTP 200, CSP/COOP/COEP absents, Cloudflare DYNAMIC. Les nouveaux assets ne sont pas encore en production : cache et en-têtes de leurs URL Cloudflare restent à contrôler après déploiement.

Le WASM incorpore aussi le runtime de compilation : Emscripten 3.1.64 (MIT ou NCSA, MIT retenue), musl (MIT avec notices additionnelles) et compiler-rt (Apache-2.0 WITH LLVM-exception). Les textes exacts extraits de l’image de compilation sont auto-hébergés dans la section Licences et inclus dans le kit source, avec les références au code du SDK. Ces composants ne changent pas la licence LGPL du code LAME ni la MPL du pont.
