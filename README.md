# Public Pledge

Komitmen publik yang dipertaruhkan di GenLayer. Seseorang menulis janji dalam bahasa biasa, mengunci stake GEN, dan menunjuk satu sumber bukti publik. Setelah tenggat, validator GenLayer mengambil bukti itu dan menyepakati apakah janji ditepati.

- Janji ditepati: stake kembali ke pemilik, catatan reputasinya bertambah.
- Janji dilanggar: stake bisa diklaim oleh beneficiary yang dipilih pemilik sejak awal.
- Bukti tidak bisa dibaca atau ambigu: pledge tetap aktif, dan setelah masa tunggu pemilik bisa menarik stake kembali.

Status saat ini: **kontrak + test direct-mode + frontend Next.js**. CI hijau untuk lint kontrak, 39 test direct-mode, dan build serta typecheck frontend. Belum teruji: frontend di browser dengan wallet, dan alur penuh di Studio (konsensus validator sungguhan, `withdraw`).

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

## Frontend

Next.js 16 + Tailwind 4 + `genlayer-js` 1.1.8 (dipin), di folder `frontend/`.

```bash
cd frontend
cp .env.example .env.local     # isi NEXT_PUBLIC_CONTRACT_ADDRESS setelah deploy kontrak
npm install
npm run dev
```

Halaman: landing (`/`), cara kerja (`/how-it-works`), daftar pledge (`/pledges`), detail dan hasil konsensus (`/pledges/[id]`), buat pledge (`/create`), akun dan withdraw (`/account`).

Catatan desain:

- **Wallet tanpa rebutan pop-up.** Wallet ditemukan lewat EIP-6963 dan pengguna memilih satu. Semua permintaan hanya dikirim ke provider wallet itu, bukan ke `window.ethereum`. Hanya satu permintaan wallet yang boleh terbuka pada satu waktu. Pembacaan data tidak pernah membuka wallet.
- **Data konsensus AI.** Verdict, alasan, dan jumlah pengecekan dibaca dari view `get_pledge` / `get_pledges`, lalu ditampilkan di halaman detail dan setelah `judge`.
- **Status transaksi.** Alur "konfirmasi wallet" lalu "validator mencapai konsensus", dengan notifikasi sukses dan error. `ACCEPTED` tidak dianggap sukses kalau eksekusi kontrak berakhir error.
- **Jaringan.** Studionet dan Localnet. Bradbury butuh SDK v2 dan sengaja tidak ditawarkan.
- **Fee.** SDK 1.1.8 tidak punya estimasi fee (itu API v2), jadi frontend belum mengirim `fees`. Itu tugas migrasi ke v2 untuk jaringan yang memungut fee.

## Yang belum teruji

CI sudah menjalankan lint, test direct-mode (web dan LLM di-mock), serta build dan typecheck frontend. Test on-chain ada di `tests/integration/` dan dijalankan lewat workflow terpisah (lihat bagian berikutnya).

- **Konsensus validator dan LLM sungguhan.** Direct mode memakai data tiruan. Perilaku validator nyata hanya terlihat dari test on-chain.
- **Frontend di browser.** Alur wallet, switch jaringan, dan dialog transaksi belum pernah dicoba dengan wallet sungguhan.

## Test on-chain (Studionet)

`tests/integration/test_public_pledge.py` mendeploy kontrak ke Studionet lalu menguji semua method dengan validator, pengambilan web, dan LLM sungguhan. Isinya:

- **Deploy dan view:** `get_config`, `get_pledges`, `get_pledge`, `get_pledge_count`.
- **Alur utama:** `create_pledge` menyimpan state dengan benar; lalu tenggat lewat, `judge`, dapat verdict `kept`, saldo `claimable` bertambah, dan `withdraw` benar-benar mentransfer GEN keluar.
- **Adversarial, input ditolak dan tidak tersimpan:** stake 0, beneficiary sama dengan pemilik, beneficiary zero address, URL `http://`, URL kepanjangan, tenggat di masa lalu, tenggat melewati horizon, janji kosong, kriteria kepanjangan.
- **Adversarial, urutan dan otorisasi:** `judge` sebelum tenggat, `refund_expired` sebelum masa tunggu, id pledge tak dikenal, `withdraw` tanpa saldo oleh akun lain, dan `judge` kedua kali pada pledge yang sudah selesai (tidak boleh membayar dua kali).
- **Adversarial, AI dan bukti:** kriteria yang tidak mungkin dipenuhi bukti tidak boleh menghasilkan `kept`; halaman bukti 404 harus menggagalkan `judge` dan meninggalkan stake utuh.

Menjalankan lewat GitHub Actions (disarankan):

1. Buat akun test baru khusus untuk ini. Jangan pakai key yang Anda pakai di tempat lain.
2. Isi sedikit GEN di Studionet untuk alamat tersebut. Faucet bawaan Studio ada di tombol 💧 pada pemilih akun di [studio.genlayer.com](https://studio.genlayer.com).
3. Buka repo di GitHub, lalu **Settings → Secrets and variables → Actions → New repository secret**. Name: `DEPLOYER_PRIVATE_KEY`. Value: private key akun test itu (`0x...`).
4. Buka tab **Actions → On-chain checks (Studionet) → Run workflow**.

Workflow ini juga jalan otomatis kalau `tests/integration/**`, `contracts/public_pledge.py`, atau workflow itu sendiri berubah di `main`. Alamat kontrak hasil deploy muncul di ringkasan job dan di log (`PublicPledge deployed at 0x...`).

Menjalankan di mesin sendiri:

```bash
ACCOUNT_PRIVATE_KEY=0x... gltest tests/integration/ -v -s --network studionet
```

Catatan keamanan: jangan pernah commit private key. `.env` sudah masuk `.gitignore`, dan workflow menulis key ke `.env` dari secret hanya selama job berjalan. Key tetap terbaca oleh runner GitHub dan siapa pun yang bisa melihat log job Anda, jadi pakai akun sekali pakai yang hanya berisi GEN test, lalu hapus atau rotate setelah selesai.

Catatan cakupan: test ini membuktikan perilaku pada kasus-kasus di atas. Model AI tetap bisa berbeda pendapat antar-run, jadi verdict untuk kasus batas bisa bervariasi. Yang dijamin oleh test adalah hal-hal yang tidak boleh terjadi: pledge tidak valid tersimpan, stake tidak berpindah tanpa putusan, dan janji yang tidak terbukti tidak dibayar ke pemilik.

## Struktur

```
contracts/public_pledge.py          kontrak
tests/direct/                       unit test, web dan LLM di-mock
tests/integration/                  test on-chain di Studionet (validator dan LLM sungguhan)
.github/workflows/ci.yml            lint, unit test, build frontend
.github/workflows/onchain.yml       deploy dan test on-chain (butuh secret)
gltest.config.yaml                  konfigurasi jaringan gltest
requirements.txt                    dependency Python (versi mengikuti boilerplate resmi)
```

## Berikutnya

1. Isi `NEXT_PUBLIC_CONTRACT_ADDRESS` dengan alamat hasil workflow on-chain, lalu uji frontend di browser dengan wallet sungguhan.
2. Tambahkan test integrasi GLSim untuk iterasi cepat tanpa menghabiskan GEN.
3. Migrasi ke `genlayer-js` v2 untuk Testnet Bradbury, termasuk estimasi fee sebelum menulis (`estimateTransactionFeesForWrite`) untuk `create_pledge` (payable, `value` + fee), `judge`, `refund_expired`, dan `withdraw`.
