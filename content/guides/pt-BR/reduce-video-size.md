---
{
  "id": "reduce-video-size",
  "translationOf": "reduce-video-size",
  "locale": "pt-BR",
  "slug": "reduzir-tamanho-video",
  "title": "Como reduzir o tamanho de um vídeo com cuidado",
  "description": "Faça uma cópia menor ajustando duração, resolução ou compressão e confira o resultado antes de substituir qualquer arquivo.",
  "category": "Tamanho e qualidade",
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
Reduzir um vídeo significa diminuir seus dados. Cortar um trecho desnecessário, baixar o bitrate ou escolher uma resolução menor são decisões diferentes. Trabalhe em uma cópia e teste uma cena representativa. Não existe um ajuste que garanta a mesma qualidade com muito menos tamanho em todas as fontes.

## Defina o uso da cópia

Um vídeo para mensagem não precisa das mesmas configurações de um arquivo para edição. Escolha destino, duração útil e limite de tamanho. Preserve o original. Remover uma introdução pode ajudar mais que comprimir agressivamente todos os quadros.

## Ajuste resolução e movimento

Converter 4K para 1080p reduz os pixels a codificar e perde detalhes finos. Ampliar 720p não recria informações. Diminuir a taxa de quadros muda o movimento, especialmente em esportes. Consulte [as resoluções](/blog/720p-1080p-4k) e avalie uma amostra no aparelho de destino.

## Teste uma codificação local

Com FFmpeg e os codificadores necessários, o comando cria uma nova cópia MP4 com a primeira faixa de vídeo e áudio, quando presente:

```sh
ffmpeg -i original.mp4 -map 0:v:0 -map '0:a:0?' -c:v libx264 -crf 23 -preset medium -c:a aac -b:a 128k -movflags +faststart copia-menor.mp4
```

CRF controla um compromisso de qualidade nesse codificador. Um valor maior geralmente economiza dados sacrificando detalhes. `23` é um teste inicial, não promessa de tamanho. O preset influencia velocidade e compressão; o áudio também é recodificado aqui.

## Confira antes de decidir

- Veja cenas escuras e com movimento.
- Escute falas e confira sincronização.
- Verifique duração e reprodução no destino.
- Mantenha original e backup testado.

## O papel do VidFetch

O serviço lista formatos da origem e pode converter áudio para MP3. Não recebe vídeos para compressão nem oferece controle CRF personalizado. Uma versão disponível menor pode resolver. [A conta do bitrate](/blog/bitrate-vs-resolution) ajuda a planejar, sem garantir um limite exato.

## Pergunta frequente

### Devo guardar só a versão comprimida?

Para gravações suas que podem ser reutilizadas, mantenha o original. Uma cópia de distribuição atende a um uso específico, não a todas as futuras edições.
