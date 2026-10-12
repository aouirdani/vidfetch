---
{
  "id": "backup-your-videos",
  "translationOf": "backup-your-videos",
  "locale": "id",
  "slug": "mencadangkan-video-sendiri",
  "title": "Praktik yang baik untuk mencadangkan video Anda",
  "description": "Simpan sumber asli, buat salinan independen, dan uji pemulihan dengan checksum agar cadangan benar-benar dapat digunakan.",
  "category": "Cadangan",
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
Cadangan yang berguna mempertahankan berkas asli dan memberi salinan ketika penyimpanan utama gagal. Mulailah dengan video sendiri atau materi yang boleh Anda simpan. Buat salinan independen dan uji pemulihan serta pemutarannya. Folder tersinkron saja tidak membuktikan bahwa arsip dapat dipulihkan.

## Simpan rekaman asli

Salinan kecil untuk dibagikan dapat menghilangkan detail atau metadata. Pisahkan sumber dan hasil suntingan dengan nama jelas, misalnya `2026-10-perjalanan-asli` serta `2026-10-perjalanan-berbagi`. Tambahkan catatan peristiwa, izin, dan perubahan. Konversi lossy berulang bukan strategi arsip.

## Buat salinan independen

Dua salinan pada drive yang sama berbagi risiko kegagalan. Pertimbangkan media lain dan, jika sesuai, lokasi berbeda. Pilih sistem yang dapat Anda rawat. Sinkronisasi dapat menyebarkan penghapusan tidak sengaja; periksa riwayat versi atau mekanisme pemulihan lalu ujilah.

## Verifikasi byte

Checksum membantu mendeteksi perubahan. Pada Linux:

```sh
sha256sum video-saya.mp4 > video-saya.mp4.sha256
sha256sum -c video-saya.mp4.sha256
```

Jalankan dari direktori yang benar atau sesuaikan path catatan. macOS umumnya menyediakan `shasum -a 256`. Kecocokan membuktikan kesamaan dengan referensi, bukan kepemilikan, keaslian, atau bahwa sumber awal tidak rusak.

## Uji pemulihan sungguhan

Kembalikan sampel ke folder terpisah. Periksa checksum, awal, akhir, durasi, dan audio. Uji beberapa jenis berkas bila koleksi beragam. Ulangi setelah mengganti drive, perangkat lunak, atau struktur folder. Simpan petunjuk pemulihan bersama arsip.

## Pisahkan unduhan dan cadangan

Unduhan berizin dapat mengambil kembali versi terkompresi dari publikasi Anda, berbeda dari master. Simpan sumber asli jika ada. Tiket VidFetch sementara bukan tempat arsip permanen. Pastikan transfer selesai sebelum menambahkannya ke cadangan. [Kontainer](/blog/mp4-vs-webm) dan [salinan kecil](/blog/reduce-video-size) mempunyai tujuan berbeda.

## Pertanyaan umum

### Haruskah semua berkas dikonversi ke satu format?

Pertahankan sumber terlebih dahulu. Salinan kompatibel membantu pemutaran, tetapi mengganti seluruh sumber dengan konversi lossy membuang informasi yang mungkin diperlukan kelak.
