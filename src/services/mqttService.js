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
      if (db.useSupabase) {
        // Supabase implementation
        const { supabase } = require("../config/supabase");

        // Store telemetry data
        await supabase.from("telemetry").insert({
          machine_id: machineId,
          data: data,
        });

        // Update machine last_seen
        await supabase
          .from("machines")
          .update({ last_seen: new Date().toISOString() })
          .eq("id", machineId);

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

              await supabase
                .from("slots")
                .update({ current_stock: estimatedStock })
                .eq("machine_id", machineId)
                .eq("slot_number", slot.id);
            }
          }
        }
      } else {
        // MySQL implementation
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

      console.log("🎰 Processing dispense result:", {
        orderId,
        slot,
        success,
        dropDetected,
        durationMs,
      });

      // Determine order status FIRST (before any database operations)
      // Note: For testing without physical sensor, we rely on success flag only
      // In production with sensor, change to: success && dropDetected
      let orderStatus = "FAILED";
      if (success) {
        orderStatus = "COMPLETED";
      }

      console.log("📊 Determined order status:", orderStatus);

      if (db.useSupabase) {
        // Supabase implementation
        const { supabase } = require("../config/supabase");

        console.log("💾 Updating dispense log...");
        // Update dispense log
        await supabase
          .from("dispense_logs")
          .update({
            completed_at: new Date().toISOString(),
            success: success,
            drop_detected: dropDetected,
            duration_ms: durationMs,
            error_message: errorMsg,
          })
          .eq("order_id", orderId)
          .eq("machine_id", machineId)
          .eq("slot_number", slot);

        console.log("✅ Dispense log updated");

        if (orderStatus === "COMPLETED") {
          console.log("🔄 Processing stock update...");
          // Get order details to update stock
          const { data: order, error: orderError } = await supabase
            .from("orders")
            .select("slot_id, quantity")
            .eq("id", orderId)
            .single();

          if (!orderError && order) {
            // Get current slot stock
            const { data: slotData, error: slotError } = await supabase
              .from("slots")
              .select("current_stock")
              .eq("id", order.slot_id)
              .eq("machine_id", machineId)
              .single();

            if (!slotError && slotData) {
              const quantityBefore = slotData.current_stock;
              const newStock = Math.max(0, quantityBefore - order.quantity);

              console.log("📦 Stock update:", {
                quantityBefore,
                quantityChange: -order.quantity,
                newStock,
              });

              // Update stock
              await supabase
                .from("slots")
                .update({ current_stock: newStock })
                .eq("id", order.slot_id)
                .eq("machine_id", machineId);

              // Log stock change
              await supabase.from("stock_logs").insert({
                machine_id: machineId,
                slot_id: order.slot_id,
                change_type: "DISPENSE",
                quantity_before: quantityBefore,
                quantity_after: newStock,
                quantity_change: -order.quantity,
                reason: `Order ${orderId}`,
              });

              console.log("✅ Stock updated successfully");
            }
          }
        }

        console.log("💾 Updating order status to:", orderStatus);
        // Update order status
        const updateData = { status: orderStatus };
        if (orderStatus === "COMPLETED") {
          updateData.dispensed_at = new Date().toISOString();
        }
        await supabase.from("orders").update(updateData).eq("id", orderId);
        console.log("✅ Order status updated");
      } else {
        // MySQL implementation
        // Update dispense log
        await db.query(
          `
          UPDATE dispense_logs 
          SET completed_at = NOW(), success = ?, drop_detected = ?, 
              duration_ms = ?, error_message = ?
          WHERE order_id = ? AND machine_id = ? AND slot_number = ?
        `,
          [
            success,
            dropDetected,
            durationMs,
            errorMsg,
            orderId,
            machineId,
            slot,
          ]
        );

        // Update order status
        // Note: For testing without physical sensor, we rely on success flag only
        // In production with sensor, change to: success && dropDetected
        let orderStatus = "FAILED";
        if (success) {
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
      }

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

      if (db.useSupabase) {
        // Supabase implementation
        const { supabase } = require("../config/supabase");

        // Get existing machine config
        const { data: machine, error: fetchError } = await supabase
          .from("machines")
          .select("config")
          .eq("id", machineId)
          .single();

        if (fetchError && fetchError.code !== "PGRST116") {
          console.error("Error fetching machine:", fetchError);
          return;
        }

        // Merge existing config with new data
        const existingConfig = machine?.config || {};
        const updatedConfig = {
          ...existingConfig,
          rssi: rssi || existingConfig.rssi,
          firmware: fw || existingConfig.firmware,
          door: door || existingConfig.door,
        };

        // Update machine status
        const { error: updateError } = await supabase
          .from("machines")
          .update({
            status: machineStatus,
            last_seen: new Date().toISOString(),
            config: updatedConfig,
          })
          .eq("id", machineId);

        if (updateError) {
          console.error("Error updating machine status:", updateError);
        }
      } else {
        // MySQL implementation
        await db.query(
          `
          UPDATE machines 
          SET status = ?, last_seen = NOW(), 
              config = JSON_SET(COALESCE(config, '{}'), '$.rssi', ?, '$.firmware', ?, '$.door', ?)
          WHERE id = ?
        `,
          [machineStatus, rssi, fw, door, machineId]
        );
      }
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
