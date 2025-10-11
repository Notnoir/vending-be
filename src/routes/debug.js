const express = require("express");
const { supabase } = require("../config/supabase");
const db = require("../config/database");

const router = express.Router();
const USE_SUPABASE = process.env.USE_SUPABASE === "true";

// Manual payment status update (for testing only - use when webhook can't reach your localhost)
router.post("/update-payment/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body; // SUCCESS, FAILED, PENDING

    console.log(`🔧 Manual payment update for ${orderId}: ${status}`);

    const paymentStatus = status || "SUCCESS";
    const orderStatus = paymentStatus === "SUCCESS" ? "PAID" : "FAILED";
    const now = new Date().toISOString();

    if (USE_SUPABASE) {
      // Update payment
      const { error: paymentError } = await supabase
        .from("payments")
        .update({
          status: paymentStatus,
          gateway_transaction_id: "MANUAL_TEST",
          payment_type: "manual",
          processed_at: now,
        })
        .eq("order_id", orderId);

      if (paymentError) {
        console.error("Payment update error:", paymentError);
        throw paymentError;
      }

      // Update order
      const updateData = {
        status: orderStatus,
      };

      if (paymentStatus === "SUCCESS") {
        updateData.paid_at = now;
      }

      const { error: orderError } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", orderId);

      if (orderError) {
        console.error("Order update error:", orderError);
        throw orderError;
      }

      console.log(`✅ Payment manually updated: ${orderId} → ${paymentStatus}`);
    } else {
      // MySQL implementation
      await db.query(
        `UPDATE payments 
         SET status = ?, gateway_transaction_id = ?, payment_type = ?, processed_at = NOW()
         WHERE order_id = ?`,
        [paymentStatus, "MANUAL_TEST", "manual", orderId]
      );

      const paid_at = paymentStatus === "SUCCESS" ? "NOW()" : "NULL";
      await db.query(
        `UPDATE orders 
         SET status = ?, paid_at = ${paid_at}
         WHERE id = ?`,
        [orderStatus, orderId]
      );

      console.log(`✅ Payment manually updated: ${orderId} → ${paymentStatus}`);
    }

    res.json({
      success: true,
      orderId,
      paymentStatus,
      orderStatus,
      message: "Payment status updated successfully (manual)",
    });
  } catch (error) {
    console.error("❌ Manual update error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get order details (for debugging)
router.get("/order/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    if (USE_SUPABASE) {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          *,
          products (*),
          slots (*),
          payments (*)
        `
        )
        .eq("id", orderId)
        .single();

      if (error) {
        throw error;
      }

      res.json({
        success: true,
        order: data,
      });
    } else {
      const order = await db.query(
        `SELECT o.*, 
                p.name as product_name,
                s.slot_number,
                pay.status as payment_status,
                pay.gateway_transaction_id
         FROM orders o
         LEFT JOIN products p ON o.product_id = p.id
         LEFT JOIN slots s ON o.slot_id = s.id
         LEFT JOIN payments pay ON o.id = pay.order_id
         WHERE o.id = ?`,
        [orderId]
      );

      res.json({
        success: true,
        order: order[0] || null,
      });
    }
  } catch (error) {
    console.error("❌ Get order error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// List all pending payments (for debugging)
router.get("/pending-payments", async (req, res) => {
  try {
    if (USE_SUPABASE) {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          *,
          products (name),
          payments (*)
        `
        )
        .eq("status", "PENDING")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        throw error;
      }

      res.json({
        success: true,
        count: data.length,
        orders: data,
      });
    } else {
      const orders = await db.query(
        `SELECT o.*, 
                p.name as product_name,
                pay.status as payment_status,
                pay.gateway_transaction_id
         FROM orders o
         LEFT JOIN products p ON o.product_id = p.id
         LEFT JOIN payments pay ON o.id = pay.order_id
         WHERE o.status = 'PENDING'
         ORDER BY o.created_at DESC
         LIMIT 20`
      );

      res.json({
        success: true,
        count: orders.length,
        orders,
      });
    }
  } catch (error) {
    console.error("❌ Get pending payments error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
