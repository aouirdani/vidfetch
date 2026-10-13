---
{
  "id": "bitrate-vs-resolution",
  "translationOf": "bitrate-vs-resolution",
  "locale": "pt-BR",
  "slug": "bitrate-e-resolucao",
  "title": "Bitrate e resolução: qual é a diferença?",
  "description": "Entenda pixels, bits por segundo e estimativas de tamanho para comparar vídeos sem confundir peso e qualidade.",
  "category": "Tamanho e qualidade",
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
Resolução descreve os pixels de uma imagem. Bitrate indica dados por segundo. Eles não são intercambiáveis: uma imagem grande com poucos dados pode parecer pior que outra menor bem codificada. A duração é essencial para estimar o tamanho completo do arquivo.

## Pixels descrevem a imagem

1920 × 1080 tem mais pixels que 1280 × 720, mas só permite mais detalhe se a captura e a codificação o preservarem. Taxa de quadros descreve o movimento. Um slide estático e uma câmera rápida não exigem o mesmo orçamento de dados.

## Bitrate descreve o orçamento

É normalmente indicado em kilobits ou megabits por segundo. Oito bits formam um byte. Bitrate variável reserva mais dados para trechos difíceis. O valor de vídeo pode excluir áudio, e o contêiner adiciona metadados. Por isso a estimativa anterior à preparação pode diferir da saída completa.

## Faça uma conta aproximada

Sessenta segundos a 3 megabits por segundo de média representam `3000000 × 60 ÷ 8 = 22500000` bytes de vídeo: 22,5 MB decimais, cerca de 21,5 MiB. Áudio e contêiner aumentam o total.

Dobrar duração no mesmo bitrate médio dobra aproximadamente o tamanho. Dobrar resolução não impõe a mesma regra. Veja [720p, 1080p e 4K](/blog/720p-1080p-4k) para entender dimensões.

## Compare com justiça

Use a mesma cena, tamanho de reprodução e volume. Observe movimento, textura, texto fino e sombras. Ruído e foco da fonte também importam. Codecs diferentes no mesmo bitrate não garantem igual aparência. Dados adicionais não recuperam detalhes perdidos na captura.

## Escolha a cópia necessária

Referência, apresentação e material de edição têm necessidades diferentes. Para compartilhar, teste uma versão menor no destino; para arquivar, preserve o original. VidFetch mostra formatos e tamanhos da origem, sem codificação de vídeo com bitrate personalizado. [A redução de tamanho](/blog/reduce-video-size) trata do processo local.

## Pergunta frequente

### MP3 a 320 kbps melhora uma gravação ruim?

Não. O bitrate não recupera informação já ausente. [MP3 e M4A](/blog/mp3-vs-m4a) aplicam a mesma distinção ao áudio.
