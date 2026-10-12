---
{
  "id": "reduce-video-size",
  "translationOf": "reduce-video-size",
  "locale": "fr",
  "slug": "reduire-taille-video",
  "title": "Réduire la taille d’une vidéo sans perdre trop de qualité",
  "description": "Préparez une copie vidéo plus légère en choisissant sa durée, sa résolution et son encodage, tout en conservant l’original.",
  "category": "Taille et qualité",
  "created": "2026-10-12",
  "updated": "2026-10-12",
  "published": null,
  "status": "review",
  "sourceSha256": "ea1acb28cfcbe927c9211df0c71376d48c7293d3c667752991392f91e46c4169",
  "review": {
    "linguistic": "pending",
    "technical": "pending",
    "reviewer": null,
    "reviewedAt": null
  },
  "related": [
    "bitrate-vs-resolution",
    "720p-1080p-4k",
    "backup-your-videos"
  ],
  "sources": [
    {
      "title": "FFmpeg: encoding and stream selection",
      "url": "https://www.ffmpeg.org/ffmpeg.html"
    },
    {
      "title": "FFmpeg: video filters",
      "url": "https://www.ffmpeg.org/ffmpeg-filters.html"
    }
  ],
  "sourceBodySha256": "dba01726de86733b72c99239c660ee5205fead72fe2ff3d33c30f6ff0d3b45e9"
}
---
Réduire une vidéo consiste à diminuer les données qu’elle contient. Couper une partie inutile, diminuer le débit ou choisir une résolution adaptée sont trois décisions différentes. Travaillez sur une copie et testez une scène représentative. Aucun réglage ne garantit une réduction importante avec une qualité identique pour toutes les sources.

## Définissez l’usage de la copie

Un extrait envoyé par messagerie n’a pas les mêmes besoins qu’un original destiné au montage. Déterminez l’appareil de lecture, la durée utile et la taille maximale. Conservez le fichier original. Retirer une introduction inutile peut être préférable à une compression très agressive de chaque image.

## Ajustez la résolution avec prudence

Passer de 4K à 1080p réduit le nombre de pixels à encoder, au prix de détails fins. À l’inverse, agrandir du 720p ne recrée pas d’informations. La fréquence d’images influence séparément les mouvements : vérifiez notamment les scènes sportives. Consultez [le guide des résolutions](/blog/720p-1080p-4k).

## Essayez un encodage sur votre propre fichier

Avec FFmpeg et les encodeurs nécessaires, cette commande crée une nouvelle copie MP4 et sélectionne la première piste vidéo ainsi que l’audio s’il existe :

```sh
ffmpeg -i original.mp4 -map 0:v:0 -map '0:a:0?' -c:v libx264 -crf 23 -preset medium -c:a aac -b:a 128k -movflags +faststart copie-legere.mp4
```

Le CRF règle un compromis de qualité pour cet encodeur. Une valeur supérieure réduit généralement le poids en sacrifiant davantage de détail. La valeur `23` est un essai de départ, pas une promesse de taille. Le preset influence la vitesse et l’efficacité de compression ; l’audio est également réencodé.

## Vérifiez le résultat avant de remplacer quoi que ce soit

- Regardez une scène animée et une scène sombre.
- Écoutez les voix et vérifiez la synchronisation.
- Contrôlez la durée sur l’appareil destinataire.
- Gardez l’original et une sauvegarde vérifiée.

## Les possibilités de VidFetch

VidFetch affiche des formats source et peut convertir une bande-son en MP3. Ce n’est pas un compresseur vidéo avec téléversement ni un réglage CRF personnalisé. Choisir une version source plus petite peut suffire. [Le calcul du débit](/blog/bitrate-vs-resolution) aide à estimer un budget.

## Question fréquente

### Puis-je ne garder que la copie compressée ?

Pour vos propres rushes, conservez l’original : une copie de diffusion répond à un usage précis, pas à tous les montages futurs.
