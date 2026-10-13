---
{
  "id": "reduce-video-size",
  "translationOf": "reduce-video-size",
  "locale": "it",
  "slug": "ridurre-dimensione-video",
  "title": "Come ridurre le dimensioni di un video con cautela",
  "description": "Prepara una copia più leggera scegliendo durata, risoluzione e compressione, poi verifica il risultato senza sostituire l’originale.",
  "category": "Dimensioni e qualità",
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
Ridurre un video significa diminuire i dati che contiene. Tagliare una parte inutile, abbassare il bitrate e ridurre la risoluzione sono decisioni diverse. Lavora su una copia e prova una scena rappresentativa. Nessuna impostazione garantisce identica qualità e molto meno spazio per ogni fonte.

## Definisci l’uso della copia

Un clip per messaggi non ha le esigenze di materiale da montare. Decidi dispositivo, durata utile e limite di dimensione. Conserva l’originale. Eliminare un’introduzione può essere più sensato che comprimere troppo ogni fotogramma.

## Valuta risoluzione e movimento

Passare da 4K a 1080p riduce i pixel da codificare, perdendo dettaglio fine. Ingrandire 720p non ricrea informazioni. Abbassare la frequenza dei fotogrammi modifica il movimento, soprattutto nello sport. Leggi [la guida alle risoluzioni](/blog/720p-1080p-4k) e prova sul dispositivo destinatario.

## Prova una codifica locale

Con FFmpeg e i codificatori necessari, questo comando crea una nuova copia MP4 dalla prima traccia video e dall’audio, se presente:

```sh
ffmpeg -i originale.mp4 -map 0:v:0 -map '0:a:0?' -c:v libx264 -crf 23 -preset medium -c:a aac -b:a 128k -movflags +faststart copia-piccola.mp4
```

CRF controlla un compromesso di qualità per questo codificatore. Un numero maggiore in genere riduce i dati sacrificando dettaglio. `23` è una prova iniziale, non una promessa di peso. Il preset influenza velocità ed efficienza; anche l’audio viene ricodificato.

## Controlla il risultato

- Osserva scene scure e con movimento.
- Ascolta voci e sincronizzazione.
- Controlla durata e riproduzione sul dispositivo.
- Conserva originale e backup verificato.

## Il ruolo di VidFetch

VidFetch elenca formati della fonte e può convertire audio in MP3. Non è un compressore con caricamento di file né offre un cursore CRF personalizzato. Una variante disponibile più piccola può bastare. [Il calcolo del bitrate](/blog/bitrate-vs-resolution) aiuta a pianificare, senza garantire un peso preciso.

## Domanda frequente

### Posso conservare solo la copia compressa?

Per riprese tue da riutilizzare, mantieni l’originale. Una copia di distribuzione è adatta a uno scopo, non a ogni futuro montaggio.
