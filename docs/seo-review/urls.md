# URL avant → après

Source : registre des routes réellement résolues, incluant le blog noindex absent de l’ancien sitemap. Les variantes slash suivent la même politique de canonicalisation.

| Avant (main) | Après (PR) | Attendu |
|---|---|---|
| `/` | `/` | 200 |
| `/blog` | `/blog` | 200 |
| `/legal` | `/legal` | 200 |
| `/blog/720p-1080p-4k` | `/blog/720p-1080p-4k` | 200 |
| `/blog/backup-your-videos` | `/blog/backup-your-videos` | 200 |
| `/blog/bitrate-vs-resolution` | `/blog/bitrate-vs-resolution` | 200 |
| `/blog/h264-h265-av1` | `/blog/h264-h265-av1` | 200 |
| `/blog/mp3-vs-m4a` | `/blog/mp3-vs-m4a` | 200 |
| `/blog/mp4-vs-webm` | `/blog/mp4-vs-webm` | 200 |
| `/blog/reduce-video-size` | `/blog/reduce-video-size` | 200 |
| `/blog/video-download-fails` | `/blog/video-download-fails` | 200 |
| `/blog/video-format-smartphone` | `/blog/video-format-smartphone` | 200 |
| `/blog/video-to-audio` | `/blog/video-to-audio` | 200 |
| `/tiktok-video-downloader` | `/tiktok-video-downloader` | 200 |
| `/tiktok-to-mp3` | `/tiktok-to-mp3` | 200 |
| `/fr/` | `/fr` | 301 → 200 |
| `/fr/mentions-legales` | `/fr/mentions-legales` | 200 |
| `/fr/telecharger-video-tiktok` | `/fr/telecharger-video-tiktok` | 200 |
| `/fr/tiktok-en-mp3` | `/fr/tiktok-en-mp3` | 200 |
| `/es/` | `/es` | 301 → 200 |
| `/es/aviso-legal` | `/es/aviso-legal` | 200 |
| `/pt/` | `/pt` | 301 → 200 |
| `/pt/termos-e-privacidade` | `/pt/termos-e-privacidade` | 200 |
| `/id/` | `/id` | 301 → 200 |
| `/id/ketentuan-dan-privasi` | `/id/ketentuan-dan-privasi` | 200 |
| `/de/` | `/de` | 301 → 200 |
| `/de/rechtliches` | `/de/rechtliches` | 200 |
| `/it/` | `/it` | 301 → 200 |
| `/it/note-legali` | `/it/note-legali` | 200 |
| `/ar/` | `/ar` | 301 → 200 |
| `/ar/الشروط-والخصوصية` | `/ar/الشروط-والخصوصية` | 200 |

## Nouvelles URL

- `/blog/save-tiktok-phone-gallery`
- `/blog/save-tiktok-sound-mp3`
- `/blog/why-cant-i-save-tiktok`
- `/fr/guides`
- `/fr/guides/enregistrer-tiktok-galerie-iphone-android`
- `/fr/guides/recuperer-son-tiktok-mp3`
- `/fr/guides/pourquoi-impossible-enregistrer-tiktok`
- `/es/descargar-video-tiktok`
- `/es/tiktok-a-mp3`
- `/pt/baixar-video-tiktok`
- `/pt/tiktok-para-mp3`
- `/id/download-video-tiktok`
- `/id/tiktok-ke-mp3`
- `/de/tiktok-video-herunterladen`
- `/de/tiktok-zu-mp3`
- `/it/scaricare-video-tiktok`
- `/it/tiktok-in-mp3`
- `/ar/tahmil-video-tiktok`
- `/ar/tiktok-mp3`

## Ressources publiques stables

| Avant | Après | Réponse à travers Caddy Docker |
|---|---|---|
| `/ads.txt` | identique, même blob Git | 200 |
| `/favicon.ico` | identique, même blob Git | 200 |
| `/icon.svg` | identique, même blob Git | 200 |
| `/og-image-v2.jpg` | identique, même blob Git | 200 |
| `/og-image-v3.jpg` | identique, même blob Git | 200 |
| `/og-image.jpg` | identique, même blob Git | 200 |
| `/og-image.svg` | identique, même blob Git | 200 |

`/robots.txt`, `/sitemap.xml` et `/manifest.webmanifest` restent en 200. Les API et endpoints authentifiés gardent leurs contrats et ne sont pas des pages éditoriales à exiger en 200 sans requête valide. Les chunks `/_next/` à hash sont des artefacts de build, pas des permaliens de contenu.
