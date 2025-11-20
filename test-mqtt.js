#!/usr/bin/env node

/**
 * MQTT Testing Script
 *
 * This script helps you test MQTT integration without needing actual ESP32 hardware.
 *
 * Usage:
 *   node test-mqtt.js subscribe    # Subscribe to all topics
 *   node test-mqtt.js publish      # Publish test message
 *   node test-mqtt.js simulate     # Simulate ESP32 dispense result
 */

const mqtt = require("mqtt");
require("dotenv").config();

const BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
const MACHINE_ID = process.env.MACHINE_ID || "VM01";
const USERNAME = process.env.MQTT_USERNAME;
const PASSWORD = process.env.MQTT_PASSWORD;

const options = {
  username: USERNAME,
  password: PASSWORD,
};

const client = mqtt.connect(BROKER_URL, options);

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

function log(color, prefix, message) {
  console.log(`${color}${prefix}${colors.reset} ${message}`);
}

client.on("connect", () => {
  log(colors.green, "✅", `Connected to MQTT broker: ${BROKER_URL}`);

  const command = process.argv[2] || "help";

  switch (command) {
    case "subscribe":
      subscribeAll();
      break;
    case "publish":
      publishTest();
      break;
    case "simulate":
      simulateDispenseResult();
      break;
    case "help":
    default:
      showHelp();
      client.end();
      break;
  }
});

client.on("error", (error) => {
  log(colors.red, "❌", `MQTT Error: ${error.message}`);
  process.exit(1);
});

client.on("message", (topic, message) => {
  log(colors.cyan, "📥", `Message received on ${topic}:`);
  try {
    const data = JSON.parse(message.toString());
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.log(message.toString());
  }
  console.log();
});

function subscribeAll() {
  const topics = [
    `vm/${MACHINE_ID}/command`,
    `vm/${MACHINE_ID}/config`,
    `vm/${MACHINE_ID}/dispense_result`,
    `vm/${MACHINE_ID}/telemetry`,
    `vm/${MACHINE_ID}/status`,
  ];

  topics.forEach((topic) => {
    client.subscribe(topic, (err) => {
      if (err) {
        log(
          colors.red,
          "❌",
          `Failed to subscribe to ${topic}: ${err.message}`
        );
      } else {
        log(colors.blue, "📡", `Subscribed to ${topic}`);
      }
    });
  });

  log(colors.yellow, "⏳", "Listening for messages... (Press Ctrl+C to exit)");
}

function publishTest() {
  const topic = `vm/${MACHINE_ID}/telemetry`;
  const message = {
    timestamp: new Date().toISOString(),
    slots: [
      { id: 1, level: "FULL" },
      { id: 2, level: "MEDIUM" },
      { id: 3, level: "LOW" },
    ],
    temperature: 25.5,
    door: "CLOSED",
  };

  client.publish(topic, JSON.stringify(message), { qos: 1 }, (err) => {
    if (err) {
      log(colors.red, "❌", `Failed to publish: ${err.message}`);
    } else {
      log(colors.green, "📤", `Published test telemetry to ${topic}`);
      console.log(JSON.stringify(message, null, 2));
    }

    setTimeout(() => {
      client.end();
      process.exit(0);
    }, 1000);
  });
}

function simulateDispenseResult() {
  const orderId = process.argv[3] || `TEST-${Date.now()}`;
  const topic = `vm/${MACHINE_ID}/dispense_result`;

  const message = {
    orderId: orderId,
    slot: 1,
    success: true,
    dropDetected: true,
    durationMs: 1850,
    error: null,
  };

  log(colors.yellow, "🎰", `Simulating dispense result for order: ${orderId}`);

  client.publish(topic, JSON.stringify(message), { qos: 1 }, (err) => {
    if (err) {
      log(colors.red, "❌", `Failed to publish: ${err.message}`);
    } else {
      log(colors.green, "📤", `Published dispense result to ${topic}`);
      console.log(JSON.stringify(message, null, 2));
      log(
        colors.cyan,
        "💡",
        "Backend should now update the order status in database"
      );
    }

    setTimeout(() => {
      client.end();
      process.exit(0);
    }, 1000);
  });
}

function showHelp() {
  console.log(`
${colors.bright}MQTT Testing Script${colors.reset}

${colors.green}Usage:${colors.reset}
  node test-mqtt.js <command> [options]

${colors.green}Commands:${colors.reset}
  ${colors.cyan}subscribe${colors.reset}
    Subscribe to all MQTT topics and display incoming messages
    Example: node test-mqtt.js subscribe

  ${colors.cyan}publish${colors.reset}
    Publish a test telemetry message
    Example: node test-mqtt.js publish

  ${colors.cyan}simulate [orderId]${colors.reset}
    Simulate ESP32 sending a dispense result
    Example: node test-mqtt.js simulate ORD123456
    Example: node test-mqtt.js simulate (auto-generates order ID)

  ${colors.cyan}help${colors.reset}
    Show this help message

${colors.green}Configuration:${colors.reset}
  Broker:    ${BROKER_URL}
  Machine:   ${MACHINE_ID}
  Username:  ${USERNAME || "(anonymous)"}

${colors.green}Topics:${colors.reset}
  Command:   vm/${MACHINE_ID}/command       ${colors.yellow}(Backend → ESP32)${
    colors.reset
  }
  Config:    vm/${MACHINE_ID}/config        ${colors.yellow}(Backend → ESP32)${
    colors.reset
  }
  Result:    vm/${MACHINE_ID}/dispense_result ${
    colors.yellow
  }(ESP32 → Backend)${colors.reset}
  Telemetry: vm/${MACHINE_ID}/telemetry     ${colors.yellow}(ESP32 → Backend)${
    colors.reset
  }
  Status:    vm/${MACHINE_ID}/status        ${colors.yellow}(ESP32 → Backend)${
    colors.reset
  }

${colors.green}Testing Flow:${colors.reset}
  1. Start backend: ${colors.cyan}npm run dev${colors.reset}
  2. Subscribe:     ${colors.cyan}node test-mqtt.js subscribe${colors.reset}
  3. Trigger order via API
  4. Simulate ESP32: ${colors.cyan}node test-mqtt.js simulate <orderId>${
    colors.reset
  }

`);
}
