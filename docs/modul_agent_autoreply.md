# Modul: Agent Auto-Reply

> Menyusun draft balasan kontekstual dari Nekopro tanpa pernah mengirimkannya otomatis.

## 1. Tujuan

Saat komentar baru masuk dan toggle aktif, backend meminta Nekopro membuat draft balasan sebagai Pak Kades. Draft disimpan pada record komentar dan dikirim ke UI lewat realtime PocketBase.

## 2. Field Spesifikasi

**`comments` tambahan:**

| Field | Type | Required | Validasi/Notes |
|---|---|---:|---|
| `draftReply` | text | no | Maks. 500 karakter; kosong sebelum dibuat |
| `draftStatus` | select | yes | `none`, `generating`, `drafted`, `rejected`, `error` |
| `draftError` | text | no | Maks. 500; error aman tanpa API key |
| `draftedAt` | date | no | Waktu draft terakhir |
| `draftVersion` | number | yes | Integer; mulai 0, naik tiap generate |

**`sync_state` tambahan:**

| Field | Type | Required | Validasi/Notes |
|---|---|---:|---|
| `autoReplyEnabled` | bool | yes | Default false; hanya admin dapat mengubah |
| `agentModel` | text | yes | Default `nekopro`; tidak diedit dari publik |

## 3. State Machine

```
none → generating → drafted → approved → answered
                    │              └→ rejected → pending (bisa manual)
                    └→ error → (retry)
```

`approved` tidak perlu disimpan sebagai status terpisah bila endpoint reply langsung mengubah status `sending`; approval adalah aksi audit/UI, bukan status komentar baru.

## 4. Routes & API

| Method | Path | Auth | Deskripsi |
|---|---|---|---|
| GET | `/api/desa/status` | publik | Tambahkan `autoReplyEnabled` dan model; jangan expose key |
| POST | `/api/desa/auto-reply` | admin | Body `{enabled: boolean}`; ubah toggle |
| POST | `/api/desa/comments/{id}/draft` | admin | Generate/re-roll draft secara manual |
| POST | `/api/desa/comments/{id}/draft/decision` | admin | Body `{decision: "approve"|"reject", text?: string}` |

Approve wajib memanggil fungsi reply yang sama dengan tombol balas manual. `text` boleh mengedit draft, divalidasi 1–500 karakter.

## 5. Kontrak LLM

Request OpenAI-compatible:

```json
{
  "model": "nekopro",
  "temperature": 0.7,
  "max_tokens": 180,
  "messages": [
    {"role":"system","content":"[LORE + aturan Pak Kades]"},
    {"role":"user","content":"Komentar warga: ..."}
  ]
}
```

Aturan system prompt:

- Bahasa Indonesia santai, hangat, pendek (maks. 500 karakter).
- Pahami bahwa Desa Komen sedang dibangun dari komentar warga.
- Jangan mengaku sebagai AI, jangan menjanjikan fitur yang belum ada.
- Jangan menghina, spam, membocorkan rahasia, atau mengirim URL kredensial.
- Balasan adalah draft, bukan keputusan; jangan menulis metadata/status di output.
- Output harus teks balasan saja.

Backend mengambil response OpenAI-compatible, trim, validasi panjang, lalu simpan. API key tidak pernah masuk record/log/response.

## 6. Business Rules

1. Default `autoReplyEnabled=false`; deploy tidak boleh tiba-tiba mengaktifkan agent.
2. Auto-draft hanya untuk komentar `pending`; komentar `sending`, `uncertain`, `answered`, `ignored` dilewati.
3. Satu komentar hanya boleh punya satu job generate aktif; cegah race dengan status `generating` + lease.
4. Gagal LLM tidak boleh mengubah antrean atau menghapus komentar; set `draftStatus=error` dan admin tetap bisa balas manual.
5. Approve hanya boleh dilakukan admin dan hanya saat draft tersedia.
6. Tolak tidak menghapus teks draft; set `rejected` agar bisa diaudit dan regenerate.
7. Re-roll menaikkan `draftVersion`, mengganti draft lama, dan tetap menunggu approve.
8. Reply `uncertain` tidak boleh otomatis diulang.
9. Log hanya metadata aman: comment ID, draft version, latency, status, error ter-redact.

## 7. Definition of Done

- [ ] Migrasi PocketBase menambah field draft dan toggle.
- [ ] Toggle default mati dan hanya admin yang bisa mengubah.
- [ ] Komentar baru saat toggle aktif mendapat draft otomatis.
- [ ] Approve mengirim teks yang terlihat di UI melalui endpoint reply lama.
- [ ] Reject dan re-roll bekerja tanpa mengubah status antrean.
- [ ] Error LLM tidak menghilangkan komentar.
- [ ] Unit/self-check menguji parser response, batas 500 karakter, dan state transition.
- [ ] API key tidak muncul di browser, DB, log, atau response.
