// Test MQTT telemetry without ESP32 hardware
// This simulates ESP32 sending data via MQTT

const mqtt = require("mqtt");

const MQTT_BROKER =
  "mqtts://ea2c46e73c934196a8186c5d603ebff5.s1.eu.hivemq.cloud:8883";
const MQTT_USER = "vending-backend";
const MQTT_PASS = "Vending-backend123.";
const MACHINE_ID = "VM01";

console.log("🚀 Starting MQTT Telemetry Simulator...\n");
console.log("Connecting to HiveMQ Cloud...");

const client = mqtt.connect(MQTT_BROKER, {
  username: MQTT_USER,
  password: MQTT_PASS,
  protocol: "mqtts",
  port: 8883,
  rejectUnauthorized: true,
});

client.on("connect", () => {
  console.log("✅ Connected to MQTT Broker\n");
  console.log("📡 Publishing telemetry every 30 seconds...");
  console.log("Press Ctrl+C to stop\n");

  // Publish immediately
  publishTelemetry();

  // Then publish every 30 seconds
  setInterval(publishTelemetry, 30000);
});

client.on("error", (error) => {
  console.error("❌ MQTT Connection Error:", error.message);
});

client.on("close", () => {
  console.log("🔌 Disconnected from MQTT Broker");
});

function publishTelemetry() {
  // Simulate realistic sensor readings
  const baseTemp = 22.0; // Base temperature in medical range (15-25°C)
  const temp = baseTemp + (Math.random() * 2 - 1); // ±1°C variation

  const baseHumidity = 45.0; // Base humidity
  const humidity = baseHumidity + (Math.random() * 10 - 5); // ±5% variation

  const doorOpen = Math.random() > 0.95; // 5% chance door is open

  // Check alerts
  const tempAlert = temp < 15.0 || temp > 25.0;
  const humidityAlert = humidity > 70.0;

  const telemetryData = {
    machineId: MACHINE_ID,
    temperature: Math.round(temp * 10) / 10, // Round to 1 decimal
    humidity: Math.round(humidity * 10) / 10,
    doorOpen: doorOpen,
    tempAlert: tempAlert,
    humidityAlert: humidityAlert,
    rssi: -55 + Math.random() * 10, // WiFi signal strength
    uptime: Math.floor(Date.now() / 1000),
    freeHeap: 250000 + Math.floor(Math.random() * 50000),
    timestamp: Date.now(),
  };

  const topic = `vm/${MACHINE_ID}/telemetry`;

  client.publish(topic, JSON.stringify(telemetryData), (err) => {
    if (err) {
      console.error("❌ Publish failed:", err.message);
    } else {
      const now = new Date().toLocaleTimeString();
      console.log(`\n[${now}] 📤 Published to ${topic}:`);
      console.log(
        `   🌡️  Temperature: ${telemetryData.temperature}°C ${
          tempAlert ? "🚨 ALERT!" : "✅"
        }`
      );
      console.log(
        `   💧 Humidity: ${telemetryData.humidity}% ${
          humidityAlert ? "🚨 ALERT!" : "✅"
        }`
      );
      console.log(`   🚪 Door: ${doorOpen ? "OPEN ⚠️" : "CLOSED ✅"}`);
      console.log(`   📶 WiFi RSSI: ${telemetryData.rssi.toFixed(0)} dBm`);
    }
  });
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\n⏹️  Stopping simulator...");
  client.end();
  process.exit(0);
});
