# Desa Komen — deployment handoff

## Status

- Frontend sudah migrasi dari `localStorage`/simulasi ke PocketBase melalui `src/api.js`.
- Backend PocketBase hooks dan migrasi sudah tersedia:
  - `pb_hooks/desa.js`
  - `pb_hooks/main.pb.js`
  - `pb_migrations/1793376000_desa.js`
- Launcher lokal ada di `tools/backend.mjs` dan memasang PocketBase v0.40.6 dengan checksum resmi.
- Local PocketBase dan Vite sudah dihentikan.
- Tidak ada password atau Repliz key yang disimpan di repository.

## Remote PocketBase

- URL: `https://konoha.openpos.web.id`
- Superuser login sudah diuji, tetapi kredensial tidak ditulis di note ini.
- Server saat ini hanya memiliki koleksi bawaan dan `users`; koleksi `comments`, `admins`, `sync_state`, serta route `/api/desa/*` belum ada.
- PocketBase tidak dapat menerima `pb_hooks` melalui REST API. Agent berikutnya perlu akses SSH/repository/deployment server untuk menyalin hooks dan migrasi, lalu restart PocketBase.

## Konfigurasi backend

Set di environment server, bukan `VITE_*`:

```text
DESA_ADMIN_EMAIL=...
DESA_ADMIN_PASSWORD=...
REPLIZ_ACCESS_KEY=...
REPLIZ_SECRET_KEY=...
REPLIZ_ACCOUNT_ID=6a88116362caae1e04010787
REPLIZ_API_URL=https://api.repliz.com
```

Akun Repliz yang dipilih adalah **@nekoding.xyz**. Semua Post/Reel akun itu menjadi sumber komentar. Sinkronisasi memakai polling satu menit dan tombol admin **Sinkronkan sekarang**; webhook belum dipasang.

## Setelah deploy

1. Jalankan PocketBase dengan `pb_hooks`, `pb_migrations`, dan data directory server.
2. Pastikan migrasi membuat koleksi `admins`, `comments`, dan `sync_state`.
3. Build frontend dengan `VITE_POCKETBASE_URL=https://konoha.openpos.web.id` jika frontend di-host pada origin berbeda. Jika same-origin, kosongkan variabel itu.
4. Login sebagai admin, tekan **Sinkronkan sekarang**, lalu cek komentar baru dari akun Instagram lain.
5. Balasan hanya boleh diuji setelah komentar spesifik terlihat; endpoint mengirim balasan asli ke Instagram.

## Validasi yang sudah lulus

```sh
npm test
npm run test:backend
npm run build
```

Backend test memakai Repliz stub lokal dan tidak mengirim balasan ke akun asli. Skenario yang diuji mencakup pagination, deduplikasi, FIFO, akses publik read-only, balasan sukses/ditolak, dan kegagalan sinkronisasi tanpa kehilangan antrean.

Jangan melakukan retry otomatis untuk status balasan `uncertain`; sinkronkan dan periksa komentar asli terlebih dahulu agar tidak terjadi balasan ganda.
