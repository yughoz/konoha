# Modul: Operasional & Deploy Auto-Reply

> Konfigurasi aman, migrasi, deploy, dan rollback fitur agent.

## 1. Environment Server

Tambahkan ke `/home/ubuntu/apps/konoha/.env` (mode `0600`):

```text
NEKOPRO_BASE_URL=https://llm.nekotekno.xyz/v1
NEKOPRO_MODEL=nekopro
NEKOPRO_API_KEY=<dari NekoVault, tidak masuk repo/chat>
```

Key disimpan permanen di NekoVault dengan metadata provider, base URL, model, dan nama env. Tidak pernah di-`VITE_*`, PocketBase record, browser response, atau log.

## 2. Deploy

1. Jalankan test lokal: `npm test`, `npm run test:backend`, `npm run build`.
2. Backup volume `konoha_pb_data` sebelum migrasi.
3. Build image PocketBase baru dengan hooks, migration, dan dist.
4. Restart container dengan env baru; volume tetap sama.
5. Cek `/api/health`, `/api/desa/status`, login admin, toggle off/on, dan satu draft.
6. Uji approve hanya terhadap komentar test yang spesifik; ini mengirim balasan asli ke Instagram.
7. Bila gagal, rollback image tanpa menghapus volume; migrasi bersifat additive.

## 3. Monitoring

- Status agent: enabled/disabled, last generation time, error count tanpa secret.
- Error provider disimpan ter-redact, maksimal 500 karakter.
- Jangan retry reply `uncertain` otomatis.
- Bila LLM down, manual reply tetap harus berfungsi.

## 4. Definition of Done

- [ ] Key tersimpan di NekoVault dan hanya dimirror ke server `.env`.
- [ ] Backup volume terverifikasi sebelum migrasi.
- [ ] Build/test/deploy smoke test lulus.
- [ ] Rollback image teruji tanpa kehilangan comments.
- [ ] Dokumentasi deployment diperbarui dengan status auto-reply.
