---
{
  "id": "reduce-video-size",
  "translationOf": "reduce-video-size",
  "locale": "de",
  "slug": "videodatei-verkleinern",
  "title": "Eine Videodatei vorsichtig verkleinern",
  "description": "Erstelle eine kleinere Kopie mit passender Dauer, Auflösung und Kompression und prüfe sie, bevor du Dateien ersetzt.",
  "category": "Größe und Qualität",
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
Eine kleinere Videodatei enthält weniger Daten. Kürzen, Bitrate senken und Auflösung ändern sind unterschiedliche Entscheidungen. Arbeite an einer Kopie und teste eine typische Szene. Es gibt keine Einstellung, die für jede Quelle gleiche Qualität bei erheblich weniger Speicher garantiert.

## Bestimme den Zweck der Kopie

Ein Clip für Nachrichten braucht andere Einstellungen als Material zum Schneiden. Lege Zielgerät, benötigte Dauer und Größenlimit fest. Behalte das Original. Ein unnötiger Vorspann lässt sich manchmal sinnvoller entfernen, als jedes Bild stark zu komprimieren.

## Auflösung und Bewegung abwägen

4K auf 1080p zu reduzieren spart zu codierende Pixel, verliert aber feine Details. 720p zu vergrößern erzeugt keine fehlenden Informationen. Weniger Bilder pro Sekunde ändern die Bewegung, besonders bei Sport. Lies [den Auflösungsratgeber](/blog/720p-1080p-4k) und teste auf dem Zielgerät.

## Eine lokale Codierung ausprobieren

Mit FFmpeg und den nötigen Encodern erstellt dieser Befehl eine neue MP4-Kopie aus der ersten Videospur und, falls vorhanden, der ersten Audiospur:

```sh
ffmpeg -i original.mp4 -map 0:v:0 -map '0:a:0?' -c:v libx264 -crf 23 -preset medium -c:a aac -b:a 128k -movflags +faststart kleinere-kopie.mp4
```

CRF steuert einen Qualitätskompromiss dieses Encoders. Ein höherer Wert spart meist Daten zulasten von Details. `23` ist ein Startversuch, keine Zusage für Größe oder Qualität. Das Preset verändert Tempo und Kompression; auch Audio wird neu codiert.

## Prüfe das Ergebnis sorgfältig

- Sieh dir bewegte und dunkle Szenen an.
- Prüfe Sprache und Synchronität.
- Kontrolliere Dauer und Wiedergabe auf dem Zielgerät.
- Behalte Original und getestete Sicherung.

## Was VidFetch leisten kann

VidFetch zeigt Quellformate und kann Ton zu MP3 umwandeln. Es ist kein Upload-Kompressor mit eigenem CRF-Regler. Eine kleinere angebotene Variante kann reichen. [Bitratenberechnungen](/blog/bitrate-vs-resolution) helfen bei der Planung, garantieren aber keine exakte Größe.

## Häufige Frage

### Sollte ich nur die kleinere Kopie behalten?

Für eigene wiederverwendbare Aufnahmen behalte das Original. Eine Auslieferungskopie ist für einen Zweck optimiert, nicht für jeden späteren Schnitt.
