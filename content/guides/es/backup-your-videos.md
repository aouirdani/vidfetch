---
{
  "id": "backup-your-videos",
  "translationOf": "backup-your-videos",
  "locale": "es",
  "slug": "copias-seguridad-videos",
  "title": "Buenas prácticas para guardar copias de tus vídeos",
  "description": "Conserva originales, usa ubicaciones independientes y prueba la restauración real de tus vídeos y sus checksums.",
  "category": "Copias de seguridad",
  "created": "2026-10-12",
  "updated": "2026-10-12",
  "published": null,
  "status": "review",
  "sourceSha256": "4e716cac571075a851759d9491b25ee6f112ca02c82c56e2b10ff2b959e175c3",
  "review": {
    "linguistic": "pending",
    "technical": "pending",
    "reviewer": null,
    "reviewedAt": null
  },
  "related": [
    "mp4-vs-webm",
    "reduce-video-size",
    "video-to-audio"
  ],
  "sources": [
    {
      "title": "Library of Congress: personal digital archiving",
      "url": "https://www.digitalpreservation.gov/personalarchiving/"
    },
    {
      "title": "GNU Coreutils: checksum utilities",
      "url": "https://www.gnu.org/software/coreutils/manual/html_node/cksum-common-options.html"
    }
  ],
  "sourceBodySha256": "eeaa156218e90692cd5ef5da3042187785f42b7ecb328c5c8b4d0a4b91bceb7b"
}
---
Una copia de seguridad útil conserva originales y permite recuperarlos si falla el almacenamiento principal. Empieza con material propio o autorizado. Mantén copias independientes y prueba que puedes restaurarlas y reproducirlas. Una carpeta sincronizada no demuestra por sí sola que exista un archivo recuperable.

## Conserva la grabación original

Una copia pequeña para compartir puede perder detalle y metadatos. Guarda originales y versiones editadas con nombres claros, como `2026-10-viaje-original` y `2026-10-viaje-compartir`. Añade notas sobre el evento, permisos y cambios. Repetir conversiones con pérdida no es una estrategia de archivo.

## Separa las copias

Dos archivos en el mismo disco comparten su riesgo de fallo. Considera otro soporte y, cuando sea apropiado, otra ubicación. Elige una organización que puedas mantener. La sincronización puede propagar borrados accidentales: revisa historial de versiones o mecanismos de recuperación y pruébalos, sin depender de una marca concreta.

## Verifica los bytes

Un checksum ayuda a detectar cambios. En Linux:

```sh
sha256sum mi-video.mp4 > mi-video.mp4.sha256
sha256sum -c mi-video.mp4.sha256
```

Usa el directorio correcto o ajusta la ruta registrada. macOS suele incluir `shasum -a 256`. La coincidencia demuestra igualdad con la referencia; no prueba propiedad, autenticidad ni que el original estuviera sano.

## Haz una restauración de prueba

Recupera muestras a una carpeta separada. Comprueba checksum, inicio, final, duración y sonido. Si hay varios formatos, prueba más de uno. Repite después de cambiar disco, programa o estructura de carpetas. Conserva instrucciones de recuperación junto al archivo.

## Distingue descargar y archivar

Una descarga autorizada de tu material publicado puede ser una versión comprimida distinta del máster. Guarda los originales cuando los tengas. Un ticket temporal de VidFetch no es una ubicación permanente. Comprueba la transferencia completa antes del backup. [Los contenedores](/blog/mp4-vs-webm) y [copias menores](/blog/reduce-video-size) resuelven otras necesidades.

## Pregunta frecuente

### ¿Conviene convertir todo a un formato?

Guarda primero los originales. Una copia compatible puede ayudar a reproducir, pero reemplazar todos los originales por compresión con pérdida descarta información.
