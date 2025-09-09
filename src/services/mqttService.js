const mqtt = require("mqtt");
const db = require("../config/database");

class MqttService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.subscriptions = new Map();
    this.init();
  }

  async init() {
    try {
      const brokerUrl = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
      const options = {
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
        reconnectPeriod: 5000,
        keepalive: 60,
      };

      this.client = mqtt.connect(brokerUrl, options);

      this.client.on("connect", () => {
        console.log("✅ MQTT connected to broker");
        this.isConnected = true;
        this.setupSubscriptions();
      });

      this.client.on("error", (error) => {
        console.error("❌ MQTT connection error:", error);
        this.isConnected = false;
      });

      this.client.on("disconnect", () => {
        console.log("🔌 MQTT disconnected");
        this.isConnected = false;
      });

      this.client.on("message", (topic, message) => {
        this.handleMessage(topic, message);
      });
    } catch (error) {
      console.error("MQTT initialization error:", error);
    }
  }

  setupSubscriptions() {
    const machineId = process.env.MACHINE_ID || "VM01";

    // Subscribe to topics
    const topics = [
      `vm/${machineId}/telemetry`,
      `vm/${machineId}/dispense_result`,
      `vm/${machineId}/status`,
    ];

    topics.forEach((topic) => {
      this.client.subscribe(topic, (err) => {
        if (err) {
          console.error(`Failed to subscribe to ${topic}:`, err);
        } else {
          console.log(`📡 Subscribed to ${topic}`);
        }
      });
    });
  }

  async handleMessage(topic, message) {
    try {
      const data = JSON.parse(message.toString());
      const topicParts = topic.split("/");
      const machineId = topicParts[1];
      const messageType = topicParts[2];

      console.log(`📥 MQTT message received [${topic}]:`, data);

      switch (messageType) {
        case "telemetry":
          await this.handleTelemetry(machineId, data);
          break;
        case "dispense_result":
          await this.handleDispenseResult(machineId, data);
          break;
        case "status":
          await this.handleStatusUpdate(machineId, data);
          break;
        default:
          console.log(`Unknown message type: ${messageType}`);
      }
    } catch (error) {
      console.error("Error handling MQTT message:", error);
    }
  }

  async handleTelemetry(machineId, data) {
    try {
      // Store telemetry data
      await db.query(
        `
        INSERT INTO telemetry (machine_id, data)
        VALUES (?, ?)
      `,
        [machineId, JSON.stringify(data)]
      );

      // Update machine last_seen
      await db.query(
        `
        UPDATE machines SET last_seen = NOW() WHERE id = ?
      `,
        [machineId]
      );

      // Process slot levels if provided
      if (data.slots && Array.isArray(data.slots)) {
        for (const slot of data.slots) {
          if (slot.id && slot.level) {
            // Update slot stock based on sensor reading
            let estimatedStock = 0;
            switch (slot.level.toUpperCase()) {
              case "FULL":
                estimatedStock = 10;
                break;
              case "HIGH":
                estimatedStock = 8;
                break;
              case "MEDIUM":
                estimatedStock = 5;
                break;
              case "LOW":
                estimatedStock = 2;
                break;
              case "EMPTY":
                estimatedStock = 0;
                break;
            }

            await db.query(
              `
              UPDATE slots 
              SET current_stock = ?
              WHERE machine_id = ? AND slot_number = ?
            `,
              [estimatedStock, machineId, slot.id]
            );
          }
        }
      }
    } catch (error) {
      console.error("Error handling telemetry:", error);
    }
  }

  async handleDispenseResult(machineId, data) {
    try {
      const {
        orderId,
        slot,
        success,
        dropDetected,
        durationMs,
        error: errorMsg,
      } = data;

      // Update dispense log
      await db.query(
        `
        UPDATE dispense_logs 
        SET completed_at = NOW(), success = ?, drop_detected = ?, 
            duration_ms = ?, error_message = ?
        WHERE order_id = ? AND machine_id = ? AND slot_number = ?
      `,
        [success, dropDetected, durationMs, errorMsg, orderId, machineId, slot]
      );

      // Update order status
      let orderStatus = "FAILED";
      if (success && dropDetected) {
        orderStatus = "COMPLETED";

        // Update stock
        await db.query(
          `
          UPDATE slots s
          JOIN orders o ON s.id = o.slot_id
          SET s.current_stock = GREATEST(0, s.current_stock - o.quantity)
          WHERE o.id = ? AND s.machine_id = ?
        `,
          [orderId, machineId]
        );

        // Log stock change
        await db.query(
          `
          INSERT INTO stock_logs (machine_id, slot_id, change_type, quantity_before, quantity_after, quantity_change, reason)
          SELECT o.machine_id, o.slot_id, 'DISPENSE', s.current_stock + o.quantity, s.current_stock, -o.quantity, CONCAT('Order ', o.id)
          FROM orders o
          JOIN slots s ON o.slot_id = s.id
          WHERE o.id = ?
        `,
          [orderId]
        );
      }

      await db.query(
        `
        UPDATE orders 
        SET status = ?, dispensed_at = ${
          orderStatus === "COMPLETED" ? "NOW()" : "NULL"
        }
        WHERE id = ?
      `,
        [orderStatus, orderId]
      );

      console.log(
        `🎰 Dispense result processed: Order ${orderId} - ${orderStatus}`
      );
    } catch (error) {
      console.error("Error handling dispense result:", error);
    }
  }

  async handleStatusUpdate(machineId, data) {
    try {
      const { status, door, rssi, fw } = data;

      let machineStatus = "ONLINE";
      if (status === "OFFLINE" || status === "MAINTENANCE") {
        machineStatus = status;
      }

      // Update machine status
      await db.query(
        `
        UPDATE machines 
        SET status = ?, last_seen = NOW(), 
            config = JSON_SET(COALESCE(config, '{}'), '$.rssi', ?, '$.firmware', ?, '$.door', ?)
        WHERE id = ?
      `,
        [machineStatus, rssi, fw, door, machineId]
      );
    } catch (error) {
      console.error("Error handling status update:", error);
    }
  }

  publishDispenseCommand(machineId, command) {
    if (!this.isConnected) {
      console.error("MQTT not connected, cannot send dispense command");
      return false;
    }

    const topic = `vm/${machineId}/command`;
    const message = JSON.stringify(command);

    this.client.publish(topic, message, { qos: 1 }, (err) => {
      if (err) {
        console.error("Failed to publish dispense command:", err);
      } else {
        console.log(`📤 Dispense command sent to ${topic}:`, command);
      }
    });

    return true;
  }

  publishConfigUpdate(machineId, config) {
    if (!this.isConnected) {
      console.error("MQTT not connected, cannot send config update");
      return false;
    }

    const topic = `vm/${machineId}/config`;
    const message = JSON.stringify(config);

    this.client.publish(topic, message, { qos: 1 }, (err) => {
      if (err) {
        console.error("Failed to publish config update:", err);
      } else {
        console.log(`📤 Config update sent to ${topic}:`, config);
      }
    });

    return true;
  }

  close() {
    if (this.client) {
      this.client.end();
      console.log("MQTT connection closed");
    }
  }
}

module.exports = new MqttService();
