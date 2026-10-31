# Modul: UI Auto-Reply

> Panel Pak Kades untuk mengaktifkan agent dan memutuskan draft satu per satu.

## 1. Tujuan

Memberi kontrol eksplisit kepada Pak Kades: toggle agent, melihat draft, mengedit, menyetujui, menolak, dan meminta draft ulang.

## 2. UI Spec

```text
┌─ Pak Kades ─────────────────────────────────────┐
│ Agent balasan: [ OFF ]  Nekopro                 │
│ Draft otomatis dibuat untuk warga baru          │
├─ Warga #1 · yughozz                             │
│ Komentar: "Test"                                │
│ Draft Pak Kades:                                │
│ [ Wah, terima kasih sudah ikut membangun desa! ]│
│ [Edit draft] [Setujui & balas] [Tolak] [↻ Ulang]│
└─────────────────────────────────────────────────┘
```

- Toggle hanya tampil/aktif untuk admin.
- Draft `generating` menampilkan loading kecil dan tombol aksi disabled.
- Draft `error` menampilkan pesan aman + tombol `Buat ulang`.
- Approve membuka konfirmasi singkat: teks yang akan dikirim + tombol final.
- Setelah approve, gunakan animasi warga pulang yang sudah ada.
- Semua browser menerima perubahan via subscription `comments`/`sync_state`; tidak perlu reload.
- Jangan tampilkan API key, prompt mentah, atau error provider mentah.

## 3. Routes & API Client

Tambahkan fungsi di `src/api.js`:

- `setAutoReply(enabled)` → POST `/api/desa/auto-reply`
- `generateDraft(id)` → POST `/api/desa/comments/{id}/draft`
- `decideDraft(id, decision, text)` → POST `/api/desa/comments/{id}/draft/decision`

`src/main.js` memakai fungsi ini; setelah response, panggil `refresh()` seperti alur reply sekarang. Realtime subscription yang sudah ada menangani browser lain.

## 4. Business Rules UI

1. UI tidak pernah menganggap approve berhasil sebelum response backend sukses.
2. Double-click approve/re-roll dicegah dengan busy state per komentar.
3. Setelah approve, composer manual tidak boleh mengirim request kedua.
4. Draft yang diedit dikirim sebagai teks approval; draft asli tetap tercatat lewat version/audit metadata.
5. Jika admin mematikan toggle, draft yang sudah ada tetap bisa diputuskan; hanya pembuatan draft baru yang berhenti.

## 5. Definition of Done

- [ ] Toggle terlihat dan tersimpan antar browser.
- [ ] Auto-draft tampil tanpa reload.
- [ ] Approve, reject, edit, re-roll terverifikasi dari panel.
- [ ] Browser kedua melihat draft/keputusan yang sama.
- [ ] Error/loading/disabled state accessible via keyboard dan label.
- [ ] Tidak ada API key atau prompt internal di network response browser.
