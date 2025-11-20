# MQTT Implementation Summary - Backend

## ✅ Implementasi yang Sudah Dilakukan

### 1. **MQTT Service Aktif** (`src/services/mqttService.js`)

File ini sudah ada dan lengkap dengan fitur:

- ✅ Auto-connect ke MQTT broker saat backend start
- ✅ Auto-reconnect jika koneksi terputus
- ✅ Subscribe ke semua topic yang diperlukan
- ✅ Handler untuk semua jenis message dari ESP32
- ✅ Publish command ke ESP32
- ✅ Update database otomatis berdasarkan message

**Topics yang di-subscribe:**

- `vm/{machineId}/telemetry` - Menerima data sensor
- `vm/{machineId}/dispense_result` - Menerima hasil dispensing
- `vm/{machineId}/status` - Menerima status mesin

**Topics yang di-publish:**

- `vm/{machineId}/command` - Kirim perintah dispense
- `vm/{machineId}/config` - Kirim konfigurasi

### 2. **Server Integration** (`src/server.js`)

- ✅ MQTT service di-import dan diinisialisasi otomatis
- ✅ Graceful shutdown handler (close MQTT saat server stop)
- ✅ Status MQTT ditampilkan di console saat startup

### 3. **Dispense Route Update** (`src/routes/dispense.js`)

**Perubahan:**

- ❌ Removed: Mock MQTT service
- ✅ Added: Real MQTT service integration
- ✅ Enhanced: Error handling jika MQTT tidak terkoneksi
- ✅ Added: Fallback ke status PENDING_DISPENSE jika MQTT gagal

**Flow saat `/api/dispense/trigger` dipanggil:**

1. Validate order (harus status PAID)
2. Update order status → DISPENSING
3. Create dispense log
4. **Publish MQTT command** → `vm/{machineId}/command`
5. Return response ke client

### 4. **Payment Webhook Integration** (`src/routes/payments.js`)

**Perubahan:**

- ✅ Added: axios untuk HTTP request
- ✅ Enhanced: Auto-trigger dispense saat payment SUCCESS
- ✅ Added: Error handling dengan fallback ke PENDING_DISPENSE

**Flow saat webhook menerima payment SUCCESS:**

1. Update payment status
2. Update order status → PAID
3. **Trigger dispense** → Internal call ke `/api/dispense/trigger`
4. Jika dispense gagal → Update order ke PENDING_DISPENSE

### 5. **Debug Endpoints** (`src/routes/debug.js`)

**Endpoints baru untuk testing:**

```
GET /api/debug/mqtt/status
```

Cek status koneksi MQTT

```
POST /api/debug/mqtt/test-command
```

Kirim test command ke ESP32

```
POST /api/debug/mqtt/simulate-dispense-result
Body: {
  "orderId": "ORDER_ID",
  "slot": 1,
  "success": true,
  "dropDetected": true,
  "durationMs": 1850
}
```

Simulasi ESP32 mengirim hasil dispense (untuk testing tanpa hardware)

### 6. **Testing Tools**

**Script: `test-mqtt.js`**

```bash
# Subscribe ke semua topic
node test-mqtt.js subscribe

# Publish test telemetry
node test-mqtt.js publish

# Simulate dispense result
node test-mqtt.js simulate ORDER_ID
```

**Script: `setup-mqtt.ps1`**
Script PowerShell untuk install dan setup Mosquitto di Windows:

- Check Chocolatey
- Install Mosquitto
- Create config file
- Start service

### 7. **Documentation**

**Files created:**

- ✅ `MQTT_INTEGRATION.md` - Dokumentasi lengkap MQTT
- ✅ `MQTT_IMPLEMENTATION_SUMMARY.md` - Summary implementasi (file ini)
- ✅ Updated `README.md` - Dengan section MQTT

---

## 🔄 Payment to Dispense Flow (Complete)

```
┌─────────────┐
│   User      │
│   Bayar     │
└──────┬──────┘
       │
       ▼
┌─────────────────────────┐
│  Midtrans/Payment GW    │
│  Process Payment        │
└──────┬──────────────────┘
       │
       ▼ (Webhook)
┌─────────────────────────────────────────┐
│  Backend: POST /api/payments/webhook    │
│                                         │
│  1. Validate payment                    │
│  2. Update payment table → SUCCESS      │
│  3. Update orders table → PAID          │
│  4. IF SUCCESS:                         │
│     └─> Call /api/dispense/trigger      │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  Backend: POST /api/dispense/trigger    │
│                                         │
│  1. Get order details                   │
│  2. Update order → DISPENSING           │
│  3. Create dispense_log entry           │
│  4. Publish MQTT command                │
│     Topic: vm/VM01/command              │
│     Payload: {                          │
│       cmd: "dispense",                  │
│       slot: 1,                          │
│       orderId: "xxx",                   │
│       timeoutMs: 2150                   │
│     }                                   │
└──────┬──────────────────────────────────┘
       │
       ▼ MQTT Broker
┌─────────────────────────────────────────┐
│  ESP32 Subscribe: vm/VM01/command       │
│                                         │
│  1. Receive command                     │
│  2. Parse JSON                          │
│  3. Activate relay (motor ON)           │
│  4. Monitor limit switch                │
│  5. Motor OFF when triggered/timeout    │
│  6. Publish result                      │
│     Topic: vm/VM01/dispense_result      │
│     Payload: {                          │
│       orderId: "xxx",                   │
│       slot: 1,                          │
│       success: true,                    │
│       dropDetected: true,               │
│       durationMs: 1850                  │
│     }                                   │
└──────┬──────────────────────────────────┘
       │
       ▼ MQTT Broker
┌─────────────────────────────────────────┐
│  Backend: mqttService.handleMessage()   │
│                                         │
│  1. Receive dispense_result             │
│  2. Update dispense_log                 │
│     - completed_at = NOW()              │
│     - success = true                    │
│     - duration_ms = 1850                │
│  3. IF success && dropDetected:         │
│     - Update order → COMPLETED          │
│     - Update slot stock (-1)            │
│     - Create stock_log entry            │
│  4. ELSE:                               │
│     - Update order → FAILED             │
└─────────────────────────────────────────┘
```

---

## 🧪 Testing Checklist

### Prerequisites

- [x] Mosquitto MQTT broker installed
- [x] Mosquitto service running
- [x] Backend dependencies installed (`npm install`)
- [x] Database setup completed
- [x] `.env` file configured

### Test 1: MQTT Connection

```bash
# Start backend
npm run dev

# Expected output:
✅ MQTT connected to broker
📡 Subscribed to vm/VM01/telemetry
📡 Subscribed to vm/VM01/dispense_result
📡 Subscribed to vm/VM01/status
```

### Test 2: Check MQTT Status

```bash
curl http://localhost:3001/api/debug/mqtt/status

# Expected:
{
  "success": true,
  "mqtt": {
    "connected": true,
    "broker": "mqtt://localhost:1883",
    "machineId": "VM01"
  }
}
```

### Test 3: Monitor MQTT Topics

```bash
# Terminal 1
node test-mqtt.js subscribe

# Should show:
📡 Subscribed to vm/VM01/command
📡 Subscribed to vm/VM01/config
📡 Subscribed to vm/VM01/dispense_result
...
```

### Test 4: Create Order & Simulate Payment

```bash
# 1. Create order (via frontend atau API)
# Get the order_id from response

# 2. Simulate payment success
curl -X POST http://localhost:3001/api/debug/update-payment/ORDER_ID \
  -H "Content-Type: application/json" \
  -d '{"status": "SUCCESS"}'

# Expected in terminal with node test-mqtt.js subscribe:
📥 Message received on vm/VM01/command:
{
  "cmd": "dispense",
  "slot": 1,
  "orderId": "ORDER_ID",
  "timeoutMs": 2150
}
```

### Test 5: Simulate ESP32 Response

```bash
# In another terminal
node test-mqtt.js simulate ORDER_ID

# Expected in backend logs:
📥 MQTT message received [vm/VM01/dispense_result]: {...}
🎰 Dispense result processed: Order ORDER_ID - COMPLETED
```

### Test 6: Verify Database

```sql
-- Check order status
SELECT id, status, paid_at, dispensed_at
FROM orders
WHERE id = 'ORDER_ID';
-- Expected: status = 'COMPLETED', dispensed_at = (current time)

-- Check dispense log
SELECT *
FROM dispense_logs
WHERE order_id = 'ORDER_ID';
-- Expected: success = 1, drop_detected = 1, completed_at = (current time)

-- Check stock
SELECT *
FROM stock_logs
WHERE reason LIKE '%ORDER_ID%';
-- Expected: change_type = 'DISPENSE', quantity_change = -1
```

---

## 📊 Database Schema - MQTT Related

### `dispense_logs` Table

Menyimpan log setiap kali dispense command dikirim dan hasilnya.

```sql
CREATE TABLE dispense_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(36) NOT NULL,
  machine_id VARCHAR(50) NOT NULL,
  slot_number INT NOT NULL,
  command_sent_at DATETIME NOT NULL,      -- Saat MQTT command dikirim
  completed_at DATETIME,                   -- Saat ESP32 kirim result
  success BOOLEAN,                         -- Apakah motor berhasil jalan
  drop_detected BOOLEAN,                   -- Apakah limit switch tertekan
  duration_ms INT,                         -- Durasi motor nyala (ms)
  error_message TEXT,                      -- Error jika gagal
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Order Status Flow

```
PENDING → PAID → DISPENSING → COMPLETED
                      ↓
                    FAILED
                      ↓
              PENDING_DISPENSE (for retry)
```

---

## 🔐 Environment Variables

Required `.env` configuration:

```bash
# MQTT Configuration
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=vending_admin          # Optional for dev
MQTT_PASSWORD=secure_mqtt_password   # Optional for dev
MACHINE_ID=VM01

# Server
PORT=3001
NODE_ENV=development

# Database (choose one)
USE_SUPABASE=false
DB_HOST=localhost
DB_NAME=vending_machine
DB_USER=root
DB_PASSWORD=

# JWT
JWT_SECRET=your_secret_key
```

---

## 🚀 Next Steps

### Backend ✅ DONE

- [x] MQTT service implementation
- [x] Server integration
- [x] Dispense route with MQTT
- [x] Payment webhook integration
- [x] Debug endpoints
- [x] Testing tools
- [x] Documentation

### ESP32 ⏳ PENDING

- [ ] WiFi connection
- [ ] MQTT client library (PubSubClient)
- [ ] Subscribe to `vm/VM01/command`
- [ ] Parse JSON command
- [ ] Trigger motor berdasarkan command
- [ ] Publish result to `vm/VM01/dispense_result`
- [ ] Error handling & timeout

### Testing ⏳ PENDING

- [ ] End-to-end testing dengan ESP32
- [ ] Load testing MQTT
- [ ] Network reliability testing
- [ ] Edge case handling

---

## 📝 Notes

### MQTT vs HTTP

**Kenapa MQTT untuk ESP32 → Backend:**

- ✅ Persistent connection (lebih reliable)
- ✅ Automatic reconnection
- ✅ QoS support (guaranteed delivery)
- ✅ Bi-directional communication
- ✅ Lightweight protocol (cocok untuk IoT)

**Kenapa HTTP untuk Backend → Backend:**

- Payment webhook dari Midtrans
- Internal API call (`dispense/trigger`)

### Error Handling

**Jika MQTT tidak terkoneksi:**

1. Backend tetap jalan normal
2. Dispense command tidak terkirim
3. Order status → PENDING_DISPENSE
4. Admin bisa retry manual

**Jika ESP32 tidak respond:**

1. Timeout di ESP32 (2150ms)
2. ESP32 publish result dengan error
3. Backend update order → FAILED
4. Admin notified (via frontend/dashboard)

---

## 🆘 Troubleshooting

### Problem: MQTT not connected

**Check:**

```bash
# Windows
sc query mosquitto

# Linux
sudo systemctl status mosquitto
```

**Fix:**

```bash
# Windows
net start mosquitto

# Linux
sudo systemctl restart mosquitto
```

### Problem: Message not received

**Debug:**

```bash
# Monitor all topics
mosquitto_sub -h localhost -t "#" -v

# Check specific topic
mosquitto_sub -h localhost -t "vm/VM01/command" -v
```

### Problem: Backend can't connect to MQTT

**Check `.env`:**

```bash
MQTT_BROKER_URL=mqtt://localhost:1883  # Not mqtts:// for local
```

**Test manually:**

```bash
mosquitto_pub -h localhost -t test -m "hello"
mosquitto_sub -h localhost -t test
```

---

## 📚 References

- [MQTT Protocol](https://mqtt.org/)
- [Mosquitto Documentation](https://mosquitto.org/documentation/)
- [MQTT.js Library](https://github.com/mqttjs/MQTT.js)
- [PubSubClient (ESP32)](https://github.com/knolleary/pubsubclient)

---

**Status:** ✅ Backend implementation COMPLETE  
**Next:** ESP32 MQTT client implementation  
**Date:** 2025-11-04
