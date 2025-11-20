# Vending Machine Backend API

Backend REST API untuk sistem vending machine IoT menggunakan Express.js dan MySQL.

## 🚀 Fitur

- **RESTful API** untuk semua operasi vending machine
- **Database Integration** dengan MySQL/Supabase untuk data persistence
- **Payment Gateway Integration** (Midtrans/QRIS)
- **MQTT Integration** untuk komunikasi real-time dengan ESP32/IoT devices
- **Real-time Telemetry** dari sensor mesin
- **Stock Management** dengan logging lengkap
- **Authentication** untuk admin dan mesin
- **Database Migration & Seeding**
- **Auto Dispense** saat pembayaran sukses

## 📋 Prerequisites

- Node.js 16+
- MySQL 5.7+ atau MariaDB 10.3+ (atau Supabase PostgreSQL)
- **Mosquitto MQTT Broker** (untuk komunikasi dengan ESP32)
  - Windows: `choco install mosquitto` atau download dari [mosquitto.org](https://mosquitto.org/download/)
  - Linux: `sudo apt-get install mosquitto`
  - Mac: `brew install mosquitto`

## 🛠️ Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Environment

```bash
cp .env.example .env
# Edit .env dengan konfigurasi database Anda
```

**Konfigurasi minimal untuk testing:**

```env
# Database (Required)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=vending_machine
DB_USER=root
DB_PASSWORD=

# JWT (Required)
JWT_SECRET=vending_machine_secret_key_for_testing_2025
JWT_EXPIRE=24h

# MQTT Configuration
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=vending_admin
MQTT_PASSWORD=secure_mqtt_password
MACHINE_ID=VM01

# Payment Gateway (Optional untuk testing)
PAYMENT_SERVER_KEY=test_payment_server_key
PAYMENT_CLIENT_KEY=test_payment_client_key
PAYMENT_IS_PRODUCTION=false
```

### 3. Setup MQTT Broker (Required untuk komunikasi dengan ESP32)

**Windows:**

```powershell
# Cara cepat - gunakan script yang sudah disediakan
.\setup-mqtt.ps1

# Atau manual via Chocolatey
choco install mosquitto

# Start service
net start mosquitto
```

**Linux:**

```bash
sudo apt-get install mosquitto mosquitto-clients
sudo systemctl start mosquitto
sudo systemctl enable mosquitto
```

**Verify MQTT:**

```bash
# Terminal 1 - Subscribe
mosquitto_sub -h localhost -t test/topic

# Terminal 2 - Publish
mosquitto_pub -h localhost -t test/topic -m "Hello MQTT"
```

📖 **Lihat dokumentasi lengkap:** [MQTT_INTEGRATION.md](./MQTT_INTEGRATION.md)

### 4. Setup Database

```bash
# Setup database (otomatis membuat database jika belum ada)
node src/database/setup.js

# Buat tabel-tabel
npm run db:migrate

# Isi data sample
npm run db:seed
```

### 5. Start Server

```bash
# Development mode (dengan auto-reload)
npm run dev

# Production mode
npm start
```

Server akan berjalan di **http://localhost:3001**

**Expected output:**

```
🚀 Vending Machine Backend running on port 3001
📊 Health check: http://localhost:3001/health
🌍 Environment: development
✅ MQTT connected to broker
📡 Subscribed to vm/VM01/telemetry
📡 Subscribed to vm/VM01/dispense_result
📡 Subscribed to vm/VM01/status
```

## 🔧 Configuration

Edit file `.env` dengan konfigurasi Anda:

```env
# Environment
NODE_ENV=development
PORT=3001

# Database Configuration (Required)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=vending_machine
DB_USER=root
DB_PASSWORD=

# JWT Configuration (Required)
JWT_SECRET=vending_machine_secret_key_for_testing_2025
JWT_EXPIRE=24h

# MQTT Configuration (Optional - skip untuk testing tanpa hardware)
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=vending_admin
MQTT_PASSWORD=secure_mqtt_password

# Payment Gateway Configuration (Optional untuk testing)
PAYMENT_SERVER_KEY=test_payment_server_key
PAYMENT_CLIENT_KEY=test_payment_client_key
PAYMENT_IS_PRODUCTION=false

# Machine Configuration
MACHINE_ID=VM01
MACHINE_NAME=Vending Machine Test

# API Configuration
API_BASE_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3000
```

## 🏃‍♂️ Testing MQTT Integration

### Test 1: Check MQTT Status

```bash
curl http://localhost:3001/api/debug/mqtt/status
```

### Test 2: Subscribe to Topics

```bash
# Terminal 1 - Monitor all MQTT messages
node test-mqtt.js subscribe
```

### Test 3: Simulate Complete Flow

**Terminal 1 - Start backend:**

```bash
npm run dev
```

**Terminal 2 - Monitor MQTT:**

```bash
node test-mqtt.js subscribe
```

**Terminal 3 - Create order and trigger dispense:**

```bash
# 1. Create order via API (atau via frontend)
curl -X POST http://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -d '{...order data...}'

# 2. Mark payment as success (simulate webhook)
curl -X POST http://localhost:3001/api/debug/update-payment/ORDER_ID \
  -H "Content-Type: application/json" \
  -d '{"status": "SUCCESS"}'

# Backend akan otomatis:
# - Update order status ke PAID
# - Trigger dispense via MQTT
# - Publish command ke topic: vm/VM01/command
```

**Terminal 4 - Simulate ESP32 response:**

```bash
node test-mqtt.js simulate ORDER_ID
```

### Test 4: Monitor Database Changes

```sql
-- Check orders
SELECT id, status, paid_at, dispensed_at FROM orders ORDER BY created_at DESC LIMIT 5;

-- Check dispense logs
SELECT * FROM dispense_logs ORDER BY command_sent_at DESC LIMIT 5;

-- Check stock changes
SELECT * FROM stock_logs ORDER BY created_at DESC LIMIT 5;
```

## 🔧 Mode Operasi

### Mode 1: Development - Tanpa ESP32 (Testing dengan simulasi)

- ✅ Database: MySQL/Supabase
- ✅ MQTT: Enabled (local broker)
- ✅ API: Semua endpoints aktif
- ✅ Frontend: Full integration
- ✅ Simulasi ESP32: Via `test-mqtt.js`

```bash
# 1. Start MQTT broker
net start mosquitto  # Windows
# atau
sudo systemctl start mosquitto  # Linux

# 2. Start backend
npm run dev

# 3. Test dengan script
node test-mqtt.js subscribe
```

### Mode 2: Production - Dengan ESP32 Hardware

- ✅ Database: MySQL
- ✅ MQTT: Enabled (ESP32/Pi integration)
- ✅ API: Semua endpoints aktif
- ✅ Hardware: Dispensing, sensors, dll

```bash
# Setup MQTT broker terlebih dahulu
npm start
```

## 📚 API Endpoints

### Health Check

- `GET /health` - Server status dan health check

### Authentication

- `POST /api/auth/login` - Admin login
- `POST /api/auth/machine` - Machine authentication
- `GET /api/auth/me` - Get current user info

### Products

- `GET /api/products` - Get all products with availability
- `GET /api/products/available` - Get available products (with stock)
- `GET /api/products/:id` - Get single product

### Orders

- `POST /api/orders` - Create new order
- `GET /api/orders/:id` - Get order details
- `PUT /api/orders/:id/status` - Update order status

### Payments

- `POST /api/payments` - Generate payment QR code
- `POST /api/payments/:id/verify` - Verify payment status
- `GET /api/payments/:id` - Get payment details

### Dispensing

- `POST /api/dispense` - Trigger product dispensing
- `GET /api/dispense/:id/status` - Get dispense status

### Machines

- `GET /api/machines` - Get all machines
- `GET /api/machines/:id` - Get machine details
- `PUT /api/machines/:id/status` - Update machine status

### Stock Management

- `GET /api/stock` - Get stock levels
- `POST /api/stock/restock` - Restock products
- `GET /api/stock/logs` - Get stock change logs

### Telemetry (Optional)

- `POST /api/telemetry` - Receive sensor data
- `GET /api/telemetry/:machineId` - Get telemetry history

## 📊 Database Structure

### Tables Created:

- `machines` - Vending machine information
- `products` - Product catalog
- `slots` - Product slot mapping
- `orders` - Customer orders
- `payments` - Payment transactions
- `dispense_logs` - Dispensing history
- `stock_logs` - Stock change history
- `telemetry` - Sensor data (optional)
- `admin_users` - Admin authentication

### Sample Data:

- **Default Admin**: `admin` / `admin123`
- **Products**: Coca Cola, Pepsi, Sprite, Fanta, dll
- **Machine**: VM01 (status: online)
- **Slots**: A1-C3 mapping
- `GET /api/orders/:order_id` - Get order status
- `GET /api/orders/machine/:machine_id` - Get machine orders

### Payments

- `POST /api/payments/webhook` - Payment gateway webhook
- `POST /api/payments/verify/:order_id` - Manual payment verification
- `GET /api/payments/:order_id` - Get payment details

### Dispense

- `POST /api/dispense/trigger` - Trigger dispense process
- `POST /api/dispense/confirm` - Confirm dispense result
- `GET /api/dispense/logs/:machine_id` - Get dispense logs
- `GET /api/dispense/status/:order_id` - Get dispense status

### Stock Management

- `GET /api/stock/:machine_id` - Get stock levels
- `POST /api/stock/update` - Update stock (restock/adjust)
- `GET /api/stock/logs/:machine_id` - Get stock change logs
- `POST /api/stock/report/:machine_id` - Report stock snapshot

### Machine Management

- `GET /api/machines/:machine_id` - Get machine info
- `POST /api/machines/:machine_id/status` - Update machine status
- `GET /api/machines/:machine_id/stats` - Get machine statistics

### Telemetry

- `POST /api/telemetry` - Receive telemetry data
- `GET /api/telemetry/:machine_id` - Get telemetry history
- `GET /api/telemetry/:machine_id/latest` - Get latest telemetry
- `GET /api/telemetry/:machine_id/summary` - Get telemetry summary

## 🏗️ Database Schema

### Tables

- `machines` - Informasi mesin vending
- `products` - Master produk
- `slots` - Slot mesin dengan stok
- `orders` - Pesanan pelanggan
- `payments` - Transaksi pembayaran
- `dispense_logs` - Log proses dispense
- `stock_logs` - Log perubahan stok
- `telemetry` - Data telemetri dari sensor
- `admin_users` - User admin sistem

## 🔄 MQTT Topics

### Subscribe (Backend menerima dari Pi/ESP32)

- `vm/{MACHINE_ID}/telemetry` - Data sensor berkala
- `vm/{MACHINE_ID}/dispense_result` - Hasil proses dispense
- `vm/{MACHINE_ID}/status` - Status update mesin

### Publish (Backend kirim ke Pi/ESP32)

- `vm/{MACHINE_ID}/command` - Perintah dispense
- `vm/{MACHINE_ID}/config` - Update konfigurasi

### Message Format

**Dispense Command:**

```json
{
  "cmd": "dispense",
  "slot": 2,
  "orderId": "ORD-20250909-001",
  "timeoutMs": 1500
}
```

**Dispense Result:**

```json
{
  "event": "dispense_result",
  "orderId": "ORD-20250909-001",
  "slot": 2,
  "success": true,
  "dropDetected": true,
  "durationMs": 1230,
  "error": null
}
```

**Telemetry:**

```json
{
  "event": "telemetry",
  "slots": [
    { "id": 1, "level": "LOW" },
    { "id": 2, "level": "OK" }
  ],
  "door": "CLOSED",
  "rssi": -62,
  "fw": "1.0.3"
}
```

## 🧪 Testing

### Manual Testing dengan curl

1. **Create Order:**

   ```bash
   curl -X POST http://localhost:3001/api/orders \\
     -H "Content-Type: application/json" \\
     -d '{"slot_id": 1, "quantity": 1}'
   ```

2. **Check Order Status:**

   ```bash
   curl http://localhost:3001/api/orders/ORD-20250909-XXXXXXXX
   ```

3. **Simulate Payment:**

   ```bash
   curl -X POST http://localhost:3001/api/payments/verify/ORD-20250909-XXXXXXXX \\
     -H "Content-Type: application/json" \\
     -d '{"status": "SUCCESS"}'
   ```

4. **Trigger Dispense:**
   ```bash
   curl -X POST http://localhost:3001/api/dispense/trigger \\
     -H "Content-Type: application/json" \\
     -d '{"order_id": "ORD-20250909-XXXXXXXX"}'
   ```

## 🔐 Security

- JWT authentication untuk admin dan mesin
- Rate limiting pada semua endpoint
- Helmet.js untuk security headers
- Input validation dengan Joi
- SQL injection protection dengan prepared statements

## 📊 Monitoring

- Health check endpoint: `GET /health`
- Database connection monitoring
- MQTT connection status
- Comprehensive error logging

## 🤝 Integration dengan Frontend

Backend ini dirancang untuk berintegrasi dengan:

- **Next.js Frontend** (UI touchscreen untuk pelanggan) - http://localhost:3000
- **React Admin Dashboard** (monitoring dan manajemen)
- **Raspberry Pi** (orkestrasi dan cache) - opsional
- **ESP32** (kontrol hardware dan sensor) - opsional

## 🔑 Default Credentials

**Admin Login:**

- Username: `admin`
- Password: `admin123`

**Machine Token:**

- Machine ID: `VM01`
- Token: `vm01_secure_token_nfcimcoic`

## 📝 Development Commands

```bash
# Server Management
npm run dev              # Start development server (dengan auto-reload)
npm run start           # Start production server

# Database Management
node src/database/setup.js  # Setup database (buat database)
npm run db:migrate         # Buat/update tabel
npm run db:seed           # Isi data sample

# Utility
npm test                  # Run tests (jika ada)
```

## 🧪 Testing API

### Health Check

```bash
curl http://localhost:3001/health
```

### Get Products

```bash
curl http://localhost:3001/api/products
```

### Create Order

```bash
curl -X POST http://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -d '{"machine_id":"VM01","product_id":1,"quantity":1}'
```

## 🔄 Development Flow

1. **Setup Environment**: Edit `.env` dengan konfigurasi database
2. **Setup Database**: Jalankan script setup untuk buat database dan tabel
3. **Start Backend**: `npm run dev` untuk development
4. **Start Frontend**: Jalankan frontend di http://localhost:3000
5. **Test Integration**: Test flow order → payment → dispensing

## 🚨 Troubleshooting

### Database Connection Issues

```bash
# Cek apakah MySQL sudah jalan
# Windows: services.msc → MySQL
# Atau install XAMPP/WAMP

# Test koneksi manual
mysql -u root -p
```

### Port Already in Use

```bash
# Ubah PORT di .env
PORT=3002

# Atau kill process
netstat -ano | findstr :3001
taskkill /PID [PID_NUMBER] /F
```

### MQTT Issues (Jika Digunakan)

```bash
# Install Mosquitto broker
# Download dari: https://mosquitto.org/download/
# Atau gunakan Docker:
docker run -it -p 1883:1883 eclipse-mosquitto
```

### Reset Database

```bash
# Drop dan recreate database
mysql -u root -e "DROP DATABASE vending_machine;"
node src/database/setup.js
npm run db:migrate
npm run db:seed
```
