const express = require("express");
const { body, validationResult } = require("express-validator");
const db = require("../config/database");
// const mqttService = require("../services/mqttService"); // Disabled for now

// Mock MQTT service for testing
const mockMqttService = {
  publishDispenseCommand: () => {
    return { success: true, message: "Mock dispensing command sent" };
  }
};

const router = express.Router();

// MQTT service will be implemented here
// For now, we'll create a mock dispense system

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

    if (!order_id) {
      return res.status(400).json({
        error: "Order ID is required",
      });
    }

    // Get order details
    const order = await db.query(
      `
      SELECT o.*, s.slot_number, s.motor_duration_ms
      FROM orders o
      JOIN slots s ON o.slot_id = s.id
      WHERE o.id = ? AND o.status = 'PAID'
    `,
      [order_id]
    );

    if (order.length === 0) {
      return res.status(404).json({
        error: "Order not found or not paid",
      });
    }

    const orderInfo = order[0];

    // Update order status to dispensing
    await db.query(
      `
      UPDATE orders SET status = 'DISPENSING' WHERE id = ?
    `,
      [order_id]
    );

    // Create dispense log
    await db.query(
      `
      INSERT INTO dispense_logs (order_id, machine_id, slot_number, command_sent_at)
      VALUES (?, ?, ?, NOW())
    `,
      [order_id, orderInfo.machine_id, orderInfo.slot_number]
    );

    // Here you would send MQTT command to ESP32
    const dispenseCommand = {
      cmd: "dispense",
      slot: orderInfo.slot_number,
      orderId: order_id,
      timeoutMs: orderInfo.motor_duration_ms || 1500,
    };

    console.log("🎰 Sending dispense command:", dispenseCommand);

    // Send MQTT command to ESP32 (using mock for testing)
    const mqttSent = mockMqttService.publishDispenseCommand(
      orderInfo.machine_id,
      dispenseCommand
    );

    if (!mqttSent) {
      console.warn("⚠️  MQTT not available, dispense command not sent");
    }

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

    // Update dispense log
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

    let order_status = "FAILED";
    if (success && drop_detected) {
      order_status = "COMPLETED";

      // Update stock
      await db.query(
        `
        UPDATE slots s
        JOIN orders o ON s.id = o.slot_id
        SET s.current_stock = s.current_stock - o.quantity
        WHERE o.id = ?
      `,
        [order_id]
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
        [order_id]
      );
    } else if (!success && error_message) {
      // If dispense failed, we might want to retry or refund
      console.log(`❌ Dispense failed for order ${order_id}: ${error_message}`);
    }

    // Update order status
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
