---
{
  "id": "video-to-audio",
  "translationOf": "video-to-audio",
  "locale": "de",
  "slug": "video-in-audio-umwandeln",
  "title": "Ein Video in eine Audiodatei umwandeln",
  "description": "Kopiere eine kompatible Tonspur oder erstelle MP3 mit FFmpeg und prüfe das Ergebnis, während das Original erhalten bleibt.",
  "category": "Audiokonvertierung",
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
Ein Video kann eine separate Tonspur enthalten. Für eine Audiodatei kopierst du diese in einen passenden Container oder codierst sie etwa als MP3 neu. Kopieren kann die codierten Daten erhalten; Konvertieren verbessert unter Umständen Kompatibilität, nicht den ursprünglichen Klang. Verwende nur eigenes oder erlaubtes Material.

## Prüfe die vorhandenen Spuren

Manche Aufnahmen sind stumm, andere haben mehrere Sprachen oder Kommentare. Höre hinein und untersuche die Spurenliste. Einfaches Extrahieren trennt keine Instrumente und entfernt keine Stimme: Bereits gemischte Elemente bleiben gemischt.

## Eine lokale MP3-Kopie erstellen

FFmpeg mit libmp3lame kann die erste Audiospur wählen und eine separate Datei mit 192 kbps erstellen:

```sh
ffmpeg -i eigenes-video.mp4 -map 0:a:0 -vn -c:a libmp3lame -b:a 192k tonspur.mp3
```

Ohne Audiospur sollte der Befehl das melden, nicht Ton erfinden. Bewahre die Eingabe auf und prüfe das Ergebnis. Die erste Spur muss nicht die gewünschte Sprache sein; passe gegebenenfalls die Auswahl an.

## Kompatibles AAC ohne Neucodierung kopieren

Wenn die gewünschte Spur nachweislich AAC ist, kann Kopieren in M4A weitere Verluste vermeiden:

```sh
ffmpeg -i eigenes-video.mp4 -map 0:a:0 -vn -c:a copy tonspur.m4a
```

Das hängt vom Eingangscodec ab. Der Container muss ihn unterstützen; es ist kein universeller Konvertierungsbefehl. Wähle sonst einen passenden Container oder eine neue Codierung. Siehe [MP3 und M4A](/blog/mp3-vs-m4a).

## Kontrolliere die Ausgabe

Wähle ein Format, das Player oder Schnittprogramm akzeptiert. Vergleiche denselben Abschnitt bei gleicher Lautstärke, prüfe Dauer und vollständiges Ende. Eine hohe Bitrate stellt fehlende Informationen nicht wieder her. Vermeide wiederholte verlustbehaftete Konvertierungen.

## VidFetch als Alternative

Analysiere einen zugänglichen, erlaubten Link und wähle Audio sowie ein verfügbares Format. Die MP3-Option verwendet 192 kbps; Originalformate hängen von der Quelle ab. Audio umgeht weder Anmeldung noch Plattformblockaden. Größen-, Zeit- und Parallelitätslimits gelten weiterhin.

## Häufige Frage

### Ist MP3 verlustfrei?

Nein. MP3 ist verlustbehaftet. Behalte das Original und prüfe bei Fehlern [die Problemübersicht](/blog/video-download-fails), bevor du mehrfach neu anfragst.
