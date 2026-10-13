---
{
  "id": "bitrate-vs-resolution",
  "translationOf": "bitrate-vs-resolution",
  "locale": "de",
  "slug": "bitrate-und-aufloesung",
  "title": "Bitrate und Auflösung: Was ist der Unterschied?",
  "description": "Verstehe Pixel, Bits pro Sekunde und Größenberechnungen, um Videos sinnvoll zu vergleichen und Speicherbedarf abzuschätzen.",
  "category": "Größe und Qualität",
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
Auflösung beschreibt Pixel pro Bild. Bitrate beschreibt Daten pro Sekunde. Beide wirken auf ein Video, sind aber nicht austauschbar. Ein hochauflösendes Bild mit zu wenig Daten kann schlechter aussehen als eine kleinere, gut codierte Fassung. Zur Größenberechnung gehört außerdem die Dauer.

## Pixel beschreiben das Bild

1920 × 1080 enthält mehr Pixel als 1280 × 720. Zusätzliche Details entstehen nur, wenn Aufnahme und Codierung sie erhalten. Die Bildrate beschreibt Bewegung. Eine ruhige Folie stellt andere Anforderungen als eine schnell bewegte Kamera.

## Bitrate beschreibt das Datenbudget

Sie wird häufig in Kilobit oder Megabit pro Sekunde angegeben. Acht Bits ergeben ein Byte. Variable Bitrate verteilt mehr Daten auf anspruchsvolle Abschnitte. Eine Videoangabe kann Audio ausschließen; Container-Metadaten kommen hinzu. Deshalb kann eine Schätzung vor der Vorbereitung vom fertigen Ergebnis abweichen.

## Eine brauchbare Näherung berechnen

60 Sekunden mit durchschnittlich 3 Megabit pro Sekunde enthalten ungefähr `3000000 × 60 ÷ 8 = 22500000` Bytes Videodaten: 22,5 dezimale MB beziehungsweise etwa 21,5 MiB. Audio und Container erhöhen den Gesamtwert.

Doppelte Dauer bei gleicher mittlerer Bitrate verdoppelt ungefähr die Größe. Doppelte Auflösung folgt keiner solchen direkten Regel. [720p, 1080p und 4K](/blog/720p-1080p-4k) erklären die Bildmaße.

## Unter gleichen Bedingungen vergleichen

Verwende dieselbe Szene, Anzeigegröße und Lautstärke. Achte auf Bewegung, Texturen, kleine Schrift und dunkle Verläufe. Rauschen und Fokus zählen schon an der Quelle. Unterschiedliche Codecs liefern bei gleicher Bitrate nicht zwingend dieselbe Qualität. Mehr Daten retten keine bereits fehlenden Details.

## Die nützliche Kopie wählen

Referenz, Präsentation und Schnittquelle benötigen Unterschiedliches. Teste zur Weitergabe eine kleinere Variante auf dem Zielgerät; bewahre zur Archivierung das Original. VidFetch zeigt Quellformate, erzeugt aber keine Videocodierung mit frei gewählter Bitrate. [Größenreduktion](/blog/reduce-video-size) behandelt lokale Kopien.

## Häufige Frage

### Verbessert 320-kbps-MP3 eine schlechte Aufnahme?

Nein. Eine Bitratenangabe stellt fehlende Informationen nicht wieder her. [MP3 und M4A](/blog/mp3-vs-m4a) erläutern dieselbe Unterscheidung für Audio.
