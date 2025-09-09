const express = require("express");
const { body, validationResult } = require("express-validator");
const db = require("../config/database");
const { v4: uuidv4 } = require("uuid");
const moment = require("moment");

const router = express.Router();

// Validation middleware
const validateOrder = [
  body("slot_id").isInt({ min: 1 }).withMessage("Valid slot_id is required"),
  body("quantity")
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage("Quantity must be between 1-10"),
  body("customer_phone")
    .optional()
    .isMobilePhone("id-ID")
    .withMessage("Valid Indonesian phone number required"),
];

// Create new order
router.post("/", validateOrder, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array(),
      });
    }

    const { slot_id, quantity = 1, customer_phone } = req.body;
    const machine_id = process.env.MACHINE_ID || "VM01";

    // Get slot and product information
    const slot = await db.query(
      `
      SELECT s.*, p.name as product_name, p.price, p.is_active as product_active
      FROM slots s
      JOIN products p ON s.product_id = p.id
      WHERE s.id = ? AND s.machine_id = ? AND s.is_active = 1
    `,
      [slot_id, machine_id]
    );

    if (slot.length === 0) {
      return res.status(404).json({
        error: "Slot not found or inactive",
      });
    }

    const slotInfo = slot[0];

    // Check stock availability
    if (slotInfo.current_stock < quantity) {
      return res.status(400).json({
        error: "Insufficient stock",
        available: slotInfo.current_stock,
        requested: quantity,
      });
    }

    if (!slotInfo.product_active) {
      return res.status(400).json({
        error: "Product is not active",
      });
    }

    // Calculate total amount
    const price = slotInfo.price_override || slotInfo.price;
    const total_amount = price * quantity;

    // Generate order ID
    const order_id = `ORD-${moment().format("YYYYMMDD")}-${uuidv4()
      .substr(0, 8)
      .toUpperCase()}`;

    // Create payment URL (mock for now - integrate with real payment gateway)
    const payment_token = uuidv4();
    const payment_url = `https://sandbox.midtrans.com/v2/qris/${payment_token}`;
    const expires_at = moment()
      .add(15, "minutes")
      .format("YYYY-MM-DD HH:mm:ss");

    // Insert order
    await db.query(
      `
      INSERT INTO orders (id, machine_id, slot_id, product_id, quantity, total_amount, 
                         payment_url, payment_token, expires_at, customer_phone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        order_id,
        machine_id,
        slot_id,
        slotInfo.product_id,
        quantity,
        total_amount,
        payment_url,
        payment_token,
        expires_at,
        customer_phone,
      ]
    );

    // Insert payment record
    await db.query(
      `
      INSERT INTO payments (order_id, gateway_name, amount, payment_type)
      VALUES (?, 'midtrans', ?, 'qris')
    `,
      [order_id, total_amount]
    );

    res.status(201).json({
      order_id,
      product_name: slotInfo.product_name,
      quantity,
      unit_price: price,
      total_amount,
      payment_url,
      payment_token,
      expires_at,
      qr_string: payment_url, // In real implementation, generate actual QR data
      status: "PENDING",
    });
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({
      error: "Failed to create order",
    });
  }
});

// Get order status
router.get("/:order_id", async (req, res) => {
  try {
    const { order_id } = req.params;

    const order = await db.query(
      `
      SELECT o.*, p.name as product_name, s.slot_number,
             pay.status as payment_status, pay.processed_at
      FROM orders o
      JOIN products p ON o.product_id = p.id
      JOIN slots s ON o.slot_id = s.id
      LEFT JOIN payments pay ON o.id = pay.order_id
      WHERE o.id = ?
    `,
      [order_id]
    );

    if (order.length === 0) {
      return res.status(404).json({
        error: "Order not found",
      });
    }

    const orderInfo = order[0];

    // Check if order expired
    if (
      orderInfo.status === "PENDING" &&
      moment().isAfter(orderInfo.expires_at)
    ) {
      await db.query('UPDATE orders SET status = "FAILED" WHERE id = ?', [
        order_id,
      ]);
      orderInfo.status = "FAILED";
    }

    res.json({
      order_id: orderInfo.id,
      machine_id: orderInfo.machine_id,
      product_name: orderInfo.product_name,
      slot_number: orderInfo.slot_number,
      quantity: orderInfo.quantity,
      total_amount: orderInfo.total_amount,
      status: orderInfo.status,
      payment_status: orderInfo.payment_status,
      payment_method: orderInfo.payment_method,
      payment_url: orderInfo.payment_url,
      expires_at: orderInfo.expires_at,
      paid_at: orderInfo.paid_at,
      dispensed_at: orderInfo.dispensed_at,
      created_at: orderInfo.created_at,
    });
  } catch (error) {
    console.error("Get order error:", error);
    res.status(500).json({
      error: "Failed to get order",
    });
  }
});

// Get machine orders (for admin/dashboard)
router.get("/machine/:machine_id", async (req, res) => {
  try {
    const { machine_id } = req.params;
    const { status, limit = 50, offset = 0 } = req.query;

    let whereClause = "WHERE o.machine_id = ?";
    let queryParams = [machine_id];

    if (status) {
      whereClause += " AND o.status = ?";
      queryParams.push(status);
    }

    const orders = await db.query(
      `
      SELECT o.*, p.name as product_name, s.slot_number,
             pay.status as payment_status
      FROM orders o
      JOIN products p ON o.product_id = p.id
      JOIN slots s ON o.slot_id = s.id
      LEFT JOIN payments pay ON o.id = pay.order_id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `,
      [...queryParams, parseInt(limit), parseInt(offset)]
    );

    const totalCount = await db.query(
      `
      SELECT COUNT(*) as count FROM orders o ${whereClause}
    `,
      queryParams
    );

    res.json({
      orders,
      total: totalCount[0].count,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error("Get machine orders error:", error);
    res.status(500).json({
      error: "Failed to get orders",
    });
  }
});

module.exports = router;
