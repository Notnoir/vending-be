const express = require("express");
const db = require("../config/database");
const { supabase } = require("../config/supabase");

const router = express.Router();
const USE_SUPABASE = process.env.USE_SUPABASE === "true";

// Payment webhook endpoint (for payment gateway)
router.post("/webhook", async (req, res) => {
  try {
    console.log("Payment webhook received:", req.body);

    // This is a mock implementation - replace with actual payment gateway validation
    const {
      order_id,
      transaction_status,
      transaction_id,
      payment_type,
      gross_amount,
      signature_key, // Validate this in production
    } = req.body;

    if (!order_id || !transaction_status) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }

    // Validate signature (implement actual validation based on your payment gateway)
    // const isValidSignature = validateSignature(req.body);
    // if (!isValidSignature) {
    //   return res.status(401).json({ error: 'Invalid signature' });
    // }

    // Update payment status
    let payment_status;
    let order_status;

    switch (transaction_status) {
      case "capture":
      case "settlement":
        payment_status = "SUCCESS";
        order_status = "PAID";
        break;
      case "pending":
        payment_status = "PENDING";
        order_status = "PENDING";
        break;
      case "deny":
      case "cancel":
      case "expire":
        payment_status = "FAILED";
        order_status = "FAILED";
        break;
      default:
        payment_status = "PENDING";
        order_status = "PENDING";
    }

    if (USE_SUPABASE) {
      // === SUPABASE IMPLEMENTATION ===
      // Update payment record
      const { error: paymentError } = await supabase
        .from("payments")
        .update({
          status: payment_status,
          gateway_transaction_id: transaction_id,
          payment_type: payment_type,
          raw_response: req.body,
          processed_at: new Date().toISOString(),
        })
        .eq("order_id", order_id);

      if (paymentError) {
        console.error("Payment update error:", paymentError);
      }

      // Update order status
      const updateData = {
        status: order_status,
      };

      if (payment_status === "SUCCESS") {
        updateData.paid_at = new Date().toISOString();
      }

      const { error: orderError } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", order_id);

      if (orderError) {
        console.error("Order update error:", orderError);
      }
    } else {
      // === MYSQL IMPLEMENTATION ===
      await db.transaction(async (connection) => {
        // Update payment record
        await connection.execute(
          `
          UPDATE payments 
          SET status = ?, gateway_transaction_id = ?, payment_type = ?, 
              raw_response = ?, processed_at = NOW()
          WHERE order_id = ?
        `,
          [
            payment_status,
            transaction_id,
            payment_type,
            JSON.stringify(req.body),
            order_id,
          ]
        );

        // Update order status
        const paid_at = payment_status === "SUCCESS" ? "NOW()" : "NULL";
        await connection.execute(
          `
          UPDATE orders 
          SET status = ?, paid_at = ${paid_at}
          WHERE id = ?
        `,
          [order_status, order_id]
        );
      });
    }

    // If payment successful, trigger dispense process
    if (payment_status === "SUCCESS") {
      // Here you would trigger MQTT message to Pi/ESP32
      // This will be implemented in the MQTT service
      console.log(
        `💰 Payment successful for order ${order_id} - triggering dispense`
      );
    }

    res.json({
      status: "OK",
      message: "Webhook processed successfully",
    });
  } catch (error) {
    console.error("Payment webhook error:", error);
    res.status(500).json({
      error: "Failed to process webhook",
    });
  }
});

// Manual payment verification (for testing)
router.post("/verify/:order_id", async (req, res) => {
  try {
    const { order_id } = req.params;
    const { status = "SUCCESS" } = req.body;

    let order;

    if (USE_SUPABASE) {
      // Supabase: Check if order exists
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", order_id)
        .single();

      if (error || !data) {
        return res.status(404).json({
          error: "Order not found",
        });
      }
      order = data;
    } else {
      // MySQL: Check if order exists
      const result = await db.query("SELECT * FROM orders WHERE id = ?", [
        order_id,
      ]);
      if (result.length === 0) {
        return res.status(404).json({
          error: "Order not found",
        });
      }
      order = result[0];
    }

    if (order.status !== "PENDING" && order.status !== "PAID") {
      return res.status(400).json({
        error: "Order is not in pending or paid status",
        current_status: order.status,
      });
    }

    // If already PAID, just return success (idempotent)
    if (order.status === "PAID") {
      return res.json({
        success: true,
        message: "Order already verified and paid",
        order_id,
        status: "PAID",
      });
    }

    const payment_status = status === "SUCCESS" ? "SUCCESS" : "FAILED";
    const order_status = status === "SUCCESS" ? "PAID" : "FAILED";

    if (USE_SUPABASE) {
      // Supabase: Update payment and order
      const now = new Date().toISOString();

      // Update payment
      await supabase
        .from("payments")
        .update({
          status: payment_status,
          processed_at: now,
        })
        .eq("order_id", order_id);

      // Update order
      const orderUpdate = {
        status: order_status,
      };
      if (payment_status === "SUCCESS") {
        orderUpdate.paid_at = now;
      }

      await supabase.from("orders").update(orderUpdate).eq("id", order_id);
    } else {
      // MySQL: Use transaction
      await db.transaction(async (connection) => {
        await connection.execute(
          `
        UPDATE payments 
        SET status = ?, processed_at = NOW()
        WHERE order_id = ?
      `,
          [payment_status, order_id]
        );

        const paid_at = payment_status === "SUCCESS" ? "NOW()" : "NULL";
        await connection.execute(
          `
        UPDATE orders 
        SET status = ?, paid_at = ${paid_at}
        WHERE id = ?
      `,
          [order_status, order_id]
        );
      });
    }

    res.json({
      order_id,
      status: order_status,
      message: `Payment ${status.toLowerCase()} processed`,
    });
  } catch (error) {
    console.error("Payment verification error:", error);
    res.status(500).json({
      error: "Failed to verify payment",
    });
  }
});

// Get payment details
router.get("/:order_id", async (req, res) => {
  try {
    const { order_id } = req.params;

    let payment;

    if (USE_SUPABASE) {
      // Supabase: Get payment with order details
      const { data, error } = await supabase
        .from("payments")
        .select(
          `
          *,
          order:orders (
            total_amount,
            status
          )
        `
        )
        .eq("order_id", order_id)
        .single();

      if (error || !data) {
        return res.status(404).json({
          error: "Payment not found",
        });
      }

      // Flatten the response
      payment = {
        ...data,
        order_amount: data.order.total_amount,
        order_status: data.order.status,
      };
      delete payment.order;
    } else {
      // MySQL: Get payment with join
      const result = await db.query(
        `
        SELECT p.*, o.total_amount as order_amount, o.status as order_status
        FROM payments p
        JOIN orders o ON p.order_id = o.id
        WHERE p.order_id = ?
      `,
        [order_id]
      );

      if (result.length === 0) {
        return res.status(404).json({
          error: "Payment not found",
        });
      }

      payment = result[0];
    }

    res.json(payment);
  } catch (error) {
    console.error("Get payment error:", error);
    res.status(500).json({
      error: "Failed to get payment details",
    });
  }
});

module.exports = router;
