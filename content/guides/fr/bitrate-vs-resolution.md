---
{
  "id": "bitrate-vs-resolution",
  "translationOf": "bitrate-vs-resolution",
  "locale": "fr",
  "slug": "debit-et-resolution-video",
  "title": "Débit et résolution vidéo : quelle différence ?",
  "description": "Comprenez les pixels, les bits par seconde et le calcul du poids pour comparer des vidéos sans confondre taille et qualité.",
  "category": "Taille et qualité",
  "created": "2026-10-12",
  "updated": "2026-10-12",
  "published": null,
  "status": "review",
  "sourceSha256": "f10c3b83a88368ad854787d5e5a3ae4c1ae2a8fa4759690c3e433d4b2919d304",
  "review": {
    "linguistic": "pending",
    "technical": "pending",
    "reviewer": null,
    "reviewedAt": null
  },
  "related": [
    "720p-1080p-4k",
    "reduce-video-size",
    "mp3-vs-m4a"
  ],
  "sources": [
    {
      "title": "YouTube Help: bitrate and upload recommendations",
      "url": "https://support.google.com/youtube/answer/1722171"
    },
    {
      "title": "FFmpeg: bitrate options",
      "url": "https://www.ffmpeg.org/ffmpeg.html"
    }
  ],
  "sourceBodySha256": "f4906bd34cbb2478a943ff7a3989c3c8fbc6581aec9325a27a3b64d21e9dcff5"
}
---
La résolution indique le nombre de pixels d’une image. Le débit décrit les données utilisées chaque seconde. Ces critères ne sont pas interchangeables : une grande image trop compressée peut sembler moins propre qu’une image plus petite bien encodée. La durée est indispensable pour estimer la taille finale.

## Les pixels décrivent l’image

1920 × 1080 contient davantage de pixels que 1280 × 720. Cela permet du détail seulement si la capture et l’encodage le conservent. La fréquence décrit séparément le nombre d’images par seconde. Une diapositive immobile et une caméra en mouvement sollicitent différemment l’encodeur.

## Le débit est un budget de données

Il s’exprime souvent en kilobits ou mégabits par seconde. Huit bits forment un octet. Le débit variable alloue davantage de données aux passages complexes. Le débit vidéo affiché peut exclure l’audio ; le conteneur ajoute aussi ses métadonnées. Une estimation avant préparation n’est donc pas toujours la taille exacte du fichier.

## Calculez un ordre de grandeur

Pour 60 secondes à 3 mégabits par seconde en moyenne, la vidéo seule représente `3000000 × 60 ÷ 8 = 22500000` octets. C’est 22,5 Mo décimaux, soit environ 21,5 MiB, avant audio et conteneur.

À débit moyen identique, doubler la durée double approximativement le poids. Doubler une résolution n’obéit pas à cette règle directe. Consultez [720p, 1080p et 4K](/blog/720p-1080p-4k).

## Comparez dans les mêmes conditions

Utilisez la même scène, le même affichage et le même volume. Observez mouvements rapides, textures, petits caractères et dégradés sombres. La qualité de capture et le bruit influencent le résultat avant même l’encodage. Des codecs différents au même débit ne garantissent pas la même qualité.

## Choisissez la copie utile

Une référence, une présentation et une source de montage ont des besoins différents. Testez la version plus légère pour la diffusion ; conservez l’original pour l’archivage. VidFetch affiche des formats source et ne crée pas d’encodage vidéo au débit personnalisé. Pour vos fichiers, voyez [la réduction de taille](/blog/reduce-video-size).

## Question fréquente

### Un MP3 à 320 kbps améliore-t-il une mauvaise source ?

Non. Le débit ne restitue pas les informations déjà perdues. Le guide [MP3 ou M4A](/blog/mp3-vs-m4a) applique la même distinction à l’audio.
