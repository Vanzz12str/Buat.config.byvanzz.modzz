# VANZZ MODZ — Netlify Edition

Versi ini memakai Netlify Functions untuk endpoint login/role dan Netlify Blobs untuk penyimpanan akun persisten. Jangan upload versi server.js lama ke Netlify sebagai static site.

## Deploy ke Netlify
1. Ekstrak ZIP ini. Upload **isi folder hasil ekstrak** ke GitHub (bukan ZIP lama dan bukan ZIP ini sebagai satu file). Pastikan `netlify.toml`, `package.json`, `public/`, dan `netlify/functions/api.mjs` ada di root repository.
2. Di Netlify, pilih **Add new site → Import an existing project → GitHub** dan hubungkan repository. Jangan gunakan **Dropped files / drag-and-drop** karena itu hanya menerbitkan aset statis. Build command boleh dikosongkan; publish directory sudah diatur ke `public` di `netlify.toml`.
3. Buka **Site configuration → Environment variables**, tambahkan `NETLIFY_SESSION_SECRET` dengan nilai acak panjang minimal 32 karakter. Contoh untuk membuat nilai acak di terminal: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Jangan pakai contoh tetap sebagai secret.
4. Deploy site. Netlify Functions dan Netlify Blobs digunakan otomatis di environment Netlify. Untuk penggunaan lokal, perlu `netlify dev` serta konfigurasi Netlify CLI/Blobs.
5. Login awal: username `Vanzz Owner`, password `HARTONO FAMILY`. Setelah login, segera buka **Ganti password** dan ubah password awal.

## Role
- Member: akses workspace config.
- Reseller: dapat membuat akun Member.
- Partner: dapat membuat akun Member dan Reseller.
- Owner: dapat membuat seluruh role, melihat daftar akun, blokir/buka blokir, dan mengubah role. Akun Owner utama tidak bisa diblokir atau diturunkan role-nya.

## Catatan penting
- Akun disimpan di Netlify Blobs, bukan di filesystem sementara function.
- Sesi login ditandatangani dan cookie memakai HttpOnly, Secure, SameSite=Strict; masa berlaku 8 jam.
- Endpoint API memvalidasi role di server. Namun file workspace `tool.html` dan aset statis tetap merupakan aset publik Netlify jika diakses langsung lewat URL; jangan menyimpan rahasia di dalam aset frontend. Ini bukan mekanisme untuk mengamankan file rahasia.
- Uji semua alur setelah deploy dan gunakan password Owner yang baru.
