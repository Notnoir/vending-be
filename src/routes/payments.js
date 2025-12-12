const express = require("express");
const axios = require("axios");
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
      // Trigger dispense via internal API call
      console.log(
        `💰 Payment successful for order ${order_id} - triggering dispense`
      );

      try {
        // Check if this is a multi-item order
        let hasMultipleItems = false;
        let itemCount = 0;
        
        if (USE_SUPABASE) {
          const { data: items, error } = await supabase
            .from("order_items")
            .select("*")
            .eq("order_id", order_id);
          
          console.log(`🔍 Supabase order_items query result:`, {
            itemsFound: items?.length || 0,
            hasError: !!error,
            error: error?.message,
          });
          
          hasMultipleItems = items && items.length > 0;
          itemCount = items?.length || 0;
        } else {
          const items = await db.query(
            "SELECT * FROM order_items WHERE order_id = ?",
            [order_id]
          );
          
          console.log(`🔍 MySQL order_items query result:`, {
            itemsFound: items?.length || 0,
          });
          
          hasMultipleItems = items && items.length > 0;
          itemCount = items?.length || 0;
        }

        // Choose the appropriate dispense endpoint
        const dispenseEndpoint = hasMultipleItems ? "/multi" : "/trigger";
        const dispenseUrl = `http://localhost:${
          process.env.PORT || 3001
        }/api/dispense${dispenseEndpoint}`;

        console.log(`📦 Order ${order_id} has ${itemCount} items`);
        console.log(`📦 Triggering ${hasMultipleItems ? 'multi-item' : 'single'} dispense...`);
        console.log(`📦 Endpoint: ${dispenseUrl}`);

        await axios.post(
          dispenseUrl,
          {
            order_id: order_id,
          },
          {
            timeout: 10000, // Increased timeout for multi-item
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        console.log(`✅ Dispense triggered successfully for order ${order_id}`);
      } catch (dispenseError) {
        console.error(
          `❌ Failed to trigger dispense for order ${order_id}:`,
          dispenseError.message
        );

        // Log the error but don't fail the webhook
        // The order is already marked as PAID, dispense can be retried later
        if (USE_SUPABASE) {
          await supabase
            .from("orders")
            .update({
              status: "PENDING_DISPENSE",
              notes: `Payment successful but dispense failed: ${dispenseError.message}`,
            })
            .eq("id", order_id);
        } else {
          await db.query(
            `UPDATE orders SET status = 'PENDING_DISPENSE', notes = ? WHERE id = ?`,
            [
              `Payment successful but dispense failed: ${dispenseError.message}`,
              order_id,
            ]
          );
        }
      }
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

    console.log("💳 ========== PAYMENT VERIFICATION START ==========");
    console.log("💳 Order ID:", order_id);
    console.log("💳 Status:", status);

    let order;

    if (USE_SUPABASE) {
      console.log("🔍 Checking order in Supabase...");
      // Supabase: Check if order exists
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", order_id)
        .single();

      console.log("📊 Supabase result:", { data, error });

      if (error || !data) {
        console.log("❌ Order not found");
        return res.status(404).json({
          error: "Order not found",
        });
      }
      order = data;
      console.log("✅ Order found:", {
        id: order.id,
        status: order.status,
        machine_id: order.machine_id,
      });
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
      console.log(`⚠️ Order status is ${order.status}, cannot verify`);
      return res.status(400).json({
        error: "Order is not in pending or paid status",
        current_status: order.status,
      });
    }

    // If already PAID, just return success (idempotent)
    if (order.status === "PAID") {
      console.log("ℹ️ Order already PAID, returning success");
      return res.json({
        success: true,
        message: "Order already verified and paid",
        order_id,
        status: "PAID",
      });
    }

    const payment_status = status === "SUCCESS" ? "SUCCESS" : "FAILED";
    const order_status = status === "SUCCESS" ? "PAID" : "FAILED";

    console.log("📝 Updating payment and order status...");
    console.log("📝 New payment_status:", payment_status);
    console.log("📝 New order_status:", order_status);

    if (USE_SUPABASE) {
      // Supabase: Update payment and order
      const now = new Date().toISOString();

      console.log("💾 Updating payment...");
      // Update payment
      const { error: paymentError } = await supabase
        .from("payments")
        .update({
          status: payment_status,
          processed_at: now,
        })
        .eq("order_id", order_id);

      if (paymentError) {
        console.error("❌ Payment update error:", paymentError);
      } else {
        console.log("✅ Payment updated");
      }

      console.log("💾 Updating order...");
      // Update order
      const orderUpdate = {
        status: order_status,
      };
      if (payment_status === "SUCCESS") {
        orderUpdate.paid_at = now;
      }

      const { error: orderError } = await supabase
        .from("orders")
        .update(orderUpdate)
        .eq("id", order_id);

      if (orderError) {
        console.error("❌ Order update error:", orderError);
      } else {
        console.log("✅ Order updated to status:", order_status);
      }
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

    // If payment successful, trigger dispense process
    if (payment_status === "SUCCESS") {
      console.log(
        `💰 Payment verified for order ${order_id} - triggering dispense`
      );

      try {
        // Check if this is a multi-item order
        let hasMultipleItems = false;
        let itemCount = 0;

        if (USE_SUPABASE) {
          const { data: items, error } = await supabase
            .from("order_items")
            .select("*")
            .eq("order_id", order_id);

          console.log(`🔍 Supabase order_items query result:`, {
            itemsFound: items?.length || 0,
            hasError: !!error,
            error: error?.message,
          });

          hasMultipleItems = items && items.length > 0;
          itemCount = items?.length || 0;
        } else {
          const items = await db.query(
            "SELECT * FROM order_items WHERE order_id = ?",
            [order_id]
          );

          console.log(`🔍 MySQL order_items query result:`, {
            itemsFound: items?.length || 0,
          });

          hasMultipleItems = items && items.length > 0;
          itemCount = items?.length || 0;
        }

        // Choose the appropriate dispense endpoint
        const dispenseEndpoint = hasMultipleItems ? "/multi" : "/trigger";
        const dispenseUrl = `http://localhost:${
          process.env.PORT || 3001
        }/api/dispense${dispenseEndpoint}`;

        console.log(`📦 Order ${order_id} has ${itemCount} items`);
        console.log(
          `📦 Triggering ${hasMultipleItems ? "multi-item" : "single"} dispense...`
        );
        console.log(`📦 Endpoint: ${dispenseUrl}`);

        await axios.post(
          dispenseUrl,
          {
            order_id: order_id,
          },
          {
            timeout: 10000, // Increased timeout for multi-item
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        console.log(`✅ Dispense triggered successfully for order ${order_id}`);
      } catch (dispenseError) {
        console.error(
          `❌ Failed to trigger dispense for order ${order_id}:`,
          dispenseError.message
        );

        // Log the error but don't fail the verification
        if (USE_SUPABASE) {
          await supabase
            .from("orders")
            .update({
              status: "PENDING_DISPENSE",
              notes: `Payment successful but dispense failed: ${dispenseError.message}`,
            })
            .eq("id", order_id);
        } else {
          await db.query(
            `UPDATE orders SET status = 'PENDING_DISPENSE', notes = ? WHERE id = ?`,
            [
              `Payment successful but dispense failed: ${dispenseError.message}`,
              order_id,
            ]
          );
        }
      }
    }

    console.log("✅ ========== PAYMENT VERIFICATION SUCCESS ==========");
    res.json({
      order_id,
      status: order_status,
      message: `Payment ${status.toLowerCase()} processed`,
    });
  } catch (error) {
    console.error("❌ ========== PAYMENT VERIFICATION ERROR ==========");
    console.error("Payment verification error:", error);
    res.status(500).json({
      error: "Failed to verify payment",
    });
  }
});

// Update payment method
router.patch("/method/:order_id", async (req, res) => {
  try {
    const { order_id } = req.params;
    const { payment_method } = req.body;

    if (!payment_method) {
      return res.status(400).json({
        error: "payment_method is required",
      });
    }

    const validMethods = ["qris", "va", "gopay", "shopeepay", "midtrans"];
    if (!validMethods.includes(payment_method)) {
      return res.status(400).json({
        error: "Invalid payment method",
        valid_methods: validMethods,
      });
    }

    console.log("🔄 Updating payment method:", {
      order_id,
      payment_method,
    });

    if (USE_SUPABASE) {
      const { error } = await supabase
        .from("payments")
        .update({ payment_type: payment_method })
        .eq("order_id", order_id);

      if (error) {
        console.error("❌ Failed to update payment method:", error);
        return res.status(500).json({
          error: "Failed to update payment method",
        });
      }

      console.log("✅ Payment method updated successfully");
    } else {
      await db.query(
        `UPDATE payments SET payment_type = ? WHERE order_id = ?`,
        [payment_method, order_id]
      );
    }

    res.json({
      success: true,
      message: "Payment method updated",
      order_id,
      payment_method,
    });
  } catch (error) {
    console.error("Update payment method error:", error);
    res.status(500).json({
      error: "Failed to update payment method",
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
