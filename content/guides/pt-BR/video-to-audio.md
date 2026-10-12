---
{
  "id": "video-to-audio",
  "translationOf": "video-to-audio",
  "locale": "pt-BR",
  "slug": "converter-video-em-audio",
  "title": "Como converter um vídeo em arquivo de áudio",
  "description": "Copie uma faixa compatível ou crie um MP3 dos seus vídeos com FFmpeg, preservando a entrada e verificando o resultado.",
  "category": "Conversão de áudio",
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
Um vídeo pode conter uma faixa de áudio independente. Criar um arquivo de som significa copiá-la para um contêiner compatível ou codificá-la em outro formato, como MP3. A cópia pode preservar os dados; a conversão pode ajudar a compatibilidade, mas não melhora a fonte. Use apenas conteúdo próprio ou autorizado.

## Confira se existe áudio

Algumas gravações são silenciosas. Outras têm vários idiomas ou comentários. Escute e inspecione as faixas antes de escolher. Extrair som não remove vocais nem separa instrumentos: uma mistura continua misturada na saída.

## Crie um MP3 local

Com FFmpeg e libmp3lame, este comando seleciona a primeira faixa de áudio e cria um arquivo separado a 192 kbps:

```sh
ffmpeg -i meu-video.mp4 -map 0:a:0 -vn -c:a libmp3lame -b:a 192k trilha.mp3
```

Se não existir áudio, o comando deve informar a ausência, não inventar som. Preserve a entrada e teste a saída. A primeira faixa pode não ser o idioma desejado; ajuste a seleção quando necessário.

## Copie AAC sem codificar novamente

Depois de confirmar que a faixa escolhida é AAC, uma cópia para M4A pode evitar perdas adicionais:

```sh
ffmpeg -i meu-video.mp4 -map 0:a:0 -vn -c:a copy trilha.m4a
```

Isso depende da entrada. Não é uma conversão universal: o contêiner deve admitir o codec. Caso contrário, use um contêiner compatível ou faça uma nova codificação. Veja [MP3 ou M4A](/blog/mp3-vs-m4a).

## Escolha e teste o resultado

Use um formato aceito pelo player ou editor. Compare o mesmo trecho com volume igual e confira duração e final completo. Um bitrate alto não recupera detalhes perdidos. Evite sucessivas conversões com perdas e mantenha a melhor fonte disponível.

## A alternativa no VidFetch

Analise um link autorizado e acessível, abra Áudio e escolha uma opção disponível. MP3 usa 192 kbps; os formatos originais dependem da origem. Selecionar áudio não contorna login ou bloqueios da plataforma. Limites de tamanho, duração e concorrência continuam valendo.

## Pergunta frequente

### A conversão para MP3 é sem perdas?

Não. MP3 é um formato com perdas. Preserve o original e consulte [o guia de falhas](/blog/video-download-fails) antes de repetir uma preparação malsucedida.
