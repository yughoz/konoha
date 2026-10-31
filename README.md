# Desa Komen

Desa interaktif dari komentar Instagram: warga mengantre di depan rumah Pak Kades, lalu pulang setelah admin membalas. Frontend Vite, data dan login admin di PocketBase, komentar serta balasan asli melalui Repliz. Warga tidak perlu login.

## Dunia 3D

Scene desa sekarang memakai Three.js dengan kamera isometric dan mesh low-poly procedural untuk rumah Pak Kades, jalan, tanah, pohon, semak, dan warga. Komentar tampil sebagai bubble 3D di atas kepala warga. Antrean mengikuti urutan PocketBase; setelah balasan berhasil, warga berjalan pulang selama 5,4 detik. Panel admin tetap HTML agar login, keyboard, dan balasan tetap mudah digunakan. Browser tanpa WebGL memakai scene 2D sebagai fallback.

## Jalankan lokal

Gunakan Node.js 22.16+ dan `unzip` (sudah tersedia di macOS).

```sh
npm install
npm run backend
```

Launcher mengunduh **PocketBase 0.40.6** untuk macOS/Linux x64 atau arm64, memverifikasi SHA-256 rilis resmi, lalu menjalankan backend di `http://127.0.0.1:8090`. Migrasi berjalan otomatis. `.env` dibuat dengan email `admin@desa.local` dan password acak; lihat `DESA_ADMIN_PASSWORD` di file tersebut. Admin awal hanya dibuat jika koleksi admin masih kosong; mengubah `.env` tidak mengganti password akun yang sudah ada.

Buka terminal kedua:

```sh
npm run dev
```

Buka alamat Vite, lalu klik **Pak Kades** dan login memakai kredensial di `.env`. Antrean dan riwayat disimpan di `pb_data/` dan diperbarui antar-browser melalui PocketBase. Simpan folder ini untuk mempertahankan data; jangan unggah `.env`, `pb_data/`, atau `.local/` ke Git.

## Hubungkan Repliz

Isi `REPLIZ_ACCESS_KEY` dan `REPLIZ_SECRET_KEY` di `.env`, lalu restart `npm run backend`. Contoh variabel tersedia di [.env.example](.env.example). Gunakan key baru jika key sebelumnya sudah dibagikan melalui chat; rotasi Secret Key juga membatalkan sesi Repliz yang memakai key lama. Kredensial hanya dibaca backend dan tidak boleh ditempatkan pada variabel `VITE_*`.

`REPLIZ_ACCOUNT_ID` secara default menunjuk akun **@nekoding.xyz** (`6a88116362caae1e04010787`). Semua Post/Reel akun itu menjadi sumber antrean. Backend membaca inbox Repliz setiap satu menit; admin juga dapat menekan **Sinkronkan sekarang**. Komentar dideduplikasi agar satu komentar tidak membuat warga ganda. Tidak ada webhook pada versi ini.

Repliz memerlukan paket **Standard+** untuk inbox dan balasan. Inbox awal akun ini teramati kosong: komentar lama di Instagram belum tentu sudah masuk inbox Repliz. Coba komentar baru pada Post/Reel akun yang tersambung, lalu sinkronkan. Pengambilan komentar historis langsung dari platform memerlukan Content API **Gold+** dan belum diimplementasikan.

Balas warga terdepan melalui panel Pak Kades. Balasan dikirim ke komentar asli Instagram; warga baru pulang setelah Repliz mengonfirmasi sukses. Jika hasil pengiriman belum pasti akibat timeout, periksa komentar asli sebelum mencoba ulang agar tidak mengirim balasan ganda. Link **Lihat di Instagram** membuka Post/Reel sumber jika URL tersedia.

Saat development, Vite meneruskan `/api` ke PocketBase lokal. `npm run build` menghasilkan `dist/` yang juga dilayani PocketBase di `http://127.0.0.1:8090`. Untuk deployment terpisah, arahkan `/api` ke backend pada domain yang sama, atau atur `VITE_POCKETBASE_URL` ke origin PocketBase sebelum build. `REPLIZ_API_URL` default `https://api.repliz.com`; override hanya menerima origin HTTPS atau HTTP localhost untuk pengujian stub.

## Asset custom

Delapan ilustrasi custom sudah dibuat lewat **Bumi Digital**, model `google/nano-banana-2.1`: background, rumah pak kades, pohon, semak, dan empat warga. Total biaya yang dilaporkan API: **3,6 kredit**. Asset final ada di `public/assets/`, beserta manifest sumber, ID generasi, prompt, dan validasi. Preview seluruh asset ada di `output/imagegen/contact-sheet.png`; brief dan petunjuk regenerasi ada di [assets-prompts.md](assets-prompts.md).

`tools/generate-images.py` memeriksa katalog akun sebelum membuat job, menyimpan hasil asli dan metadata, serta menyediakan `--resume ID` untuk melanjutkan tanpa POST baru. Kredensial dibaca ke environment proses sesuai skill `create-image-bd` dan tidak disimpan dalam project. Normalisasi menghasilkan PNG transparan dengan baseline kaki konsisten. Keempat warga memakai rig cutout CSS: kaki kiri dan kanan dari PNG asli dipisah dan digerakkan bergantian saat datang, maju antrean, serta pergi. Saat diam, PNG utuh ditampilkan tanpa efek goyang. Percobaan atlas sprite-gen sebelumnya tetap disimpan di `output/spritegen/` sebagai eksperimen yang gagal QA dan tidak dipakai runtime.

## Pemeriksaan

```sh
npm test
npm run test:backend
npm run build
```

Tes backend memakai Repliz stub, tanpa mengirim balasan ke Instagram. Pemeriksaan launcher saja: `node tools/backend.mjs --check`. Unduh PocketBase tanpa menjalankannya: `node tools/backend.mjs --install-only`. Untuk pemeriksaan visual, coba antrean, balasan, riwayat, refresh, dua browser, keyboard, viewport ponsel, serta mode pengurangan animasi.
