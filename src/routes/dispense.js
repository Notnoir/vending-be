const express = require("express");
const { body, validationResult } = require("express-validator");
const db = require("../config/database");
const { supabase } = require("../config/supabase");
const mqttService = require("../services/mqttService");

const USE_SUPABASE = process.env.USE_SUPABASE === "true";

const router = express.Router();

// Validate dispense request
const validateDispense = [
  body("order_id").notEmpty().withMessage("Order ID is required"),
  body("slot_number")
    .isInt({ min: 1 })
    .withMessage("Valid slot number is required"),
  body("success").isBoolean().withMessage("Success status is required"),
  body("drop_detected").optional().isBoolean(),
  body("duration_ms").optional().isInt({ min: 0 }),
  body("error_message").optional().isString(),
];

// Trigger dispense (called by Pi after payment confirmation)
router.post("/trigger", async (req, res) => {
  try {
    const { order_id } = req.body;

    console.log("🎰 ========== DISPENSE TRIGGER START ==========");
    console.log("🎰 Order ID:", order_id);

    if (!order_id) {
      console.log("❌ No order_id provided");
      return res.status(400).json({
        error: "Order ID is required",
      });
    }

    let orderInfo;

    if (USE_SUPABASE) {
      console.log("🔍 Fetching order from Supabase...");
      // Supabase: Get order with slot details
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          *,
          slot:slots (
            slot_number,
            motor_duration_ms
          )
        `
        )
        .eq("id", order_id)
        .eq("status", "PAID")
        .single();

      console.log("📊 Supabase query result:", { data, error });

      if (error || !data) {
        console.log("❌ Order not found or not PAID status");

        // Check if order exists with different status
        const { data: anyOrder, error: checkError } = await supabase
          .from("orders")
          .select("id, status")
          .eq("id", order_id)
          .single();

        console.log("🔍 Order check result:", { anyOrder, checkError });

        if (anyOrder) {
          console.log(`⚠️ Order exists but status is: ${anyOrder.status}`);
          return res.status(400).json({
            error: `Order status is ${anyOrder.status}, not PAID`,
            order_id,
            status: anyOrder.status,
          });
        }

        return res.status(404).json({
          error: "Order not found or not paid",
        });
      }

      orderInfo = {
        ...data,
        slot_number: data.slot.slot_number,
        motor_duration_ms: data.slot.motor_duration_ms,
      };

      console.log("✅ Order found:", {
        order_id: orderInfo.id,
        status: orderInfo.status,
        machine_id: orderInfo.machine_id,
        slot_number: orderInfo.slot_number,
        motor_duration_ms: orderInfo.motor_duration_ms,
      });
    } else {
      console.log("🔍 Fetching order from MySQL...");
      // MySQL: Get order details
      const order = await db.query(
        `
        SELECT o.*, s.slot_number, s.motor_duration_ms
        FROM orders o
        JOIN slots s ON o.slot_id = s.id
        WHERE o.id = ? AND o.status = 'PAID'
      `,
        [order_id]
      );

      console.log("📊 MySQL query result:", order);

      if (order.length === 0) {
        console.log("❌ Order not found or not PAID status");
        return res.status(404).json({
          error: "Order not found or not paid",
        });
      }

      orderInfo = order[0];
      console.log("✅ Order found:", orderInfo);
    }

    console.log("📝 Updating order status to DISPENSING...");
    if (USE_SUPABASE) {
      // Supabase: Update order status to dispensing
      const { error: updateError } = await supabase
        .from("orders")
        .update({ status: "DISPENSING" })
        .eq("id", order_id);

      if (updateError) {
        console.error("❌ Failed to update order status:", updateError);
      } else {
        console.log("✅ Order status updated to DISPENSING");
      }

      // Supabase: Create dispense log
      console.log("📝 Creating dispense log...");
      const { error: logError } = await supabase.from("dispense_logs").insert({
        order_id: order_id,
        machine_id: orderInfo.machine_id,
        slot_number: orderInfo.slot_number,
        command_sent_at: new Date().toISOString(),
      });

      if (logError) {
        console.error("❌ Failed to create dispense log:", logError);
      } else {
        console.log("✅ Dispense log created");
      }
    } else {
      // MySQL: Update order status to dispensing
      await db.query(
        `
        UPDATE orders SET status = 'DISPENSING' WHERE id = ?
      `,
        [order_id]
      );

      // MySQL: Create dispense log
      await db.query(
        `
        INSERT INTO dispense_logs (order_id, machine_id, slot_number, command_sent_at)
        VALUES (?, ?, ?, NOW())
      `,
        [order_id, orderInfo.machine_id, orderInfo.slot_number]
      );
    }

    // Here you would send MQTT command to ESP32
    const dispenseCommand = {
      cmd: "dispense",
      slot: orderInfo.slot_number,
      orderId: order_id,
      timeoutMs: orderInfo.motor_duration_ms || 2150,
    };

    console.log("📡 Preparing to send MQTT command...");
    console.log(
      "📡 Dispense command:",
      JSON.stringify(dispenseCommand, null, 2)
    );
    console.log("📡 Target machine ID:", orderInfo.machine_id);
    console.log("📡 MQTT service connected:", mqttService.isConnected);

    // Send MQTT command to ESP32
    const mqttSent = mqttService.publishDispenseCommand(
      orderInfo.machine_id,
      dispenseCommand
    );

    console.log("📡 MQTT publish result:", mqttSent);

    if (!mqttSent) {
      console.error("❌ MQTT not connected, dispense command not sent");
      console.error("❌ MQTT service state:", {
        isConnected: mqttService.isConnected,
        hasClient: !!mqttService.client,
      });

      // Update order status to PENDING_DISPENSE if MQTT failed
      if (USE_SUPABASE) {
        await supabase
          .from("orders")
          .update({ status: "PENDING_DISPENSE" })
          .eq("id", order_id);
      } else {
        await db.query(
          `UPDATE orders SET status = 'PENDING_DISPENSE' WHERE id = ?`,
          [order_id]
        );
      }

      return res.status(503).json({
        error: "MQTT service unavailable",
        message: "Dispense command could not be sent. Please retry later.",
        order_id,
      });
    }

    console.log("✅ ========== DISPENSE TRIGGER SUCCESS ==========");
    res.json({
      order_id,
      slot_number: orderInfo.slot_number,
      command: dispenseCommand,
      status: "DISPENSING",
      message: "Dispense command sent successfully",
    });
  } catch (error) {
    console.error("Trigger dispense error:", error);
    res.status(500).json({
      error: "Failed to trigger dispense",
    });
  }
});

// Confirm dispense result (called by ESP32 via Pi)
router.post("/confirm", validateDispense, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array(),
      });
    }

    const {
      order_id,
      slot_number,
      success,
      drop_detected = false,
      duration_ms,
      error_message,
    } = req.body;

    const now = new Date().toISOString();

    if (USE_SUPABASE) {
      // Supabase: Update dispense log
      await supabase
        .from("dispense_logs")
        .update({
          completed_at: now,
          success: success,
          drop_detected: drop_detected,
          duration_ms: duration_ms,
          error_message: error_message,
        })
        .eq("order_id", order_id)
        .eq("slot_number", slot_number);
    } else {
      // MySQL: Update dispense log
      await db.query(
        `
        UPDATE dispense_logs 
        SET completed_at = NOW(), success = ?, drop_detected = ?, 
            duration_ms = ?, error_message = ?
        WHERE order_id = ? AND slot_number = ?
      `,
        [
          success,
          drop_detected,
          duration_ms,
          error_message,
          order_id,
          slot_number,
        ]
      );
    }

    let order_status = "FAILED";
    if (success && drop_detected) {
      order_status = "COMPLETED";

      if (USE_SUPABASE) {
        // Supabase: Get order and slot info
        const { data: orderData } = await supabase
          .from("orders")
          .select("*, slot:slots(*)")
          .eq("id", order_id)
          .single();

        if (orderData) {
          const slot = orderData.slot;
          const oldStock = slot.current_stock;
          const newStock = oldStock - orderData.quantity;

          // Update stock
          await supabase
            .from("slots")
            .update({ current_stock: newStock })
            .eq("id", orderData.slot_id);

          // Log stock change
          await supabase.from("stock_logs").insert({
            machine_id: orderData.machine_id,
            slot_id: orderData.slot_id,
            change_type: "DISPENSE",
            quantity_before: oldStock,
            quantity_after: newStock,
            quantity_change: -orderData.quantity,
            reason: `Order ${orderData.id}`,
            created_at: now,
          });
        }
      } else {
        // MySQL: Update stock
        await db.query(
          `
          UPDATE slots s
          JOIN orders o ON s.id = o.slot_id
          SET s.current_stock = s.current_stock - o.quantity
          WHERE o.id = ?
        `,
          [order_id]
        );

        // MySQL: Log stock change
        await db.query(
          `
          INSERT INTO stock_logs (machine_id, slot_id, change_type, quantity_before, quantity_after, quantity_change, reason)
          SELECT o.machine_id, o.slot_id, 'DISPENSE', s.current_stock + o.quantity, s.current_stock, -o.quantity, CONCAT('Order ', o.id)
          FROM orders o
          JOIN slots s ON o.slot_id = s.id
          WHERE o.id = ?
        `,
          [order_id]
        );
      }
    } else if (!success && error_message) {
      // If dispense failed, we might want to retry or refund
      console.log(`❌ Dispense failed for order ${order_id}: ${error_message}`);
    }

    if (USE_SUPABASE) {
      // Supabase: Update order status
      const orderUpdate = { status: order_status };
      if (order_status === "COMPLETED") {
        orderUpdate.dispensed_at = now;
      }
      await supabase.from("orders").update(orderUpdate).eq("id", order_id);
    } else {
      // MySQL: Update order status
      await db.query(
        `
        UPDATE orders 
        SET status = ?, dispensed_at = ${
          order_status === "COMPLETED" ? "NOW()" : "NULL"
        }
        WHERE id = ?
      `,
        [order_status, order_id]
      );
    }

    res.json({
      order_id,
      status: order_status,
      success,
      drop_detected,
      duration_ms,
      message: success ? "Dispense completed successfully" : "Dispense failed",
    });
  } catch (error) {
    console.error("Confirm dispense error:", error);
    res.status(500).json({
      error: "Failed to confirm dispense",
    });
  }
});

// Get dispense logs
router.get("/logs/:machine_id", async (req, res) => {
  try {
    const { machine_id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const logs = await db.query(
      `
      SELECT dl.*, o.total_amount, p.name as product_name
      FROM dispense_logs dl
      LEFT JOIN orders o ON dl.order_id = o.id
      LEFT JOIN products p ON o.product_id = p.id
      WHERE dl.machine_id = ?
      ORDER BY dl.command_sent_at DESC
      LIMIT ? OFFSET ?
    `,
      [machine_id, parseInt(limit), parseInt(offset)]
    );

    res.json({
      logs,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error("Get dispense logs error:", error);
    res.status(500).json({
      error: "Failed to get dispense logs",
    });
  }
});

// Get current dispense status
router.get("/status/:order_id", async (req, res) => {
  try {
    const { order_id } = req.params;

    const status = await db.query(
      `
      SELECT dl.*, o.status as order_status
      FROM dispense_logs dl
      JOIN orders o ON dl.order_id = o.id
      WHERE dl.order_id = ?
      ORDER BY dl.command_sent_at DESC
      LIMIT 1
    `,
      [order_id]
    );

    if (status.length === 0) {
      return res.status(404).json({
        error: "Dispense status not found",
      });
    }

    res.json(status[0]);
  } catch (error) {
    console.error("Get dispense status error:", error);
    res.status(500).json({
      error: "Failed to get dispense status",
    });
  }
});

module.exports = router;
