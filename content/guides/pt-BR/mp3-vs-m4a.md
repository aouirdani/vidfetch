---
{
  "id": "mp3-vs-m4a",
  "translationOf": "mp3-vs-m4a",
  "locale": "pt-BR",
  "slug": "mp3-ou-m4a",
  "title": "MP3 ou M4A: qual formato de áudio manter?",
  "description": "Entenda MP3, AAC e ALAC e escolha o áudio pela compatibilidade e pela faixa real, não apenas pela extensão.",
  "category": "Formatos de áudio",
  "created": "2026-10-12",
  "updated": "2026-10-12",
  "published": null,
  "status": "review",
  "sourceSha256": "d265fce6931f13fabd6b3f200e5c3c9acc34bed7252b730a12f1ef6ae5a48aef",
  "review": {
    "linguistic": "pending",
    "technical": "pending",
    "reviewer": null,
    "reviewedAt": null
  },
  "related": [
    "video-to-audio",
    "bitrate-vs-resolution",
    "backup-your-videos"
  ],
  "sources": [
    {
      "title": "MDN: audio codecs",
      "url": "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs"
    },
    {
      "title": "Apple: ALAC reference implementation",
      "url": "https://github.com/macosforge/alac"
    }
  ],
  "sourceBodySha256": "f025b11c35a95867d7016d89b3b61e59af99c75dcc309845925192870056b058"
}
---
MP3 é útil quando o aparelho ou programa exige esse formato. Se um M4A já funciona, mantê-lo evita conversões desnecessárias. M4A identifica um contêiner que pode guardar AAC com perdas ou ALAC sem perdas. O nome do arquivo sozinho não informa a qualidade da gravação.

## Examine o áudio real

Codecs com perdas descartam informações para reduzir tamanho. Codecs sem perdas preservam o sinal decodificado, mas não recuperam detalhes removidos anteriormente. Criar um ALAC a partir de uma fonte comprimida não reconstrói o original. Guarde a melhor fonte disponível para [seus backups](/blog/backup-your-videos).

## Entenda bitrate e tamanho

Três minutos a 192 kilobits por segundo constantes representam aproximadamente 4,32 MB: `192000 × 180 ÷ 8`. Metadados e contêiner acrescentam um pouco mais. Com bitrate variável, o resultado depende dos trechos codificados.

A conta estima tamanho, não qualidade percebida. Codecs diferentes não soam necessariamente iguais no mesmo bitrate. Compare o mesmo trecho e volume; voz e música complexa têm necessidades distintas.

## Quando manter M4A

Se o reprodutor aceita o arquivo, confira se ele contém AAC ou ALAC. Uma faixa AAC compatível pode ser copiada para M4A sem nova codificação. Isso não equivale a converter qualquer áudio para AAC: o contêiner precisa aceitar a faixa copiada.

## Quando criar um MP3

Pode ser necessário em um dispositivo antigo ou em um fluxo específico. Converta uma cópia, preserve a entrada e confira início, meio e fim. Evite alternar repetidamente entre formatos com perdas, pois mudanças podem se acumular sem melhorar a fonte.

## A opção de áudio do VidFetch

Quando a origem autorizada está acessível, o MP3 é codificado a 192 kbps. Isso não cria uma reconstrução sem perdas nem melhora a qualidade original. Um formato de áudio original também pode estar disponível, conforme a plataforma.

## Pergunta frequente

### Um M4A maior sempre tem som melhor?

Não. Duração, codec e bitrate também explicam o tamanho. Identifique a faixa e escute o mesmo trecho. Veja [vídeo para áudio](/blog/video-to-audio) para distinguir cópia e conversão.
