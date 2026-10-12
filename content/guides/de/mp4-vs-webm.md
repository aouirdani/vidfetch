---
{
  "id": "mp4-vs-webm",
  "translationOf": "mp4-vs-webm",
  "locale": "de",
  "slug": "mp4-oder-webm",
  "title": "MP4 oder WebM: Welches Videoformat passt?",
  "description": "Vergleiche Container, Codecs und Geräteunterstützung, bevor du eigene Videos als MP4 oder WebM speicherst oder teilst.",
  "category": "Videoformate",
  "created": "2026-10-12",
  "updated": "2026-10-12",
  "published": null,
  "status": "review",
  "sourceSha256": "46884183dd7f8e6c5fd1ef0420b04744f3fe058f1b4a7adcf3d8789e8d0baff6",
  "review": {
    "linguistic": "pending",
    "technical": "pending",
    "reviewer": null,
    "reviewedAt": null
  },
  "related": [
    "h264-h265-av1",
    "video-format-smartphone",
    "bitrate-vs-resolution"
  ],
  "sources": [
    {
      "title": "MDN: media containers",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers"
    },
    {
      "title": "WebM container guidelines",
      "url": "https://www.webmproject.org/docs/container/"
    }
  ],
  "sourceBodySha256": "dcc784ad61b3b018d19f23a998202d1b4ac2f0a670b2d711dde20557d639a092"
}
---
MP4 ist häufig ein sinnvoller Ausgangspunkt für Videos auf verschiedenen Geräten. WebM kann für eine Website passen, wenn die vorgesehenen Browser den Inhalt unterstützen. Die Endung allein garantiert weder Bildqualität noch Wiedergabe. Prüfe Video- und Audiocodec sowie die Anwendung, die die Datei öffnen soll.

## Container und Codec erfüllen unterschiedliche Aufgaben

Der Container hält Spuren und Zeitinformationen zusammen. Ein Codec komprimiert Bild oder Ton. MP4 enthält oft H.264 und AAC, kann aber andere Kombinationen aufnehmen. WebM verwendet ein eingeschränktes Matroska-Profil, etwa mit VP8, VP9 oder AV1 sowie Vorbis oder Opus.

Eine Umbenennung von `urlaub.webm` in `urlaub.mp4` ändert keine Spur. Unser [Codec-Ratgeber](/blog/h264-h265-av1) erklärt den Unterschied genauer.

## Wähle für das Zielgerät

Für Familienvideos auf Handys und Computern ist MP4 mit H.264 und AAC oft praktisch. Das garantiert keine Unterstützung ungewöhnlicher Profile oder alter Geräte. Teste einen kurzen Ausschnitt auf dem ältesten benötigten Gerät, bevor du eine ganze Sammlung verschickst.

Eine Website kann mehrere Quellen für unterschiedliche Browser anbieten. Eine Datei, die auf deinem Computer funktioniert, muss nicht in jeder anderen Anwendung laufen.

## Die Endung bestimmt nicht die Größe

Dauer, Bitrate, Auflösung, Bildrate und Encoder-Einstellungen beeinflussen die Dateigröße. WebM ist nicht automatisch kleiner und MP4 kein Qualitätssiegel. Vergleiche dieselbe Szene unter gleichen Bedingungen, besonders Bewegung, Texturen und dunkle Verläufe. Beachte [Bitrate und Auflösung](/blog/bitrate-vs-resolution) gemeinsam.

## Ein einfacher Auswahlablauf

- Bewahre das Original für die Archivierung auf.
- Bestimme Handy, Schnittprogramm oder Website als Ziel.
- Prüfe beide Codecs statt nur die Endung.
- Teste eine Probe und konvertiere nur bei Bedarf eine Kopie.

## Formate in VidFetch

Die Auswahl stammt aus einer zugänglichen Quelle. Nicht jedes Video bietet MP4 und WebM. Speichere nur eigene oder erlaubte Inhalte. Zugänglichkeit der Quelle und Abspielbarkeit der Datei sind getrennte Fragen.

## Häufige Frage

### Geht WebM zu MP4 ohne Qualitätsverlust?

Manchmal können passende Spuren ohne Neucodierung in einen anderen Container kopiert werden: Remuxing. Verlangt das Ziel einen anderen Codec, ist Transcodierung nötig und das Bild kann sich ändern. Siehe auch [Formate fürs Smartphone](/blog/video-format-smartphone).
