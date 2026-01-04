// Test script to simulate ESP32 sending telemetry data
const axios = require("axios");

const API_URL = process.env.API_URL || "http://localhost:3001/api";

async function sendTelemetry() {
  try {
    const telemetryData = {
      machine_id: "VM01",
      data: {
        temperature: 22.5 + (Math.random() * 2 - 1), // Random between 21.5 - 23.5
        humidity: 45 + (Math.random() * 10 - 5), // Random between 40 - 50
        door_open: Math.random() > 0.9, // 10% chance door is open
        wifi_signal: -55 + Math.random() * 10, // Random signal strength
        timestamp: new Date().toISOString(),
      },
    };

    console.log("Sending telemetry:", JSON.stringify(telemetryData, null, 2));

    const response = await axios.post(`${API_URL}/telemetry`, telemetryData, {
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
    });

    console.log("✅ Success:", response.data);
  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

// Send telemetry every 30 seconds
console.log("Starting telemetry simulation...");
console.log(`API URL: ${API_URL}`);
console.log("Press Ctrl+C to stop\n");

sendTelemetry(); // Send immediately

const interval = setInterval(sendTelemetry, 30000); // Then every 30 seconds

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\nStopping telemetry simulation...");
  clearInterval(interval);
  process.exit(0);
});
