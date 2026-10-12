---
{
  "id": "reduce-video-size",
  "translationOf": "reduce-video-size",
  "locale": "es",
  "slug": "reducir-tamano-video",
  "title": "Cómo reducir el tamaño de un vídeo con cuidado",
  "description": "Crea una copia más ligera ajustando duración, resolución o compresión y verifica el resultado antes de reemplazar archivos.",
  "category": "Tamaño y calidad",
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
Reducir un vídeo significa disminuir los datos que contiene. Recortar una parte innecesaria, bajar el bitrate o cambiar la resolución son decisiones distintas. Trabaja sobre una copia y prueba una escena representativa. No existe un ajuste que garantice la misma calidad y mucho menos tamaño para cualquier fuente.

## Define para qué usarás la copia

Un clip para mensajería no necesita lo mismo que material para editar. Decide destino, duración útil y límite de tamaño. Guarda el original. Quitar una introducción puede ser más útil que comprimir con demasiada fuerza todas las imágenes.

## Ajusta resolución y movimiento

Pasar de 4K a 1080p reduce los píxeles que hay que codificar, pero pierde detalle fino. Ampliar 720p no recupera información. Bajar los fotogramas por segundo cambia el movimiento, especialmente en deporte. Consulta [las resoluciones](/blog/720p-1080p-4k) y prueba antes de aceptar el resultado.

## Ensaya una codificación local

Con FFmpeg y los codificadores necesarios, esta orden crea un MP4 nuevo con la primera pista de vídeo y el primer audio si existe:

```sh
ffmpeg -i original.mp4 -map 0:v:0 -map '0:a:0?' -c:v libx264 -crf 23 -preset medium -c:a aac -b:a 128k -movflags +faststart copia-pequena.mp4
```

CRF controla un compromiso de calidad para este codificador. Un valor mayor suele ahorrar datos a costa de detalle. `23` es un experimento inicial, no una promesa de peso. El preset cambia velocidad y eficiencia; aquí también se recodifica el audio.

## Comprueba la copia

- Mira una escena oscura y otra con movimiento.
- Escucha voces y comprueba sincronización.
- Verifica duración y reproducción en el destino.
- Conserva el original y una copia de seguridad probada.

## Qué ofrece VidFetch

Lista formatos de la fuente y puede convertir audio a MP3. No es un compresor de vídeos subidos ni ofrece un control CRF personalizado. Elegir una versión disponible más pequeña puede bastar. [El cálculo del bitrate](/blog/bitrate-vs-resolution) ayuda a estimar límites, sin garantizar un peso exacto.

## Pregunta frecuente

### ¿Puedo borrar el original?

Para tus grabaciones reutilizables, conserva el original: una copia de distribución no cubre todas las futuras necesidades de edición.
