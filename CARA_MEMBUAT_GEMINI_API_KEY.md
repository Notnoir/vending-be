# Cara Membuat Gemini API Key

## Langkah-langkah Mendapatkan API Key

### 1. Buka Google AI Studio

Kunjungi: **https://aistudio.google.com/app/apikey**

Atau bisa juga ke: **https://makersuite.google.com/app/apikey**

### 2. Login dengan Google Account

- Gunakan akun Gmail Anda
- Jika belum punya, buat akun Gmail terlebih dahulu di https://accounts.google.com

### 3. Setujui Terms of Service

- Baca dan setujui syarat dan ketentuan penggunaan Google AI
- Klik "Accept" atau "Agree"

### 4. Create API Key

Ada 2 opsi:

#### Opsi A: Create API Key di Project Baru

1. Klik tombol **"Create API key"**
2. Pilih **"Create API key in new project"**
3. Tunggu beberapa detik
4. API key akan muncul

#### Opsi B: Create API Key di Project yang Sudah Ada

1. Klik tombol **"Create API key"**
2. Pilih **"Create API key in existing project"**
3. Pilih project Google Cloud yang sudah ada
4. API key akan dibuat

### 5. Copy API Key

- API key akan tampil seperti ini: `AIzaSyAbc123Def456Ghi789...`
- Klik tombol **"Copy"** atau copy secara manual
- **PENTING:** Simpan API key ini dengan aman!

### 6. Paste ke File .env

Buka file `backend/.env` dan tambahkan:

```env
GEMINI_API_KEY=AIzaSyAbc123Def456Ghi789_paste_api_key_anda_disini
```

### 7. Restart Server

Setelah menambahkan API key, restart server Node.js:

```bash
cd backend
npm run dev
```

## Screenshot Panduan Visual

### Tampilan Google AI Studio:

```
┌─────────────────────────────────────────────┐
│  Google AI Studio                           │
├─────────────────────────────────────────────┤
│                                             │
│  Get an API key                             │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  [+] Create API key                 │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  Your API keys:                             │
│  ┌─────────────────────────────────────┐   │
│  │ AIzaSy...  [Copy]  [Restrict]  [⋮]  │   │
│  └─────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

## Verifikasi API Key Berfungsi

### Test 1: Cek Status Service

```bash
curl http://localhost:3001/api/health-assistant/status
```

Response yang diharapkan:

```json
{
  "success": true,
  "status": "ready",
  "message": "Health assistant service is ready"
}
```

### Test 2: Kirim Pertanyaan

```bash
curl -X POST http://localhost:3001/api/health-assistant/chat ^
  -H "Content-Type: application/json" ^
  -d "{\"message\":\"Apa obat untuk sakit kepala?\"}"
```

## Troubleshooting

### ❌ Error: "API key not valid"

**Penyebab:**

- API key salah atau tidak lengkap
- API key belum diaktifkan

**Solusi:**

1. Cek kembali API key di Google AI Studio
2. Pastikan tidak ada spasi atau karakter tambahan
3. Generate API key baru jika perlu

### ❌ Error: "GEMINI_API_KEY not found"

**Penyebab:**

- File `.env` belum ada variabel `GEMINI_API_KEY`
- Server belum direstart setelah update `.env`

**Solusi:**

1. Buka file `backend/.env`
2. Tambahkan baris: `GEMINI_API_KEY=your_key_here`
3. Save file
4. Restart server dengan `npm run dev`

### ❌ Error: "Resource exhausted"

**Penyebab:**

- Quota gratis sudah habis (60 requests per minute)

**Solusi:**

1. Tunggu 1 menit
2. Coba lagi
3. Atau upgrade ke paid plan

## Quota & Limits (Free Tier)

Gemini API Free tier memiliki batasan:

- **60 requests per minute (RPM)**
- **1,500 requests per day (RPD)**
- **1 million tokens per minute**

Untuk production dengan traffic tinggi, pertimbangkan upgrade ke paid plan.

## Keamanan API Key

### ✅ DO (Lakukan):

- Simpan API key di `.env` file
- Tambahkan `.env` ke `.gitignore`
- Gunakan environment variables di production
- Restrict API key ke domain/IP tertentu (optional)

### ❌ DON'T (Jangan):

- Commit API key ke Git/GitHub
- Share API key di public
- Hardcode API key di source code
- Gunakan API key yang sama untuk dev & production

## Alternative: Menggunakan Google Cloud Console

Jika ingin kontrol lebih advanced:

1. Buka **https://console.cloud.google.com**
2. Create Project baru atau pilih existing project
3. Enable **"Generative Language API"**
4. Pergi ke **"Credentials"** → **"Create Credentials"** → **"API Key"**
5. Restrict API key (optional):
   - Application restrictions (HTTP referrers, IP addresses)
   - API restrictions (hanya Generative Language API)

## Links Berguna

- 🔑 Create API Key: https://aistudio.google.com/app/apikey
- 📖 Documentation: https://ai.google.dev/docs
- 💰 Pricing: https://ai.google.dev/pricing
- 🔒 Security Best Practices: https://ai.google.dev/docs/api_security

## Bantuan Lebih Lanjut

Jika masih ada masalah:

1. Cek log server di terminal
2. Lihat response error dari API
3. Baca dokumentasi di https://ai.google.dev/docs
4. Contact support Google AI

---

**Selamat mencoba! 🚀**
