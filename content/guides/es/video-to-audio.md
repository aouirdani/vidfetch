---
{
  "id": "video-to-audio",
  "translationOf": "video-to-audio",
  "locale": "es",
  "slug": "convertir-video-en-audio",
  "title": "Cómo convertir un vídeo en un archivo de audio",
  "description": "Extrae una pista compatible o crea un MP3 de tus vídeos con FFmpeg, conservando el original y verificando la duración.",
  "category": "Conversión de audio",
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
Un vídeo puede contener una pista de sonido independiente. Crear un archivo de audio consiste en copiarla a un contenedor compatible o codificarla a otro formato, como MP3. La copia puede conservar los datos exactos; recodificar puede mejorar compatibilidad, no la calidad original. Usa solo material propio o autorizado.

## Comprueba qué sonido contiene

Hay grabaciones mudas y otras con varias pistas, idiomas o comentarios. Escucha e inspecciona la lista antes de escoger. Extraer audio no separa instrumentos ni elimina voces: una mezcla sigue siendo una mezcla en la salida.

## Crea un MP3 local

Con FFmpeg y libmp3lame, esta orden toma la primera pista de audio y genera un archivo separado a 192 kbps:

```sh
ffmpeg -i mi-video.mp4 -map 0:a:0 -vn -c:a libmp3lame -b:a 192k sonido.mp3
```

Si no existe audio, la orden debe indicar la ausencia. Conserva la entrada y comprueba la salida. La primera pista podría no ser el idioma deseado: ajusta la selección si es necesario.

## Copia AAC sin recodificar cuando sea compatible

Si confirmas que la pista elegida es AAC, esta copia a M4A puede evitar una nueva compresión con pérdida:

```sh
ffmpeg -i mi-video.mp4 -map 0:a:0 -vn -c:a copy sonido.m4a
```

No es una conversión universal. El contenedor debe admitir el códec de entrada. Si no encaja, elige otro contenedor o codifica otra pista. [MP3 y M4A](/blog/mp3-vs-m4a) tienen funciones distintas.

## Verifica el resultado

Elige lo que acepte el reproductor o editor. Compara un pasaje al mismo volumen, escucha hasta el final y comprueba duración. Un bitrate alto no recupera información perdida. Evita encadenar conversiones con pérdida y guarda la mejor fuente.

## La opción de VidFetch

Analiza un enlace autorizado y accesible, abre Audio y escoge una opción disponible. MP3 se codifica a 192 kbps; los formatos originales dependen de la fuente. Elegir audio no evita restricciones de cuenta o de plataforma. Siguen aplicándose límites de tamaño, duración y concurrencia.

## Pregunta frecuente

### ¿MP3 es sin pérdida?

No: usa compresión con pérdida. Conserva el original. Si la preparación falla, consulta [la guía de problemas](/blog/video-download-fails) antes de repetir solicitudes.
