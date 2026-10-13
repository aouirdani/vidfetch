---
{
  "id": "video-to-audio",
  "translationOf": "video-to-audio",
  "locale": "it",
  "slug": "convertire-video-in-audio",
  "title": "Come convertire un video in un file audio",
  "description": "Copia una traccia compatibile o crea un MP3 con FFmpeg, controllando il risultato e conservando il video originale.",
  "category": "Conversione audio",
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
Un video può contenere una traccia audio separata. Creare un file sonoro significa copiarla in un contenitore compatibile o ricodificarla, per esempio in MP3. La copia può preservare i dati; la conversione aiuta la compatibilità, non migliora la registrazione. Usa solo contenuti tuoi o autorizzati.

## Verifica il suono disponibile

Alcuni video sono muti; altri hanno più lingue o commenti. Ascolta e controlla l’elenco delle tracce. Un’estrazione semplice non rimuove voci né separa strumenti: una miscela rimane tale nel risultato.

## Crea MP3 localmente

Con FFmpeg e libmp3lame, il comando seleziona la prima traccia audio e crea un file separato a 192 kbps:

```sh
ffmpeg -i mio-video.mp4 -map 0:a:0 -vn -c:a libmp3lame -b:a 192k audio.mp3
```

Se manca l’audio, deve essere segnalato. Mantieni l’ingresso e verifica l’uscita. La prima traccia potrebbe non essere la lingua desiderata: adatta la selezione quando serve.

## Copia AAC compatibile senza ricodifica

Se l’ispezione conferma AAC nella traccia desiderata, copiarla in M4A può evitare nuove perdite:

```sh
ffmpeg -i mio-video.mp4 -map 0:a:0 -vn -c:a copy audio.m4a
```

Il comando dipende dalla fonte. Non è una conversione universale: il contenitore deve supportare il codec. In caso contrario scegli un contenitore adatto o una nuova codifica. Vedi [MP3 e M4A](/blog/mp3-vs-m4a).

## Verifica l’uscita

Scegli ciò che accetta il lettore o editor. Confronta lo stesso passaggio allo stesso volume, controlla durata e fine completa. Un bitrate alto non recupera informazioni perse. Evita conversioni ripetute con perdita e mantieni la fonte migliore.

## L’alternativa VidFetch

Analizza un link accessibile e autorizzato, apri Audio e scegli un’opzione disponibile. MP3 utilizza 192 kbps; i formati originali dipendono dalla fonte. Selezionare Audio non aggira login o blocchi della piattaforma. Restano limiti di peso, durata e concorrenza.

## Domanda frequente

### MP3 è senza perdita?

No. MP3 usa compressione con perdita. Conserva l’originale e consulta [i problemi di download](/blog/video-download-fails) prima di ripetere richieste fallite.
