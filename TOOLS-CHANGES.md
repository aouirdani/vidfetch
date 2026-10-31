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

Ces plafonds sont conservateurs, **pas une limite mémoire démontrée sur de vrais téléphones**. Les tests automatisés vérifient le refus à la limite mobile et les conversions sur le Mac disponible. La validation physique iPhone/Safari et Android/Chrome reste nécessaire avant de présenter ces plafonds comme validés sur ces appareils. Le contrôle de codec est effectué à l’exécution ; aucun repli serveur n’existe. Un MOV synthétique n’est pas un échantillon réel de caméra iPhone/HEVC/HDR.

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

Chaque page a son contenu serveur de 700–1000 mots, un H1, title ≤60, description ≤155, un groupe réciproque complet de huit langues, x-default EN, canonical et JSON-LD WebApplication gratuit/Breadcrumb/FAQ identique au texte visible. Les guides de compression/résolution/bitrate renvoient au compresseur ; les guides audio/MP3-M4A à l’extracteur. Les liens retour pointent seulement vers les guides réellement disponibles dans la langue.

## Vérifications et limites de l’environnement

- `npm test` : **185 tests passés**, 0 échec.
- `npm run lint`, `npm run typecheck`, `npm run check:release` : passés.
- Build de production `VIDFETCH_TARGET=ovh npm run build -- --webpack` : passé. Le build Turbopack normal rencontre une restriction locale de port interne, également sur main ; ce n’est pas présenté comme un succès local. Le workflow Linux conserve le build normal.
- `npm run seo-check` : **82 URL, PASS**, HTTP, index, SSR sans JS, hreflang, canonical, FAQ JSON-LD, liens internes et actifs de licences en 200, 301 et 404. `npm run test:i18n` : huit accueils, 16 transferts TikTok localisés et erreurs de quota, RTL, sélecteurs et API existantes passés.
- Tests locaux : **18 sorties réelles contrôlées par ffprobe** (MP4/H.264, MOV/H.264-AAC, WebM/VP8-Opus, quatre outils, trois débits MP3, AAC copié, coupe précise et trois profils de compression), 32 pages et erreurs traduites, chargement différé, annulation et refus de taille. Aucun envoi ni contact tiers détecté. Fixtures générées avec FFmpeg ; aucun média tiers téléchargé.
- Backend existant : 17 tests passés. Autres contrôles passerelle, charge et déploiement ainsi que CI : voir mise à jour ci-dessous.
- Recompilation des moteurs à partir de main et des deux branches : SHA-256 identiques. OVH `fa0d3d4e15a5a45ca0deb2b35e7ba03adc95c31b87500378068121f291c42287`, passerelle `0fa1404530c272b76aaec9aee18125660e8561c744e4ccc1fbb9c7dbee9850e5` (comparaison avec le même esbuild local). Aucun fichier de moteur protégé ni comportement YouTube modifié.

## Performances

Mesures avant/après sur les builds de production isolés de main et de cette branche, même Chrome, viewport mobile 390×844, CPU ×4, 1,6 Mbit/s et latence 40 ms, trois répétitions, médianes. Les requêtes tierces ont été bloquées dans les deux cas. Ce sont des mesures de laboratoire, pas des Core Web Vitals réels ni une mesure de mémoire de téléphone. Le moteur de conversion est exclu du JS initial et sa requête n’apparaît pas avant sélection. Résultats définitifs ajoutés après la mesure de la dernière optimisation.

## Actions humaines

Relire les huit langues ; priorité arabe (termes du worker, ordre des unités latines) et indonésien (« keyframe », « pengodean ulang presisi », différence galeri/Downloads). Faire vérifier les formulations techniques de coupe sur image clé, bitrate cible et copies AAC dans toutes les langues. Plusieurs explications médias reprennent notre prose éditoriale existante, sélectionnée par sujet ; elles ne constituent pas une validation native indépendante.

Tester de vrais iPhone/Safari et Android/Chrome, en particulier mémoire, HEVC/HDR/rotation, limites 8/32 Mio, 120 secondes, copie de coupe aux frontières et destination Photos/galerie. Tester les formats de sortie dans les applications destinataires. Vérifier MIME/cache/CSP à travers le Caddy et Cloudflare actifs, sans toucher leur configuration dans cette PR. La PR restera en brouillon tant que ces validations matérielles ne sont pas faites.

Après validation et déploiement humain : purge Cloudflare, inspection Search Console EN/FR/ID/PT de chacun des quatre outils, soumission de `https://vidfetch.app/sitemap.xml`, puis demande d’indexation des nouvelles URL. Aucune fusion ou activation de production réalisée.
