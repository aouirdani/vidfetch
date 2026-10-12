---
{
  "id": "video-to-audio",
  "translationOf": "video-to-audio",
  "locale": "id",
  "slug": "mengubah-video-menjadi-audio",
  "title": "Cara mengubah video menjadi berkas audio",
  "description": "Salin trek yang kompatibel atau buat MP3 dari video Anda menggunakan FFmpeg, lalu periksa hasil dan pertahankan sumbernya.",
  "category": "Konversi audio",
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
Video dapat mempunyai trek audio tersendiri. Membuat berkas audio berarti menyalin trek itu ke kontainer yang cocok atau mengodekannya ke format lain, misalnya MP3. Penyalinan dapat menjaga data tepat; konversi membantu kompatibilitas, bukan meningkatkan suara asli. Gunakan hanya konten milik Anda atau dengan izin.

## Pastikan ada suara

Sebagian video tidak bersuara. Yang lain memiliki beberapa bahasa atau komentar. Dengarkan dan periksa daftar trek sebelum memilih. Ekstraksi biasa tidak memisahkan instrumen atau menghapus vokal: suara yang sudah dicampur tetap tercampur.

## Buat MP3 secara lokal

FFmpeg dengan libmp3lame dapat mengambil trek audio pertama dan membuat berkas terpisah pada 192 kbps:

```sh
ffmpeg -i video-saya.mp4 -map 0:a:0 -vn -c:a libmp3lame -b:a 192k suara.mp3
```

Jika tidak ada audio, perintah harus melaporkannya, bukan membuat suara. Simpan masukan dan uji hasil. Trek pertama mungkin bukan bahasa yang Anda inginkan; sesuaikan pemilihan jika perlu.

## Salin AAC yang kompatibel

Jika pemeriksaan memastikan trek pilihan memakai AAC, menyalinnya ke M4A dapat menghindari pengodean lossy baru:

```sh
ffmpeg -i video-saya.mp4 -map 0:a:0 -vn -c:a copy suara.m4a
```

Perintah ini bergantung pada masukan. Bukan konversi universal: kontainer harus mendukung codec. Pilih keluaran yang cocok atau kodekan ulang jika tidak kompatibel. Baca [MP3 dan M4A](/blog/mp3-vs-m4a).

## Periksa keluaran

Gunakan format yang diterima pemutar atau penyunting. Bandingkan bagian sama pada volume sama, periksa durasi, dan dengarkan sampai akhir. Bitrate tinggi tidak mengembalikan informasi yang telah hilang. Hindari konversi lossy berulang dan simpan sumber terbaik.

## Pilihan melalui VidFetch

Analisis tautan berizin yang dapat diakses, buka Audio, lalu pilih format tersedia. MP3 menggunakan 192 kbps; audio asli bergantung pada sumber. Memilih Audio tidak melewati persyaratan login atau pembatasan platform. Batas ukuran, durasi, dan operasi bersamaan tetap berlaku.

## Pertanyaan umum

### Apakah MP3 lossless?

Tidak. MP3 menggunakan kompresi lossy. Simpan rekaman asli. Jika persiapan gagal, lihat [panduan kegagalan](/blog/video-download-fails) sebelum mengulang permintaan.
