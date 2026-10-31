# PRD: Auto-Reply Kades — Desa Komen (Konoha)

**Versi:** 1.0 · **Tanggal:** 2026-10-31 · **Status:** Draft — menunggu approval

---

## 1. Tujuan

- Pak Kades (admin) dapat mengaktifkan **auto-reply berbasis agent** yang otomatis membuat **draft balasan** untuk tiap komentar baru.
- Draft wajib **di-approve manual** oleh Pak Kades sebelum terkirim ke Instagram — tidak ada kirim otomatis tanpa persetujuan.
- Agent memahami konteks proyek: desa interaktif yang dibangun dari komentar warga Instagram @nekoding.xyz; warga mengantre di depan rumah Pak Kades dan pulang setelah dibalas.

## 2. Prinsip Desain (dari owner)

1. **Human-in-the-loop wajib.** Agent hanya menyusun draf; keputusan ya/tidak tetap di tangan Pak Kades.
2. **Satu jalur kirim.** Balasan (manual maupun hasil draft) tetap lewat endpoint `/api/desa/comments/{id}/reply` yang sudah ada — tidak ada jalur kirim kedua.
3. **Amannya webhook tidak perlu.** Pipeline komentar tetap polling 1 menit via `cronAdd` PocketBase.
4. **Kredensial hanya di server.** API key LLM hidup di `.env` container (bukan `VITE_*`), disalin ke NekoVault.

## 3. Stack Tambahan

| Komponen | Pilihan | Catatan |
|---|---|---|
| LLM | Nekopro gateway `https://llm.nekotekno.xyz/v1/chat/completions` | model `nekopro`, API key dari NekoVault |
| Panggil LLM | `$http.send` dari `pb_hooks` | tanpa dependensi baru; sama seperti pola Repliz |
| Storage draft | field baru di koleksi `comments` | tanpa koleksi baru |
| Toggle | field baru di `sync_state` | on/off per desa |
| UI | vanilla JS di `src/main.js` + `index.html` | mengikuti pola panel admin yang ada |

## 4. Arsitektur

```
IG → Repliz → (polling 1m, cron PB) → PocketBase comments (status: pending)
                                        │
                    [jika auto-reply ON] ├─→ pb_hooks panggil Nekopro LLM
                                        │     persona Pak Kades + lore desa
                                        │     → draftReply, draftStatus: drafted
                                        │
Panel Pak Kades ← realtime ←────────────┤
  - lihat draft di kartu komentar        │ approve → POST reply (jalur lama)
  - edit draft sebelum approve           │         → status: answered, warga pulang
  - Approve / Tolak / Re-roll            │ tolak   → draftStatus: rejected (komentar tetap pending, admin bisa balas manual)
                                          └─→ re-roll → panggil LLM lagi, draft baru
```

## 5. Modul

- [modul_agent_autoreply.md](modul_agent_autoreply.md) — backend: hook, LLM call, state machine draft
- [modul_ui_autoreply.md](modul_ui_autoreply.md) — frontend: toggle, kartu draft, tombol approve/tolak/re-roll
- [modul_ops_deploy.md](modul_ops_deploy.md) — env, build, deploy, rollback

## 6. Milestone

| Fase | Isi | Estimasi |
|---|---|---|
| 1 | Backend: field schema + hook draft otomatis + route approve/tolak/re-roll | 1 sesi |
| 2 | Frontend: toggle + UI draft + integrasi realtime | 1 sesi |
| 3 | Deploy cloud243 + smoke test + simpan kredensial NekoVault | 0.5 sesi |

## 7. Out of Scope

- Webhook Repliz (eksplisit tidak perlu — pemilik puas dengan polling 1 menit)
- Kirim otomatis tanpa approval
- Multi-akun IG / multi-desa
- Import komentar historis (butuh Content API Gold+)
- Riwayat percakapan multi-turn dengan warga (v1: konteks = komentar tunggal + lore)
- Filter spam/keyword auto-ignore

## 8. Glossary

- **Draft** — balasan yang disusun agent, menunggu keputusan Pak Kades.
- **Approve** — Pak Kades menyetujui draft; teks draft dikirim via jalur reply yang ada.
- **Re-roll** — buang draft, minta LLM menyusun ulang.
- **Lore** — konteks tetap yang dipahami agent: desa dari komentar, antrean, warga pulang setelah dibalas, persona Pak Kades.
- **Nekopro** — LLM gateway milik pemilik di `llm.nekotekno.xyz`.
