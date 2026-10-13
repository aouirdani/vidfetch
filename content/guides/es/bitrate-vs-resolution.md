---
{
  "id": "bitrate-vs-resolution",
  "translationOf": "bitrate-vs-resolution",
  "locale": "es",
  "slug": "bitrate-y-resolucion",
  "title": "Bitrate y resolución de vídeo: cuál es la diferencia",
  "description": "Aprende a calcular el tamaño y comparar píxeles, bits por segundo y calidad sin confundir unidades.",
  "category": "Tamaño y calidad",
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
La resolución describe los píxeles de cada imagen. El bitrate indica datos por segundo. No son intercambiables: una resolución alta con pocos datos puede verse peor que otra menor bien codificada. La duración completa es necesaria para estimar cuánto ocupará el archivo.

## Los píxeles describen el cuadro

1920 × 1080 tiene más píxeles que 1280 × 720, pero solo conserva detalle si la captura y el procesamiento lo mantienen. Los fotogramas por segundo describen el movimiento. Una diapositiva quieta y una cámara rápida exigen presupuestos de datos diferentes.

## El bitrate describe el presupuesto

Se expresa en kilobits o megabits por segundo. Ocho bits forman un byte. El bitrate variable asigna más datos a las partes complejas. La cifra de vídeo puede no incluir audio, y el contenedor añade metadatos. Por eso una estimación puede diferir del archivo terminado.

## Haz un cálculo aproximado

Sesenta segundos a 3 megabits por segundo de media contienen aproximadamente `3000000 × 60 ÷ 8 = 22500000` bytes de vídeo: 22,5 MB decimales, unos 21,5 MiB. Audio y contenedor aumentan el total.

Duplicar duración al mismo bitrate medio duplica aproximadamente el peso. Duplicar resolución no impone ese resultado. Consulta [720p, 1080p y 4K](/blog/720p-1080p-4k) para las dimensiones.

## Compara en condiciones equivalentes

Usa la misma escena, tamaño de reproducción y volumen. Mira movimiento, texturas, letras pequeñas y sombras. El ruido y el enfoque de la fuente influyen antes de codificar. Dos códecs a igual bitrate no garantizan igual aspecto; más datos no recuperan detalles que nunca existieron.

## Elige una copia útil

Una referencia, una presentación y material de edición tienen necesidades distintas. Prueba la versión menor en el destino para distribución y guarda el original para archivo. VidFetch muestra formatos y tamaños de la fuente, no crea un bitrate de vídeo personalizado. [La reducción de tamaño](/blog/reduce-video-size) trata el trabajo local.

## Pregunta frecuente

### ¿MP3 a 320 kbps mejora una grabación mala?

No. El bitrate no recupera información perdida. La misma distinción se aplica al audio; consulta [MP3 y M4A](/blog/mp3-vs-m4a).
