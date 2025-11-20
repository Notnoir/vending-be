# HiveMQ Cloud Setup for Production Deployment

## 🎯 Why HiveMQ Cloud?

### **Problem dengan Mosquitto untuk Deployed Project:**

```
❌ Backend (Vercel/Railway) → Mosquitto (localhost) → ESP32
   └─ ESP32 tidak bisa connect ke localhost backend
   └─ Perlu VPS terpisah untuk Mosquitto
   └─ Perlu setup firewall & port forwarding
   └─ Perlu maintenance & monitoring
```

### **Solution dengan HiveMQ Cloud:**

```
✅ Backend (Vercel/Railway) → HiveMQ Cloud → ESP32
   └─ Public MQTT broker
   └─ No additional server needed
   └─ Free tier: 100 connections
   └─ 99.99% uptime SLA
   └─ Built-in SSL/TLS
   └─ Monitoring dashboard
```

---

## 📝 Step-by-Step Setup

### **Step 1: Create HiveMQ Cloud Account**

1. **Go to:** https://console.hivemq.cloud/
2. **Sign up** (free account)
3. **Verify email**
4. **Login** to console

### **Step 2: Create MQTT Cluster**

1. Click **"Create Cluster"**
2. Select **"Serverless"** (Free tier)
   - 100 connections
   - 10 GB data transfer/month
   - Perfect untuk 1-10 vending machines
3. Choose region (Europe/US/Asia) - pilih yang terdekat
4. Click **"Create"**
5. Wait 1-2 minutes untuk cluster siap

### **Step 3: Get Cluster Credentials**

1. Click cluster name
2. Go to **"Access Management"** tab
3. Click **"Add Credentials"**
4. Create username & password:
   ```
   Username: vending-backend
   Password: [Generate strong password]
   ```
5. **SAVE credentials** - you won't see password again!

### **Step 4: Get Connection Details**

Di cluster overview, copy:

```
Host: xxxxx.s1.eu.hivemq.cloud
Port (TLS): 8883
Port (WebSocket): 443
Port (MQTT): 1883 (not recommended)
```

**Example:**

```
Host: b6f5a4c3d2e1.s1.eu.hivemq.cloud
```

---

## ⚙️ Backend Configuration

### **1. Update `.env` file:**

```bash
# MQTT Configuration - HiveMQ Cloud
MQTT_BROKER_URL=mqtts://b6f5a4c3d2e1.s1.eu.hivemq.cloud:8883
MQTT_USERNAME=vending-backend
MQTT_PASSWORD=your-strong-password

MACHINE_ID=VM01
```

**Important:**

- Use `mqtts://` (with 's') for secure connection
- Port `8883` for TLS
- Include username & password

### **2. Deploy Backend:**

**Vercel/Railway/etc akan otomatis gunakan `.env` variables.**

No additional configuration needed!

---

## 🔧 ESP32 Configuration

### **1. Update `vending_machine_mqtt.ino`:**

```cpp
// === Konfigurasi MQTT ===
const char* MQTT_SERVER = "b6f5a4c3d2e1.s1.eu.hivemq.cloud";
const int MQTT_PORT = 8883;
const char* MQTT_USER = "vending-esp32";
const char* MQTT_PASS = "your-esp32-password";
const char* MACHINE_ID = "VM01";
```

### **2. Add WiFiClientSecure for TLS (Optional tapi Recommended):**

**A. Include library:**

```cpp
#include <WiFiClientSecure.h>  // Instead of WiFiClient
```

**B. Change client:**

```cpp
// OLD:
// WiFiClient espClient;

// NEW:
WiFiClientSecure espClient;
```

**C. Setup insecure mode (untuk development):**

```cpp
void setupMQTT() {
  espClient.setInsecure();  // Skip certificate verification (development only)

  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setKeepAlive(60);
}
```

**D. For production, use certificate verification:**

```cpp
// Root CA certificate untuk HiveMQ
const char* root_ca = \
"-----BEGIN CERTIFICATE-----\n" \
"MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw\n" \
// ... certificate content ...
"-----END CERTIFICATE-----\n";

void setupMQTT() {
  espClient.setCACert(root_ca);
  // ...
}
```

### **3. Upload to ESP32**

Upload updated code to ESP32.

---

## 🧪 Testing

### **Test 1: Check HiveMQ Dashboard**

1. Go to HiveMQ Console
2. Click cluster
3. Go to **"Clients"** tab
4. **Should see:**
   - Backend client connected
   - ESP32 client connected

### **Test 2: Backend Logs**

```bash
npm run dev
```

**Expected:**

```
✅ MQTT connected to broker
📡 Subscribed to vm/VM01/telemetry
📡 Subscribed to vm/VM01/dispense_result
📡 Subscribed to vm/VM01/status
```

### **Test 3: ESP32 Serial Monitor**

**Expected:**

```
✅ WiFi connected!
📡 MQTT Server: b6f5a4c3d2e1.s1.eu.hivemq.cloud:8883
📡 Connecting to MQTT broker... ✅ Connected!
📥 Subscribed to: vm/VM01/command
```

### **Test 4: Send Test Message**

**HiveMQ Console:**

1. Go to **"Web Client"** tab
2. Connect
3. Publish to `vm/VM01/command`:
   ```json
   {
     "cmd": "test",
     "timestamp": "2025-11-12T10:00:00Z"
   }
   ```

**ESP32 should receive and log:**

```
📥 Message received on topic: vm/VM01/command
✅ Test command received - System OK
```

---

## 💰 Pricing & Limits

### **Free Tier (Serverless):**

- ✅ 100 concurrent connections
- ✅ 10 GB data transfer/month
- ✅ 99.99% uptime SLA
- ✅ Community support

**Estimation untuk Vending Machine:**

- 1 backend connection
- 1 ESP32 per machine
- Average message: 500 bytes
- Frequency: 10 messages/hour
- **Monthly usage:** ~3.6 MB per machine
- **Can support:** 10-50 machines dalam free tier

### **Paid Plans (jika scale up):**

| Plan         | Connections | Data Transfer | Price     |
| ------------ | ----------- | ------------- | --------- |
| Starter      | 100         | 10 GB         | Free      |
| Professional | 1,000       | 100 GB        | $49/month |
| Enterprise   | 10,000+     | 1 TB+         | Custom    |

---

## 🔒 Security Best Practices

### **1. Separate Credentials:**

**Backend:**

```
Username: vending-backend
Permissions: Read & Write all topics
```

**ESP32:**

```
Username: vending-esp32-VM01
Permissions:
  - Read: vm/VM01/command
  - Write: vm/VM01/*
```

**How to set in HiveMQ:**

1. Go to **Access Management**
2. Add multiple credentials
3. Set permissions per user

### **2. Use TLS/SSL:**

Always use `mqtts://` and port `8883` for encrypted connection.

### **3. Rotate Passwords:**

Change passwords every 3-6 months.

### **4. Monitor Usage:**

HiveMQ dashboard shows:

- Active connections
- Message rate
- Data usage
- Errors

---

## 🚀 Deployment Checklist

### **Backend (Vercel/Railway/etc):**

- [ ] `.env` updated with HiveMQ credentials
- [ ] `MQTT_BROKER_URL` uses `mqtts://` protocol
- [ ] Port is `8883`
- [ ] Username & password set
- [ ] Deployed successfully
- [ ] Logs show `✅ MQTT connected`

### **ESP32:**

- [ ] `MQTT_SERVER` updated to HiveMQ host
- [ ] `MQTT_PORT` is `8883`
- [ ] `MQTT_USER` & `MQTT_PASS` set
- [ ] `WiFiClientSecure` configured
- [ ] Code uploaded to ESP32
- [ ] Serial shows `✅ Connected!`
- [ ] Can receive test messages

### **HiveMQ Console:**

- [ ] 2 clients connected (backend + ESP32)
- [ ] No connection errors
- [ ] Messages visible in dashboard

---

## 🐛 Troubleshooting

### **Backend can't connect:**

**Error:** `ECONNREFUSED` or timeout

**Check:**

1. MQTT_BROKER_URL correct?
   ```
   ✅ mqtts://xxxxx.s1.eu.hivemq.cloud:8883
   ❌ mqtt://xxxxx.s1.eu.hivemq.cloud:1883
   ```
2. Username/password correct?
3. HiveMQ cluster running? (check console)
4. Firewall blocking port 8883?

### **ESP32 can't connect:**

**Error:** `rc=-2` (network error)

**Check:**

1. WiFi connected?
2. MQTT_SERVER is hostname (not IP)?
3. Port 8883?
4. `setInsecure()` called?

**Error:** `rc=5` (authentication failed)

**Check:**

1. Username/password correct?
2. Credentials exist in HiveMQ console?

### **Messages not received:**

**Check:**

1. Topic names exact match?
   - Case-sensitive: `vm/VM01/command` ≠ `vm/vm01/command`
2. Both clients connected?
3. Permissions correct in HiveMQ?

---

## 📊 Monitoring & Analytics

### **HiveMQ Dashboard:**

**Real-time metrics:**

- Active clients
- Messages/second
- Bandwidth usage
- Error rate

**Logs:**

- Connection events
- Disconnection reasons
- Authentication failures

**Alerts (paid plans):**

- Connection threshold
- Message rate anomaly
- Downtime alerts

---

## 🔄 Migration from Mosquitto to HiveMQ

### **Step 1: Keep Both Running**

During migration:

- Mosquitto for development/testing
- HiveMQ for production

### **Step 2: Update Environment Variables**

```bash
# Development (.env.local)
MQTT_BROKER_URL=mqtt://localhost:1883

# Production (.env)
MQTT_BROKER_URL=mqtts://xxxxx.hivemq.cloud:8883
```

### **Step 3: Test Thoroughly**

1. Test dengan HiveMQ di development
2. Deploy backend ke staging
3. Connect ESP32 ke HiveMQ
4. Full end-to-end test
5. Deploy to production

### **Step 4: Decommission Mosquitto**

Once stable, stop local Mosquitto.

---

## ✅ Summary

### **Why HiveMQ Cloud for Deployed Projects:**

✅ **No Infrastructure:** No VPS needed  
✅ **Public Access:** Backend & ESP32 can both connect  
✅ **Secure:** Built-in TLS/SSL  
✅ **Reliable:** 99.99% uptime  
✅ **Scalable:** Start free, pay as you grow  
✅ **Monitored:** Dashboard included  
✅ **Easy:** Setup in 5 minutes

### **When to use Mosquitto:**

- ✅ Local development
- ✅ On-premise deployment (semua di network yang sama)
- ✅ Learning/prototyping
- ❌ Production cloud deployment

### **When to use HiveMQ Cloud:**

- ✅ Production deployment (backend di cloud)
- ✅ ESP32 di lokasi fisik (remote)
- ✅ Need high availability
- ✅ Want managed service
- ✅ Multi-machine scaling

---

**Recommendation:** **Use HiveMQ Cloud for your deployed project!** 🚀
