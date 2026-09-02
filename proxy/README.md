# Proxy AI — SGM Office

Halaman `index.html` **tidak lagi menyimpan API key OpenAI**. Browser hanya
mengirim `{ "prompt": "..." }` ke proxy; proxy yang memegang key, menentukan
model, dan membatasi jumlah token.

```
Browser  ──{prompt}──►  Proxy (memegang key)  ──►  OpenAI
         ◄──{content}──                       ◄──
```

---

## ⚠️ Langkah pertama: cabut key yang lama

Key yang lama sudah pernah ikut ter-*commit* dan tampil di situs publik, jadi
**harus dianggap bocor** — menghapusnya dari kode saja tidak cukup karena masih
tersimpan di riwayat git.

1. Buka <https://platform.openai.com/api-keys>
2. **Revoke** key lama.
3. Buat key baru. Key baru ini **hanya** dimasukkan ke proxy (langkah di bawah),
   jangan pernah ditulis di `index.html` atau file mana pun di repo ini.

---

## Pilihan A — Cloudflare Workers (disarankan)

Gratis, tanpa kartu kredit, siap dalam beberapa menit.

Jalankan **satu per satu** (jangan disambung dengan `&&` — PowerShell 5.1 di
Windows tidak mengenalnya, dan dua perintah di bawah bersifat interaktif):

```
cd proxy
```
```
npx wrangler login
```
Browser terbuka untuk izin akses akun Cloudflare.

```
npx wrangler secret put OPENAI_API_KEY
```
Muncul prompt `Enter a secret value:` — tempel key OpenAI yang **baru**, lalu Enter.

```
npx wrangler deploy
```

Setelah `deploy`, wrangler menampilkan URL seperti:

```
https://sgm-ai-proxy.NAMA-AKUN.workers.dev
```

### Batas pemakaian per IP (disarankan)

Tanpa ini, siapa pun yang tahu URL proxy bisa memakai kuota Anda.

```
npx wrangler kv namespace create RATE
```

Salin `id` yang muncul ke `wrangler.toml` (bagian `[[kv_namespaces]]` — hapus
tanda komentarnya), lalu `npx wrangler deploy` lagi. Standarnya 20 permintaan
per IP per jam; ubah lewat `RATE_MAX` / `RATE_WINDOW` di `cloudflare-worker.js`.

---

## Pilihan B — Firebase Cloud Functions

Cocok bila ingin satu atap dengan Firestore yang sudah dipakai.
**Perlu paket Blaze** karena fungsi harus memanggil layanan di luar Google.

Satu per satu juga:

```
firebase init functions
```
Pilih Node 20. Lalu salin `proxy/firebase-function.js` menjadi `functions/index.js`.

```
firebase functions:secrets:set OPENAI_API_KEY
```
```
firebase deploy --only functions:aiProxy
```

URL-nya muncul di akhir proses deploy.

---

## Langkah terakhir: sambungkan halaman ke proxy

Buka `index.html`, cari baris berikut (sekitar baris 2654):

```js
var AI_PROXY_URL='';
```

Isi dengan URL proxy Anda:

```js
var AI_PROXY_URL='https://sgm-ai-proxy.NAMA-AKUN.workers.dev';
```

Commit dan push. URL proxy aman ditulis di sini — yang rahasia adalah key, dan
key hanya ada di server.

Untuk mencoba dulu tanpa mengubah file, jalankan di konsol browser:

```js
localStorage.setItem('sgm_proxy_url','https://sgm-ai-proxy.NAMA-AKUN.workers.dev')
```

---

## Menambah alamat yang diizinkan

Proxy hanya melayani `Origin` yang terdaftar. Bila situs dipindah ke domain
lain, tambahkan di `ALLOWED_ORIGINS` (ada di `cloudflare-worker.js` dan
`firebase-function.js`), lalu deploy ulang.

Daftar bawaan:

```
https://sofyanhsubekti-rgb.github.io
http://localhost:8777
http://localhost:8778
```

---

## Bila proxy belum diatur atau sedang bermasalah

Aplikasi tetap jalan. Laporan tetap terbit memakai **analisa otomatis** yang
dihitung langsung dari data, dengan catatan kecil bahwa analisa AI tidak
tersedia. Tidak ada bagian laporan yang hilang.

---

## Yang dikunci di sisi server

Supaya proxy tidak bisa dipakai untuk hal lain:

| Hal | Nilai |
|---|---|
| Model | `gpt-4o-mini` (tidak bisa diubah dari browser) |
| Batas token jawaban | 3000 |
| Batas panjang prompt | 20.000 karakter |
| Metode | hanya `POST` |
| Origin | hanya yang terdaftar |
| Detail error OpenAI | tidak diteruskan ke browser |
