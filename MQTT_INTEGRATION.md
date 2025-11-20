# MQTT Integration Guide

## Overview

Backend vending machine menggunakan MQTT untuk komunikasi real-time dengan ESP32/Arduino.

## MQTT Broker Setup

### 1. Install Mosquitto MQTT Broker

**Windows:**

```bash
# Download dari https://mosquitto.org/download/
# Atau via Chocolatey:
choco install mosquitto
```

**Linux/Mac:**

```bash
sudo apt-get install mosquitto mosquitto-clients
# atau
brew install mosquitto
```

### 2. Configure Mosquitto

Edit file `mosquitto.conf`:

```conf
# Port
listener 1883

# Allow anonymous (untuk development)
allow_anonymous true

# Untuk production, gunakan authentication:
# password_file /etc/mosquitto/passwd
# allow_anonymous false

# Logging
log_dest file /var/log/mosquitto/mosquitto.log
log_type all
```

### 3. Create MQTT User (Production)

```bash
mosquitto_passwd -c /etc/mosquitto/passwd vending_admin
# Enter password: secure_mqtt_password
```

### 4. Start MQTT Broker

```bash
# Windows
net start mosquitto

# Linux
sudo systemctl start mosquitto
sudo systemctl enable mosquitto

# Mac
brew services start mosquitto
```

### 5. Test MQTT Connection

```bash
# Subscribe to test topic
mosquitto_sub -h localhost -t test/topic

# Publish to test topic (in another terminal)
mosquitto_pub -h localhost -t test/topic -m "Hello MQTT"
```

## MQTT Topic Structure

### Topics yang digunakan oleh Backend:

#### 1. **Command Topic** (Backend → ESP32)

```
vm/{machine_id}/command
```

**Payload Example:**

```json
{
  "cmd": "dispense",
  "slot": 1,
  "orderId": "ORD123456",
  "timeoutMs": 2150
}
```

#### 2. **Dispense Result Topic** (ESP32 → Backend)

```
vm/{machine_id}/dispense_result
```

**Payload Example:**

```json
{
  "orderId": "ORD123456",
  "slot": 1,
  "success": true,
  "dropDetected": true,
  "durationMs": 1850,
  "error": null
}
```

#### 3. **Telemetry Topic** (ESP32 → Backend)

```
vm/{machine_id}/telemetry
```

**Payload Example:**

```json
{
  "timestamp": "2025-11-04T10:30:00Z",
  "slots": [
    {
      "id": 1,
      "level": "FULL"
    },
    {
      "id": 2,
      "level": "LOW"
    }
  ],
  "temperature": 25.5,
  "door": "CLOSED"
}
```

#### 4. **Status Topic** (ESP32 → Backend)

```
vm/{machine_id}/status
```

**Payload Example:**

```json
{
  "status": "ONLINE",
  "door": "CLOSED",
  "rssi": -65,
  "fw": "1.0.0"
}
```

#### 5. **Config Topic** (Backend → ESP32)

```
vm/{machine_id}/config
```

**Payload Example:**

```json
{
  "motorTimeout": 3000,
  "dropSensorDelay": 50,
  "telemetryInterval": 60000
}
```

## Environment Variables

Update file `.env`:

```bash
# MQTT Configuration
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=vending_admin
MQTT_PASSWORD=secure_mqtt_password

# Machine ID
MACHINE_ID=VM01
```

## Backend Integration

### MQTT Service Status

MQTT service otomatis diinisialisasi saat backend start:

```javascript
// services/mqttService.js sudah aktif
const mqttService = require("./services/mqttService");

// Check connection status
if (mqttService.isConnected) {
  console.log("MQTT Connected");
}
```

### Publishing Dispense Command

```javascript
// Dipanggil otomatis dari POST /api/dispense/trigger
const dispenseCommand = {
  cmd: "dispense",
  slot: 1,
  orderId: "ORD123456",
  timeoutMs: 2150,
};

mqttService.publishDispenseCommand("VM01", dispenseCommand);
```

### Receiving Dispense Result

MQTT service otomatis handle message dari ESP32 di topic `vm/VM01/dispense_result`.

Handler akan:

1. Update `dispense_logs` table
2. Update `orders` status (COMPLETED/FAILED)
3. Update `slots` stock jika success
4. Log stock changes

## Testing MQTT Integration

### 1. Start Backend

```bash
cd backend
npm run dev
```

Pastikan muncul log:

```
✅ MQTT connected to broker
📡 Subscribed to vm/VM01/telemetry
📡 Subscribed to vm/VM01/dispense_result
📡 Subscribed to vm/VM01/status
```

### 2. Simulate ESP32 Response

**Terminal 1 - Subscribe ke command:**

```bash
mosquitto_sub -h localhost -t "vm/VM01/command" -v
```

**Terminal 2 - Trigger dispense:**

```bash
curl -X POST http://localhost:3001/api/dispense/trigger \
  -H "Content-Type: application/json" \
  -d '{"order_id": "test-order-123"}'
```

**Terminal 3 - Simulate ESP32 response:**

```bash
mosquitto_pub -h localhost -t "vm/VM01/dispense_result" \
  -m '{
    "orderId": "test-order-123",
    "slot": 1,
    "success": true,
    "dropDetected": true,
    "durationMs": 1850,
    "error": null
  }'
```

### 3. Check Database

```sql
-- Check dispense logs
SELECT * FROM dispense_logs ORDER BY command_sent_at DESC LIMIT 5;

-- Check order status
SELECT id, status, dispensed_at FROM orders WHERE id = 'test-order-123';

-- Check stock changes
SELECT * FROM stock_logs ORDER BY created_at DESC LIMIT 5;
```

## Payment Flow Integration

### Full Flow:

1. **User melakukan pembayaran** → Midtrans/Payment Gateway
2. **Payment Gateway webhook** → `POST /api/payments/webhook`
3. **Backend update order** → Status = PAID
4. **Backend trigger dispense** → `POST /api/dispense/trigger` (internal)
5. **Backend publish MQTT** → Topic: `vm/VM01/command`
6. **ESP32 terima command** → Nyalakan motor
7. **ESP32 publish result** → Topic: `vm/VM01/dispense_result`
8. **Backend handle result** → Update order status (COMPLETED/FAILED)

## Troubleshooting

### MQTT Not Connected

**Check:**

```bash
# Cek apakah mosquitto running
# Windows
sc query mosquitto

# Linux
sudo systemctl status mosquitto

# Test connection manually
mosquitto_sub -h localhost -p 1883 -t test
```

**Fix:**

```bash
# Restart mosquitto
# Windows
net stop mosquitto
net start mosquitto

# Linux
sudo systemctl restart mosquitto
```

### Messages Not Received

**Debug:**

1. Check logs di backend: `console.log` untuk MQTT messages
2. Monitor semua topics:
   ```bash
   mosquitto_sub -h localhost -t "#" -v
   ```
3. Check topic name exact match (case-sensitive)

### Connection Timeout

**Fix di backend:**

```javascript
// services/mqttService.js
const options = {
  // ...existing options...
  reconnectPeriod: 5000, // Reconnect every 5 seconds
  connectTimeout: 30000, // 30 second timeout
  keepalive: 60, // Send ping every 60 seconds
};
```

## Security Notes

### Production Checklist:

- [ ] Enable MQTT authentication (`allow_anonymous false`)
- [ ] Use strong passwords
- [ ] Enable TLS/SSL encryption (`listener 8883` with certificates)
- [ ] Restrict topic access with ACL
- [ ] Use environment variables for credentials
- [ ] Monitor MQTT logs for unauthorized access

### Sample ACL Config:

```conf
# /etc/mosquitto/acl
# Backend can publish to command and config
user vending_admin
topic write vm/+/command
topic write vm/+/config
topic read vm/+/#

# ESP32 can publish telemetry, status, results
user esp32_client
topic write vm/VM01/telemetry
topic write vm/VM01/status
topic write vm/VM01/dispense_result
topic read vm/VM01/command
topic read vm/VM01/config
```

## Next Steps

1. ✅ Backend MQTT integration (DONE)
2. ⏳ ESP32 MQTT client implementation
3. ⏳ Test end-to-end flow
4. ⏳ Production deployment
