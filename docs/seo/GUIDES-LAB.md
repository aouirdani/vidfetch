# Expériences locales sur le site public — 7 novembre 2026

Sources : fichiers générés par FFmpeg, aucun média personnel. Les 40 cas initiaux ont produit 37 téléchargements et 3 refus attendus, sans échec du laboratoire. Le complément GIF gradient ajoute 1 téléchargement : total 41 cas, 38 sorties, 3 refus. Aucune requête d’envoi du média ni requête tierce observée pendant les opérations. Chromium 156.0.8078.4 ; les vues mobiles sont des émulations tactiles 390 × 844, aucun téléphone physique validé.

`node scripts/seo/run-guides-lab.cjs` reproduit les recettes et opérations. Prérequis : dépendances npm, Chromium Playwright, FFmpeg/ffprobe installés. Variables : FFMPEG_PATH, FFPROBE_PATH, VIDFETCH_LAB_DIR (répertoire neuf recommandé), VIDFETCH_LAB_IDS (ex. G18,G19). Le script utilise le site public et génère ses entrées dans un répertoire temporaire ; il ne publie aucun contenu et ne soumet aucune URL à Google. Les tailles dépendent des versions exactes des encodeurs : les preuves JSON historiques consignent celles observées, pas une promesse de reproduction octet pour octet.

Complément gradient : source lavfi `gradients=size=640x360:rate=30:c0=0x102030:c1=0x8090a0:x0=0:y0=0:x1=640:y1=360`, 3 s, libx264 CRF10, yuv420p. Outil /video-to-gif : début0, fin2, largeur320, cadence10. Source80 265octets → GIF52 179octets, 320×180, 2s. Cadres décodés à1s inspectés : source plus lisse, bandes diagonales distinctes dans le GIF. La capture UI gradient-320.webp documente les réglages ; les images de sortie ne sont pas publiées comme captures d’interface.

Compression : cadres décodés à1s de la source et des sorties Light/Strong, mêmes640×360. La version Strong adoucit les petits carrés et les contours diagonaux du motif. Observation limitée à cette scène synthétique ; aucune étude aveugle ni score perceptif inventé.

Pour le GIF15fps, compter les30images sur2s donne15fps. ffprobe affiche aussi50/3 dans son champ avg_frame_rate : ce champ ne remplace pas le comptage et la durée, les délais GIF étant arrondis au centième.

La preuve du lot1 contient les15identifiants des rangs1–15 et les métadonnées de leurs sources. Le lot2 ajoute les autres essais dans la PR suivante. Les vidéos et fichiers audio générés restent dans le laboratoire, hors du dépôt et des archives de déploiement. Seules les captures WebP de l’interface VidFetch et les relevés techniques sont versionnés.
