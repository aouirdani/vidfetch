---
{
  "id": "video-to-audio",
  "translationOf": "video-to-audio",
  "locale": "fr",
  "slug": "convertir-video-en-audio",
  "title": "Comment convertir une vidéo en fichier audio ?",
  "description": "Distinguez la copie d’une piste sonore et sa conversion en MP3, avec des commandes FFmpeg pour vos propres fichiers.",
  "category": "Conversion audio",
  "created": "2026-10-12",
  "updated": "2026-10-12",
  "published": null,
  "status": "review",
  "sourceSha256": "7675fd2ecee40f9f559b331fb50be97d47c2e5b3683d73f788153b0edd32804a",
  "review": {
    "linguistic": "pending",
    "technical": "pending",
    "reviewer": null,
    "reviewedAt": null
  },
  "related": [
    "mp3-vs-m4a",
    "backup-your-videos",
    "video-download-fails"
  ],
  "sources": [
    {
      "title": "FFmpeg: streamcopy and transcoding",
      "url": "https://www.ffmpeg.org/ffmpeg.html"
    },
    {
      "title": "FFmpeg: libmp3lame options",
      "url": "https://www.ffmpeg.org/ffmpeg-codecs.html#libmp3lame"
    }
  ],
  "sourceBodySha256": "3b71df668d8d476a1de663b87f59552d6e69c8f343affc02a11abbef74828445"
}
---
Une vidéo peut contenir une piste audio séparée. La transformer en fichier audio signifie soit copier cette piste dans un conteneur compatible, soit l’encoder dans un autre format. Une copie peut préserver les données encodées ; une conversion améliore parfois la compatibilité, jamais la qualité initiale. Utilisez uniquement un contenu qui vous appartient ou dont l’usage est autorisé.

## Vérifiez la présence du son

Certaines vidéos sont muettes ; d’autres comportent plusieurs langues ou un commentaire. Écoutez le fichier et inspectez les pistes avant de choisir. Une extraction simple ne sépare pas une voix de la musique : les éléments déjà mélangés restent mélangés.

## Créez une copie MP3 locale

Avec un FFmpeg incluant libmp3lame, cette commande sélectionne la première piste audio et crée un MP3 à 192 kbps :

```sh
ffmpeg -i ma-video.mp4 -map 0:a:0 -vn -c:a libmp3lame -b:a 192k bande-son.mp3
```

Sans piste audio, la commande doit signaler l’absence de flux plutôt qu’inventer du son. Gardez l’entrée et vérifiez la sortie. Le premier flux n’est pas forcément la langue que vous voulez : adaptez alors la sélection.

## Copiez une piste AAC compatible

Si la piste voulue est bien de l’AAC, sa copie dans un M4A peut éviter un réencodage avec perte :

```sh
ffmpeg -i ma-video.mp4 -map 0:a:0 -vn -c:a copy bande-son.m4a
```

Cette commande dépend du codec d’entrée. Elle n’est pas universelle : le conteneur doit pouvoir accueillir la piste. Consultez [MP3 ou M4A](/blog/mp3-vs-m4a) pour choisir.

## Contrôlez la copie obtenue

Choisissez un format accepté par votre lecteur ou votre logiciel de montage. Comparez un passage représentatif à volume égal, contrôlez la durée et écoutez jusqu’à la fin. Un débit élevé ajouté à une source déjà compressée ne restaure aucune information. Évitez les conversions successives avec perte.

## L’outil VidFetch

Analysez un lien accessible et autorisé, puis choisissez Audio et une option disponible. La conversion MP3 utilise 192 kbps ; les formats d’origine dépendent de la source. Sélectionner Audio ne lève aucune restriction de connexion ou de plateforme. Les limites de taille, durée et concurrence s’appliquent toujours.

## Question fréquente

### La conversion MP3 est-elle sans perte ?

Non. MP3 est un format avec perte. Conservez votre original et consultez [le guide des échecs](/blog/video-download-fails) si la préparation ne fonctionne pas.
