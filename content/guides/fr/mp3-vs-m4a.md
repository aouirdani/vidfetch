---
{
  "id": "mp3-vs-m4a",
  "translationOf": "mp3-vs-m4a",
  "locale": "fr",
  "slug": "mp3-ou-m4a",
  "title": "MP3 ou M4A : quel format audio conserver ?",
  "description": "Découvrez la différence entre MP3, AAC et ALAC, et choisissez un format audio selon votre lecteur plutôt que selon l’extension.",
  "category": "Formats audio",
  "created": "2026-10-12",
  "updated": "2026-10-12",
  "published": null,
  "status": "review",
  "sourceSha256": "d265fce6931f13fabd6b3f200e5c3c9acc34bed7252b730a12f1ef6ae5a48aef",
  "review": {
    "linguistic": "pending",
    "technical": "pending",
    "reviewer": null,
    "reviewedAt": null
  },
  "related": [
    "video-to-audio",
    "bitrate-vs-resolution",
    "backup-your-videos"
  ],
  "sources": [
    {
      "title": "MDN: audio codecs",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs"
    },
    {
      "title": "Apple: ALAC reference implementation",
      "url": "https://github.com/macosforge/alac"
    }
  ],
  "sourceBodySha256": "f025b11c35a95867d7016d89b3b61e59af99c75dcc309845925192870056b058"
}
---
Choisissez MP3 lorsqu’un appareil ou un logiciel l’exige. Si votre M4A fonctionne déjà, le conserver évite une conversion inutile. M4A désigne un conteneur, qui peut contenir de l’AAC avec perte ou de l’ALAC sans perte. L’extension ne suffit donc pas à évaluer la qualité sonore.

## Comparez la piste réellement présente

Un codec avec perte supprime des informations pour réduire la taille. Un codec sans perte conserve le signal décodé, mais ne recrée pas ce qui a disparu lors d’une compression précédente. Transformer une source compressée en ALAC ne restitue pas les détails perdus. Gardez le meilleur original disponible pour [vos sauvegardes](/blog/backup-your-videos).

## Comprenez le débit et le poids

À un débit constant de 192 kilobits par seconde, trois minutes représentent environ 4,32 Mo de données audio : `192000 × 180 ÷ 8`. Les métadonnées ajoutent un peu de poids. Avec un débit variable, le résultat dépend des passages encodés.

Cette formule estime une taille, pas une qualité. Deux codecs au même débit ne donnent pas nécessairement le même son. Comparez le même passage à volume égal, en distinguant une voix parlée d’un morceau complexe.

## Quand conserver un M4A

Si votre lecteur accepte le fichier, gardez-le et identifiez d’abord son codec. Une piste AAC peut parfois être copiée dans un conteneur M4A sans réencodage. Ce remuxage n’est pas une commande universelle pour convertir n’importe quelle piste. Le conteneur de sortie doit accepter le codec choisi.

## Quand créer une copie MP3

Le MP3 reste utile pour un ancien lecteur ou un flux de travail qui le demande. Convertissez une copie, puis contrôlez le début, le milieu et la fin. Évitez les allers-retours entre formats avec perte : ils peuvent accumuler les dégradations sans apporter de détail.

## L’option audio de VidFetch

Lorsqu’une source autorisée est accessible, VidFetch peut encoder sa bande-son en MP3 à 192 kbps. Il ne reconstruit pas un original sans perte et ne promet pas une meilleure qualité que la source. Une piste d’origine peut aussi être proposée selon les formats disponibles.

## Question fréquente

### Un M4A plus gros sonne-t-il forcément mieux ?

Non. Sa durée, son codec et son débit expliquent aussi sa taille. Identifiez la piste et écoutez-la. Le guide [vidéo vers audio](/blog/video-to-audio) distingue extraction et conversion.
