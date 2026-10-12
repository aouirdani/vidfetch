---
{
  "id": "bitrate-vs-resolution",
  "translationOf": "bitrate-vs-resolution",
  "locale": "id",
  "slug": "bitrate-dan-resolusi",
  "title": "Bitrate dan resolusi video: apa bedanya?",
  "description": "Pahami piksel, bit per detik, dan perkiraan ukuran berkas agar dapat membandingkan kualitas serta kebutuhan penyimpanan.",
  "category": "Ukuran dan kualitas",
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
Resolusi menunjukkan jumlah piksel bingkai. Bitrate menunjukkan banyaknya data per detik. Keduanya tidak saling menggantikan: resolusi tinggi dengan data terlalu sedikit dapat terlihat lebih buruk daripada resolusi rendah yang dikodekan baik. Durasi juga diperlukan untuk menghitung ukuran seluruh berkas.

## Piksel menjelaskan bingkai

1920 × 1080 memuat lebih banyak piksel daripada 1280 × 720. Detail tambahan hanya terlihat jika sumber serta pengodean mempertahankannya. Laju bingkai menjelaskan gerakan. Slide diam dan kamera bergerak cepat tidak menantang encoder dengan cara sama.

## Bitrate menjelaskan anggaran data

Satuannya biasanya kilobit atau megabit per detik. Delapan bit menjadi satu byte. Bitrate variabel memberi data lebih banyak pada bagian rumit. Angka video dapat belum memasukkan audio, sedangkan kontainer menambahkan metadata. Karena itu, perkiraan sebelum persiapan dapat berbeda dari ukuran akhir.

## Hitung perkiraan praktis

Enam puluh detik pada rata-rata 3 megabit per detik menghasilkan sekitar `3000000 × 60 ÷ 8 = 22500000` byte data video: 22,5 MB desimal atau sekitar 21,5 MiB. Audio dan kontainer menambah total.

Menggandakan durasi pada bitrate rata-rata sama kira-kira menggandakan ukuran. Menggandakan resolusi tidak mengikuti aturan tersebut. Baca [720p, 1080p, dan 4K](/blog/720p-1080p-4k) untuk dimensi pikselnya.

## Bandingkan secara adil

Gunakan adegan, ukuran tampilan, dan volume yang sama. Perhatikan gerakan, tekstur, teks kecil, serta gradasi gelap. Derau dan fokus sumber ikut menentukan hasil. Codec berbeda pada bitrate sama tidak menjamin tampilan identik. Data lebih banyak tidak menciptakan detail yang hilang sejak perekaman.

## Pilih salinan sesuai tujuan

Referensi, presentasi, dan sumber penyuntingan mempunyai kebutuhan berbeda. Untuk distribusi, uji versi lebih kecil; untuk arsip, pertahankan sumber. VidFetch menampilkan format sumber, bukan pengodean video berbitrate khusus. [Pengurangan ukuran](/blog/reduce-video-size) membahas pekerjaan lokal.

## Pertanyaan umum

### Apakah MP3 320 kbps memperbaiki rekaman buruk?

Tidak. Label bitrate tidak memulihkan informasi yang sudah hilang. [MP3 dan M4A](/blog/mp3-vs-m4a) menjelaskan perbedaan anggaran data dan kualitas sumber audio.
