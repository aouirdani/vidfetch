# Mesures mémoire locales — 31/10/2026

Mac 32 Gio, huit cœurs ; Chromium (Chrome 156.0.8078.79) et WebKit Playwright 27.2. **Aucun téléphone physique mesuré.** Le WebKit testé n’est pas Safari 26 sur iPhone.

Les vidéos contiennent de vraies données H.264/AAC, en 1080p et UHD 4K, avec une mire de dix secondes répétée. Pas de remplissage `free` dans les profils mémoire. Les tailles 50/200/500 Mio sont des cibles approximatives : les octets exacts et durées sont conservés dans [les données brutes](LOCAL-TOOLS-MEMORY.json). Ce ne sont pas des vidéos caméra/HEVC/HDR.

Le pic physique est la somme **échantillonnée** de `phys_footprint` des processus du navigateur, y compris WebContent/GPU/Networking XPC de WebKit : JS, décodeurs et autres allocations natives se recouvrent. On ne l’additionne pas au JS. Il ne permet pas d’isoler les décodeurs ni d’attribuer les services système partagés externes. RSS et majorant par pics de processus non simultanés sont fournis séparément dans le JSON. Échantillonnage toutes les 100 ms plus coût de mesure : des pics plus courts peuvent échapper.

Chromium expose heap V8 + backing stores des pages/workers. La catégorie JavaScript WebKit est **partielle** : une calibration de 100 Mio en tableau typé n’y apparaissait pas. Les valeurs WebKit ci-dessous ne sont donc pas un pic JS complet ; le compteur physique natif est utilisé pour évaluer le risque global. Aucune mesure native de téléphone ni mémoire JS complète WebKit n’est inventée.

## Matrice sortie en mémoire (48 profils)

Le harnais isolé autorise volontairement les sorties complètes de 500 Mio pour observer le problème ; la politique produit finale les refuse lorsque le budget est dépassé. Les fichiers publics générés ne contiennent aucun contournement de limite. MP3 à 320 kbps, coupe intégrale en copie, compression équilibrée au plus 1080p, GIF 15 s/640 px/15 i/s. La colonne JS contient deux pics séparés heap / backing sous Chromium (pas une somme de pics simultanés) ; catégorie JS partielle / backing indisponible sous WebKit.

| Navigateur | Outil | Entrée | Pics heap / backing Mio | Pic physique Mio | Surcoût physique Mio | Temps s | Sortie Mio |
|---|---|---|---:|---:|---:|---:|---:|
| chromium | audio | 1080p-50 | 6.8 / 54.9 | 514.4 | 191.9 | 1.75 | 1.1 |
| chromium | trim | 1080p-50 | 4.7 / 59.6 | 577.1 | 252.0 | 1.27 | 50.0 |
| chromium | compress | 1080p-50 | 7.2 / 54.4 | 539.0 | 217.4 | 6.07 | 4.5 |
| chromium | gif | 1080p-50 | 16.6 / 52.9 | 544.0 | 222.3 | 9.00 | 4.4 |
| chromium | audio | 1080p-200 | 11.4 / 131.4 | 601.9 | 281.7 | 2.35 | 4.6 |
| chromium | trim | 1080p-200 | 8.0 / 225.1 | 1285.0 | 958.5 | 1.46 | 199.6 |
| chromium | compress | 1080p-200 | 11.6 / 56.6 | 541.6 | 216.7 | 19.57 | 18.1 |
| chromium | gif | 1080p-200 | 16.6 / 50.9 | 552.0 | 227.7 | 9.10 | 4.4 |
| chromium | audio | 1080p-500 | 18.0 / 241.3 | 762.0 | 440.3 | 4.01 | 11.5 |
| chromium | trim | 1080p-500 | 12.2 / 583.2 | 1517.4 | 1183.3 | 1.81 | 498.8 |
| chromium | compress | 1080p-500 | 18.1 / 105.6 | 560.0 | 237.7 | 46.67 | 45.3 |
| chromium | gif | 1080p-500 | 16.3 / 48.3 | 544.5 | 226.9 | 9.08 | 4.4 |
| chromium | audio | 4k-50 | 6.0 / 55.4 | 503.1 | 183.5 | 1.56 | 1.2 |
| chromium | trim | 4k-50 | 4.7 / 60.7 | 583.2 | 255.8 | 1.26 | 50.4 |
| chromium | compress | 4k-50 | 7.1 / 45.5 | 668.8 | 345.0 | 6.09 | 4.1 |
| chromium | gif | 4k-50 | 16.7 / 52.8 | 576.9 | 258.1 | 8.45 | 4.4 |
| chromium | audio | 4k-200 | 10.4 / 121.1 | 605.1 | 281.1 | 2.32 | 4.7 |
| chromium | trim | 4k-200 | 6.1 / 209.3 | 1075.4 | 748.6 | 1.43 | 199.9 |
| chromium | compress | 4k-200 | 12.6 / 49.7 | 687.9 | 361.6 | 19.83 | 16.4 |
| chromium | gif | 4k-200 | 16.2 / 42.0 | 579.9 | 257.8 | 8.47 | 4.4 |
| chromium | audio | 4k-500 | 15.4 / 236.8 | 730.3 | 408.1 | 4.00 | 11.6 |
| chromium | trim | 4k-500 | 11.1 / 581.5 | 1520.9 | 1199.5 | 1.78 | 498.9 |
| chromium | compress | 4k-500 | 20.4 / 120.2 | 729.9 | 403.0 | 47.50 | 41.0 |
| chromium | gif | 4k-500 | 15.4 / 45.2 | 580.5 | 256.2 | 8.63 | 4.4 |
| webkit | audio | 1080p-50 | 5.9 / n.d. | 305.1 | 230.4 | 1.75 | 1.1 |
| webkit | trim | 1080p-50 | 4.5 / n.d. | 495.5 | 419.4 | 1.73 | 50.0 |
| webkit | compress | 1080p-50 | 4.5 / n.d. | 209.2 | 133.6 | 6.21 | 5.7 |
| webkit | gif | 1080p-50 | 4.5 / n.d. | 171.5 | 97.3 | 12.18 | 4.3 |
| webkit | audio | 1080p-200 | 11.3 / n.d. | 434.2 | 358.9 | 2.97 | 4.6 |
| webkit | trim | 1080p-200 | 204.0 / n.d. | 1412.8 | 1337.9 | 2.84 | 199.6 |
| webkit | compress | 1080p-200 | 50.3 / n.d. | 371.1 | 295.0 | 19.91 | 22.9 |
| webkit | gif | 1080p-200 | 4.5 / n.d. | 170.7 | 95.5 | 12.30 | 4.3 |
| webkit | audio | 1080p-500 | 17.9 / n.d. | 481.8 | 405.5 | 5.40 | 11.5 |
| webkit | trim | 1080p-500 | 504.7 / n.d. | 2981.7 | 2905.9 | 5.82 | 498.8 |
| webkit | compress | 1080p-500 | 119.1 / n.d. | 436.0 | 360.7 | 47.14 | 57.2 |
| webkit | gif | 1080p-500 | 8.8 / n.d. | 175.3 | 99.5 | 12.34 | 4.3 |
| webkit | audio | 4k-50 | 4.5 / n.d. | 312.3 | 236.6 | 1.72 | 1.2 |
| webkit | trim | 4k-50 | 4.6 / n.d. | 487.8 | 411.8 | 1.70 | 50.4 |
| webkit | compress | 4k-50 | 10.0 / n.d. | 345.0 | 269.1 | 50.79 | 3.8 |
| webkit | gif | 4k-50 | 4.8 / n.d. | 283.0 | 207.2 | 21.26 | 4.4 |
| webkit | audio | 4k-200 | 11.3 / n.d. | 436.6 | 360.8 | 2.94 | 4.7 |
| webkit | trim | 4k-200 | 204.3 / n.d. | 1429.6 | 1354.1 | 2.89 | 199.9 |
| webkit | compress | 4k-200 | 19.2 / n.d. | 697.7 | 622.5 | 198.42 | 15.0 |
| webkit | gif | 4k-200 | 9.2 / n.d. | 283.8 | 207.6 | 21.97 | 4.4 |
| webkit | audio | 4k-500 | 15.8 / n.d. | 496.4 | 420.7 | 5.35 | 11.6 |
| webkit | trim | 4k-500 | 503.3 / n.d. | 2988.6 | 2913.8 | 5.29 | 498.9 |
| webkit | compress | 4k-500 | 41.8 / n.d. | 763.5 | 688.3 | 483.46 | 37.6 |
| webkit | gif | 4k-500 | 9.2 / n.d. | 280.9 | 205.6 | 21.04 | 4.4 |

## Écriture en flux (Chromium)

Le sélecteur système est substitué en automatisation par un handle OPFS réel ; le worker emploie le même `StreamTarget` vers `createWritable()`. Cela valide le chemin de code, pas le débit d’un disque externe ni la présence du sélecteur sur Android. WebKit ne propose pas ce chemin dans le contexte testé ; aucun succès en flux WebKit n’est revendiqué. Le dernier tableau présente des entrées proches de 1 Gio / 20 min avec les vraies limites produit.

| Entrée | Outil | Pic physique Mio | Pics heap / backing Mio | Temps s | Sortie Mio |
|---|---|---:|---:|---:|---:|
| 1080p-50 | audio | 522.1 | 6.5 / 55.0 | 1.82 | 1.1 |
| 1080p-50 | trim | 529.9 | 6.3 / 36.1 | 1.47 | 50.0 |
| 1080p-200 | audio | 599.8 | 9.4 / 117.2 | 2.40 | 4.6 |
| 1080p-200 | trim | 730.5 | 8.5 / 158.2 | 1.72 | 199.6 |
| 1080p-500 | audio | 767.1 | 15.4 / 247.1 | 3.98 | 11.5 |
| 1080p-500 | trim | 1202.3 | 18.9 / 272.2 | 2.50 | 498.8 |
| 4k-50 | audio | 521.5 | 7.1 / 55.8 | 1.56 | 1.2 |
| 4k-50 | trim | 501.2 | 5.1 / 45.2 | 1.25 | 50.4 |
| 4k-200 | audio | 603.5 | 10.4 / 119.5 | 2.32 | 4.7 |
| 4k-200 | trim | 703.4 | 8.1 / 127.0 | 1.73 | 199.9 |
| 4k-500 | audio | 764.2 | 14.3 / 228.5 | 4.00 | 11.6 |
| 4k-500 | trim | 1216.2 | 18.0 / 295.5 | 2.50 | 498.9 |
| 1080p-20min | audio | 753.8 | 38.0 / 168.7 | 13.21 | 45.3 |
| 1080p-20min | trim | 1615.9 | 49.9 / 329.4 | 5.27 | 1013.7 |
| 4k-20min | audio | 732.3 | 35.0 / 175.9 | 12.17 | 45.3 |
| 4k-20min | trim | 1590.7 | 45.2 / 406.2 | 4.36 | 1010.6 |

## Validation des plafonds proposés et du refus avant allocation

Huit conversions de sources ~195 Mio / 4 min 59 s avec le **profil mobile sur Mac**, et huit sur des sources ~1 011–1 014 Mio / 19 min 50 s avec le profil desktop : MP3 complet et coupe de 30 s. Succès avec les budgets réels. La coupe complète de 500 Mio en repli mémoire est refusée `OUTPUT` dans quatre cas (deux résolutions × deux navigateurs), avant création du tampon de sortie ; pic physique ~438–453 Mio Chromium et ~160–164 Mio WebKit. Ces refus sont attendus.

Le profil mobile est une proposition pour essais matériels, fondée sur ces courbes et un budget de sortie de 64 Mio pour audio/coupe/compression, 16 Mio pour GIF. Ce plafond n’est pas la mémoire totale du navigateur. Le flux réduit le risque de copie de sortie, pas les buffers transitoires du décodeur ni le cache système. La copie complète de ~1 Gio en flux reste à ~1,6 Gio de pic physique sur ce Mac.

Les profils bouclés ont des trous d’horodatage AAC. Sur la source longue 1080p, ffprobe compte 55 693 trames décodées de 1 024 échantillons à 48 kHz, soit 1 188,117 s ; MP3 Chromium mesure 1 188,121 s, WebKit ~1 190,017 s avec remplissage temporel. Vérifier la durée sur les véritables enregistrements continus du protocole appareils ; ces mires ne prouvent pas la synchronisation caméra.

## Reproduction

Ne lancer qu’un harnais mémoire à la fois ; le profilage des processus XPC doit rester isolé des autres tests WebKit. Le harnais utilise des API internes Playwright : conserver la version du lockfile et recalibrer après mise à jour. Nécessite macOS, Xcode command-line tools (`cc`/libproc), ffmpeg/ffprobe, navigateurs Playwright et Chrome installés, puis `npm ci --ignore-scripts` et `node scripts/local-tools/build.mjs`. Aucun binaire de mesure n’est déployé. Sur un autre OS, le harnais refuse de fabriquer un compteur physique.

```sh
node scripts/local-tools/generate-benchmark-fixtures.mjs --out /tmp/vidfetch-camera-bench
node scripts/local-tools/measure-memory.mjs --fixtures /tmp/vidfetch-camera-bench/manifest.json --allow-large-output --report /tmp/memory-buffer.jsonl
node scripts/local-tools/measure-memory.mjs --fixtures /tmp/vidfetch-camera-bench/manifest.json --sink file --tools audio,trim --browsers chromium --report /tmp/memory-file.jsonl
node scripts/local-tools/generate-benchmark-fixtures.mjs --extended --out /tmp/vidfetch-camera-long
node scripts/local-tools/measure-memory.mjs --fixtures /tmp/vidfetch-camera-long/manifest.json --filter 5min --device mobile --tools audio,trim --clip 30 --report /tmp/memory-mobile.jsonl
node scripts/local-tools/measure-memory.mjs --fixtures /tmp/vidfetch-camera-long/manifest.json --filter 20min --tools audio,trim --clip 30 --report /tmp/memory-desktop-buffer.jsonl
node scripts/local-tools/measure-memory.mjs --fixtures /tmp/vidfetch-camera-long/manifest.json --filter 20min --tools audio,trim --sink file --browsers chromium --report /tmp/memory-desktop-stream.jsonl
```

## Extension OPFS — copie mobile complète (~200 Mio)

Quatre mesures supplémentaires, avec le profil mobile sur Mac, aucune dérogation de plafond. La phase de conversion OPFS ne transfère aucun tableau de résultat vers la fenêtre. Le service de téléchargement est testé séparément ; sa mémoire native n’est pas incluse dans cette série. Pas de téléphone physique ni de pic JS complet WebKit. Données : [LOCAL-TOOLS-OPFS-MEMORY.json](LOCAL-TOOLS-OPFS-MEMORY.json).

| Navigateur | Entrée | Pic physique Mio | Heap / backing Mio | Sortie Mio |
|---|---|---:|---:|---:|
| chromium | 1080p-200 | 584.6 | 8.4 / 76.0 | 199.6 |
| chromium | 4k-200 | 587.9 | 10.0 / 83.9 | 199.9 |
| webkit | 1080p-200 | 407.2 | 6.8 / n.d. | 199.6 |
| webkit | 4k-200 | 410.6 | 6.5 / n.d. | 199.9 |

En comparaison, la copie en tampon mémoire de la matrice historique atteignait ~1 075–1 285 Mio Chromium et ~1 413–1 430 Mio WebKit sur ces entrées. Il s’agit de mesures de laboratoire espacées, pas d’une comparaison en alternance sur téléphone. La mémoire du gestionnaire de téléchargement iOS doit encore être mesurée sur appareil.

```sh
node scripts/local-tools/measure-memory.mjs --sink opfs --filter 200 --tools trim --device mobile --fixtures /tmp/vidfetch-camera-bench/manifest.json --report /tmp/opfs-memory.jsonl
```

Deux copies OPFS complètes supplémentaires depuis la source desktop 1080p ~1 014 Mio / 19 min 50 s ont réussi, sans dérogation de plafond : pic physique **762,3 Mio Chromium / 465,2 Mio WebKit**. Comme les quatre profils mobiles, elles couvrent la conversion et la validation du fichier, pas le gestionnaire de téléchargement natif. Les sorties font 1 062 895 841 octets ; les lignes détaillées sont dans le JSON OPFS.
