---
{
  "id": "reduce-video-size",
  "translationOf": "reduce-video-size",
  "locale": "id",
  "slug": "mengecilkan-ukuran-video",
  "title": "Cara mengecilkan ukuran video dengan hati-hati",
  "description": "Buat salinan lebih ringan melalui durasi, resolusi, atau kompresi yang sesuai, lalu periksa hasil tanpa mengganti sumber asli.",
  "category": "Ukuran dan kualitas",
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
Mengecilkan video berarti mengurangi data yang dikandungnya. Memotong bagian tidak diperlukan, menurunkan bitrate, dan mengubah resolusi adalah keputusan berbeda. Kerjakan salinan dan uji adegan representatif. Tidak ada pengaturan yang menjamin kualitas identik dengan ukuran jauh lebih kecil untuk semua sumber.

## Tentukan penggunaan salinan

Klip untuk pesan tidak memerlukan pengaturan yang sama dengan bahan penyuntingan. Tentukan perangkat tujuan, durasi yang dibutuhkan, dan batas ukuran. Pertahankan sumber asli. Memotong pembukaan yang tidak diperlukan kadang lebih bermanfaat daripada memampatkan setiap bingkai secara agresif.

## Sesuaikan resolusi dan gerakan

Menurunkan 4K ke 1080p mengurangi piksel yang harus dikodekan, tetapi menghilangkan detail halus. Memperbesar 720p tidak memulihkan informasi. Mengurangi laju bingkai mengubah gerakan, terutama olahraga. Pelajari [resolusi](/blog/720p-1080p-4k) dan uji pada perangkat tujuan sebelum menerima hasil.

## Coba pengodean lokal

Dengan FFmpeg dan encoder yang diperlukan, perintah ini membuat MP4 baru dari trek video pertama dan audio pertama jika tersedia:

```sh
ffmpeg -i original.mp4 -map 0:v:0 -map '0:a:0?' -c:v libx264 -crf 23 -preset medium -c:a aac -b:a 128k -movflags +faststart salinan-kecil.mp4
```

CRF mengatur kompromi kualitas pada encoder ini. Angka lebih tinggi biasanya mengurangi data dengan mengorbankan detail. `23` adalah percobaan awal, bukan janji kualitas atau ukuran. Preset memengaruhi kecepatan dan efisiensi kompresi; audio juga dikodekan ulang.

## Periksa hasilnya

- Tonton adegan gelap dan bergerak.
- Dengarkan suara serta sinkronisasi bibir.
- Periksa durasi dan pemutaran di tujuan.
- Simpan sumber asli dan cadangan yang teruji.

## Kemampuan VidFetch

VidFetch menampilkan format sumber dan dapat mengonversi audio ke MP3. Ini bukan kompresor berbasis unggahan dengan kendali CRF khusus. Memilih versi sumber lebih kecil mungkin cukup. [Perhitungan bitrate](/blog/bitrate-vs-resolution) membantu perencanaan, tanpa menjamin ukuran pasti.

## Pertanyaan umum

### Bolehkah hanya menyimpan versi kecil?

Untuk rekaman Anda yang mungkin dipakai lagi, simpan sumber asli. Salinan distribusi dibuat untuk kebutuhan tertentu, bukan setiap penyuntingan di masa depan.
