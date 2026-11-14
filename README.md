# Public Pledge

Komitmen publik yang dipertaruhkan di GenLayer. Seseorang menulis janji dalam bahasa biasa, mengunci stake GEN, dan menunjuk satu sumber bukti publik. Setelah tenggat, validator GenLayer mengambil bukti itu dan menyepakati apakah janji ditepati.

- Janji ditepati: stake kembali ke pemilik, catatan reputasinya bertambah.
- Janji dilanggar: stake bisa diklaim oleh beneficiary yang dipilih pemilik sejak awal.
- Bukti tidak bisa dibaca atau ambigu: pledge tetap aktif, dan setelah masa tunggu pemilik bisa menarik stake kembali.

Status saat ini: **kontrak + test direct-mode**. Frontend Next.js menyusul.

## Alur

1. `create_pledge(promise, evidence_url, criteria, beneficiary, deadline)` dikirim bersama GEN (payable). Mengembalikan id pledge.
2. Setelah `deadline`, siapa pun memanggil `judge(pledge_id)`.
   - `kept`: saldo `claimable` pemilik bertambah, `kept` +1.
   - `broken`: saldo `claimable` beneficiary bertambah, `broken` +1 untuk pemilik.
   - `inconclusive`: tidak ada perubahan status, hanya `note` dan `checks` yang diperbarui. Boleh dinilai ulang.
3. `refund_expired(pledge_id)`: 7 hari setelah tenggat, kalau masih `active`, stake kembali ke pemilik tanpa verdict dan tanpa mengubah reputasi.
4. `withdraw()`: penerima menarik saldo `claimable`-nya sebagai GEN.

Status pledge: `active` -> `kept` | `broken` | `refunded`.

Pembayaran memakai pola pull (`claimable` + `withdraw`). Putusan tidak bisa tersangkut kegagalan transfer, dan logika penyelesaian bisa dites tanpa jaringan.

## Cara validator mencapai konsensus

`judge` memakai `gl.vm.run_nondet_unsafe` dengan leader/validator kustom (lihat `_judge_with_validators` di `contracts/public_pledge.py`):

- Leader mengambil `evidence_url`, memotong isinya (12.000 karakter), lalu meminta LLM memberi `{"verdict", "reason"}`.
- Validator mengulang pekerjaan yang sama secara independen. Mereka **hanya membandingkan `verdict`**. Teks `reason` boleh berbeda.
- Jika leader gagal karena sumber bukti (`[EXTERNAL]`, misalnya HTTP 404), validator setuju hanya bila ia menemui error yang sama persis. Output LLM yang rusak (`[LLM_ERROR]`) sengaja dibuat tidak disetujui, supaya leader diganti.
- Semua penulisan storage terjadi setelah konsensus, di luar blok non-deterministik.

## Model kepercayaan dan batasannya

Beberapa hal ini disengaja dan perlu dipahami sebelum dipakai untuk nilai besar:

- **Pemilik mengontrol teks janji, kriteria, dan URL bukti.** Pemilik yang berniat curang bisa menunjuk halaman yang dikendalikannya sendiri atau menyisipkan instruksi di kriteria. Validator menjalankan prompt yang sama, jadi mereka ikut terpengaruh. Prompt sudah diperkeras (bukti ditandai tidak tepercaya, jawaban dibatasi tiga nilai, ragu berarti `inconclusive`), tetapi itu bukan jaminan. Nilai produknya ada di reputasi publik dan komitmen yang bisa diaudit. Sumber bukti sebaiknya pihak ketiga (GitHub, Strava, halaman rilis resmi).
- **Beneficiary tidak ikut menyetujui.** Anggap ia penerima yang dipilih pemilik (amal, anti-charity, teman), bukan pihak yang dirugikan.
- **Siapa pun bisa memanggil `judge` tepat setelah tenggat.** Kalau bukti baru muncul sesudahnya, pledge bisa saja langsung dinilai `broken`. Tulis kriteria yang bergantung pada data yang sudah final pada tenggat.
- **Halaman bukti harus stabil.** Leader dan validator mengambil halaman secara terpisah. Bukti yang berubah tiap detik (jumlah bintang, status online) membuat validator berselisih. Pilih sumber dengan fakta yang tetap.
- **Bukan keputusan hukum.** Ini mekanisme komitmen berbasis bukti, bukan pengadilan.

## Setup dan perintah

Butuh Python 3.12+.

```bash
pip install -r requirements.txt

genvm-lint check contracts/public_pledge.py   # lint kontrak
pytest tests/direct/ -v                       # test cepat di memori, tanpa jaringan
```

Mencoba di Studio: buka studio.genlayer.com, muat `contracts/public_pledge.py`, deploy tanpa argumen konstruktor, dan isi saldo akun dari faucet bawaan.

## Yang perlu diverifikasi di mesin Anda

Kode dan test ditulis tanpa bisa menjalankan lint maupun pytest. Titik yang paling mungkin perlu penyesuaian:

- **`tests/direct/test_validator.py`** bergantung pada `direct_vm.run_validator()` yang menangkap closure validator dari `run_nondet_unsafe`. Dokumentasi runner hanya menyebut `run_nondet`. Kalau versi `genlayer-test` Anda belum menangkapnya, jalankan test ini lewat GLSim atau Studio.
- **`withdraw` yang berhasil** mengirim pesan eksternal (`emit_transfer`). Direct mode tidak diketahui mendukungnya, jadi hanya guard "nothing to withdraw" yang dites di sana. Uji transfer sungguhan di Studio atau GLSim.
- **Format error.** Helper `expect_error` memeriksa `.message` dan `str(e)` agar tidak bergantung pada cara SDK memformat `UserError`.

## Struktur

```
contracts/public_pledge.py          kontrak
tests/direct/                       test direct-mode (web dan LLM di-mock)
  conftest.py                       helper, konstanta waktu, fixture
gltest.config.yaml                  konfigurasi jaringan gltest
requirements.txt                    dependency Python (versi mengikuti boilerplate resmi)
```

## Berikutnya

1. Jalankan lint dan test di mesin Anda, lalu perbaiki apa pun yang gagal.
2. Deploy ke Studio dan uji satu pledge dari awal sampai `withdraw`.
3. Tambahkan test integrasi (`gltest`) untuk alur penuh di GLSim.
4. Bangun frontend Next.js dengan GenLayerJS. Siapkan estimasi fee sebelum menulis (`estimateTransactionFeesForWrite`) untuk `create_pledge` (payable, `value` + fee), `judge`, `refund_expired`, dan `withdraw`.
