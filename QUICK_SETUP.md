# Quick Setup Guide - Vending Machine Backend

## 🚀 Setup Cepat (5 Menit)

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Setup Environment

```bash
cp .env.example .env
```

Edit `.env` (minimal configuration):

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=vending_machine
JWT_SECRET=vending_machine_secret_key_for_testing_2025
```

### 3. Setup Database

```bash
# Buat database
node src/database/setup.js

# Buat tabel
npm run db:migrate

# Isi data sample
npm run db:seed
```

### 4. Start Server

```bash
npm run dev
```

Server running di: **http://localhost:3001**

## ✅ Testing

- Health check: http://localhost:3001/health
- Products API: http://localhost:3001/api/products
- Frontend integration: http://localhost:3000

## 🔑 Default Login

- Username: `admin`
- Password: `admin123`

## 📱 Features Ready

- ✅ Database MySQL
- ✅ REST API endpoints
- ✅ Frontend integration
- ❌ MQTT (disabled untuk testing)
- ✅ Payment simulation
- ✅ Order management

## 🛠️ Troubleshooting

1. **MySQL not running**: Install XAMPP/WAMP atau start MySQL service
2. **Port 3001 used**: Ubah PORT di .env
3. **Database error**: Jalankan `node src/database/setup.js` lagi
