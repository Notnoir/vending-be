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
  body("payment_method")
    .optional()
    .isIn(["qris", "va", "gopay", "shopeepay"])
    .withMessage("Invalid payment method"),
];

// Validation for multi-item orders
const validateMultiItemOrder = [
  body("items")
    .isArray({ min: 1, max: 10 })
    .withMessage("Items must be an array with 1-10 items"),
  body("items.*.slot_id")
    .isInt({ min: 1 })
    .withMessage("Valid slot_id is required for each item"),
  body("items.*.quantity")
    .isInt({ min: 1, max: 10 })
    .withMessage("Quantity must be between 1-10 for each item"),
  body("customer_phone")
    .optional()
    .isMobilePhone("id-ID")
    .withMessage("Valid Indonesian phone number required"),
  body("payment_method")
    .optional()
    .isIn(["qris", "va", "gopay", "shopeepay"])
    .withMessage("Invalid payment method"),
];

// Create multi-item order
router.post("/multi", validateMultiItemOrder, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array(),
      });
    }

    const { items, customer_phone, payment_method = "qris" } = req.body;
    const machine_id = process.env.MACHINE_ID || "VM01";

    console.log("📦 Create multi-item order request:", {
      items,
      customer_phone,
      payment_method,
      machine_id,
    });

    const customerPhoneValue = customer_phone || null;

    // Validate all items and calculate total
    let total_amount = 0;
    const validatedItems = [];

    for (const item of items) {
      let slotInfo;

      if (process.env.USE_SUPABASE === "true") {
        const supabase = db.getClient();
        const { data: slotData, error } = await supabase
          .from("slots")
          .select(`*, products (id, name, price, is_active)`)
          .eq("id", item.slot_id)
          .eq("machine_id", machine_id)
          .eq("is_active", true)
          .single();

        if (error || !slotData) {
          return res.status(404).json({
            error: `Slot ${item.slot_id} not found or inactive`,
          });
        }

        slotInfo = {
          ...slotData,
          product_name: slotData.products.name,
          price: slotData.products.price,
          product_active: slotData.products.is_active,
          product_id: slotData.products.id,
        };
      } else {
        const slot = await db.query(
          `SELECT s.*, p.name as product_name, p.price, p.is_active as product_active
           FROM slots s
           JOIN products p ON s.product_id = p.id
           WHERE s.id = ? AND s.machine_id = ? AND s.is_active = 1`,
          [item.slot_id, machine_id]
        );

        if (slot.length === 0) {
          return res.status(404).json({
            error: `Slot ${item.slot_id} not found or inactive`,
          });
        }

        slotInfo = slot[0];
      }

      // Check stock
      if (slotInfo.current_stock < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for ${slotInfo.product_name}`,
          available: slotInfo.current_stock,
          requested: item.quantity,
        });
      }

      if (!slotInfo.product_active) {
        return res.status(400).json({
          error: `Product ${slotInfo.product_name} is not active`,
        });
      }

      const price = slotInfo.price_override || slotInfo.price;
      const item_total = price * item.quantity;
      total_amount += item_total;

      validatedItems.push({
        slot_id: item.slot_id,
        product_id: slotInfo.product_id,
        product_name: slotInfo.product_name,
        quantity: item.quantity,
        unit_price: price,
        total: item_total,
      });
    }

    // Generate order ID
    const order_id = `ORD-${moment().format("YYYYMMDD")}-${uuidv4()
      .substr(0, 8)
      .toUpperCase()}`;

    const payment_token = uuidv4();
    const payment_url = `midtrans://payment/${order_id}`;
    const expires_at = moment().add(15, "minutes").toISOString();

    // Insert main order (using first item as primary)
    const primaryItem = validatedItems[0];

    if (process.env.USE_SUPABASE === "true") {
      const supabase = db.getClient();

      // Insert main order
      const { error: orderError } = await supabase.from("orders").insert({
        id: order_id,
        machine_id,
        slot_id: primaryItem.slot_id,
        product_id: primaryItem.product_id,
        quantity: validatedItems.reduce((sum, item) => sum + item.quantity, 0),
        total_amount,
        payment_url,
        payment_token,
        expires_at,
        customer_phone: customerPhoneValue,
        status: "PENDING",
      });

      if (orderError) throw orderError;

      // Insert order items
      const orderItems = validatedItems.map((item) => ({
        order_id,
        slot_id: item.slot_id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.total,
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // Insert payment
      const { error: paymentError } = await supabase.from("payments").insert({
        order_id,
        gateway_name: "midtrans",
        amount: total_amount,
        payment_type: payment_method,
        status: "PENDING",
      });

      if (paymentError) throw paymentError;
    } else {
      // MySQL
      await db.query(
        `INSERT INTO orders (id, machine_id, slot_id, product_id, quantity, total_amount, 
                            payment_url, payment_token, expires_at, customer_phone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          order_id,
          machine_id,
          primaryItem.slot_id,
          primaryItem.product_id,
          validatedItems.reduce((sum, item) => sum + item.quantity, 0),
          total_amount,
          payment_url,
          payment_token,
          expires_at,
          customerPhoneValue,
        ]
      );

      // Insert order items
      for (const item of validatedItems) {
        await db.query(
          `INSERT INTO order_items (order_id, slot_id, product_id, product_name, quantity, unit_price, total)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            order_id,
            item.slot_id,
            item.product_id,
            item.product_name,
            item.quantity,
            item.unit_price,
            item.total,
          ]
        );
      }

      // Insert payment
      await db.query(
        `INSERT INTO payments (order_id, gateway_name, amount, payment_type)
         VALUES (?, 'midtrans', ?, ?)`,
        [order_id, total_amount, payment_method]
      );
    }

    res.status(201).json({
      order_id,
      items: validatedItems,
      total_quantity: validatedItems.reduce(
        (sum, item) => sum + item.quantity,
        0
      ),
      total_amount,
      payment_url,
      payment_token,
      expires_at,
      qr_string: payment_url,
      status: "PENDING",
    });
  } catch (error) {
    console.error("Create multi-item order error:", error);
    res.status(500).json({
      error: "Failed to create multi-item order",
      details: error.message,
    });
  }
});

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

    const {
      slot_id,
      quantity = 1,
      customer_phone,
      payment_method = "qris",
    } = req.body;
    const machine_id = process.env.MACHINE_ID || "VM01";

    // DEBUG: Log received data
    console.log("📦 Create order request:", {
      slot_id,
      quantity,
      customer_phone,
      payment_method,
      machine_id,
    });

    // Fix undefined customer_phone - convert to null for MySQL
    const customerPhoneValue = customer_phone || null;
    console.log("📦 Customer phone processed:", customerPhoneValue);

    let slotInfo;

    if (process.env.USE_SUPABASE === "true") {
      // Supabase: Get slot and product info using joins
      const supabase = db.getClient();
      const { data: slotData, error } = await supabase
        .from("slots")
        .select(
          `
          *,
          products (
            id,
            name,
            price,
            is_active
          )
        `
        )
        .eq("id", slot_id)
        .eq("machine_id", machine_id)
        .eq("is_active", true)
        .single();

      if (error || !slotData) {
        return res.status(404).json({
          error: "Slot not found or inactive",
        });
      }

      // Transform to match MySQL format
      slotInfo = {
        ...slotData,
        product_name: slotData.products.name,
        price: slotData.products.price,
        product_active: slotData.products.is_active,
        product_id: slotData.products.id,
      };
    } else {
      // MySQL: Use raw SQL query
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

      slotInfo = slot[0];
    }

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
    const payment_url = `midtrans://payment/${order_id}`; // Placeholder - frontend will create actual Snap URL
    const expires_at = moment().add(15, "minutes").toISOString();

    if (process.env.USE_SUPABASE === "true") {
      // Supabase: Insert order
      const supabase = db.getClient();

      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert({
          id: order_id,
          machine_id,
          slot_id,
          product_id: slotInfo.product_id,
          quantity,
          total_amount,
          payment_url,
          payment_token,
          expires_at,
          customer_phone: customerPhoneValue,
          status: "PENDING",
        })
        .select()
        .single();

      if (orderError) {
        console.error("Supabase insert order error:", orderError);
        throw orderError;
      }

      // Insert payment record
      const { error: paymentError } = await supabase.from("payments").insert({
        order_id,
        gateway_name: "midtrans",
        amount: total_amount,
        payment_type: payment_method, // Use dynamic payment method
        status: "PENDING",
      });

      if (paymentError) {
        console.error("Supabase insert payment error:", paymentError);
        throw paymentError;
      }
    } else {
      // MySQL: Use raw SQL queries
      const insertParams = [
        order_id,
        machine_id,
        slot_id,
        slotInfo.product_id,
        quantity,
        total_amount,
        payment_url,
        payment_token,
        expires_at,
        customerPhoneValue,
      ];
      console.log("📝 Insert parameters:", insertParams);
      console.log(
        "📝 Parameter types:",
        insertParams.map((p) => typeof p)
      );

      // Insert order
      await db.query(
        `
        INSERT INTO orders (id, machine_id, slot_id, product_id, quantity, total_amount, 
                           payment_url, payment_token, expires_at, customer_phone)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        insertParams
      );

      // Insert payment record
      await db.query(
        `
        INSERT INTO payments (order_id, gateway_name, amount, payment_type)
        VALUES (?, 'midtrans', ?, ?)
      `,
        [order_id, total_amount, payment_method]
      );
    }

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

    if (process.env.USE_SUPABASE === "true") {
      // Supabase: Get order with relations
      const supabase = db.getClient();

      const { data: order, error } = await supabase
        .from("orders")
        .select(
          `
          *,
          products (
            name
          ),
          slots (
            slot_number
          ),
          payments (
            status,
            processed_at
          )
        `
        )
        .eq("id", order_id)
        .single();

      if (error || !order) {
        return res.status(404).json({
          error: "Order not found",
        });
      }

      // Check if order expired
      if (order.status === "PENDING" && moment().isAfter(order.expires_at)) {
        await supabase
          .from("orders")
          .update({ status: "FAILED" })
          .eq("id", order_id);
        order.status = "FAILED";
      }

      res.json({
        order_id: order.id,
        machine_id: order.machine_id,
        product_name: order.products?.name || "Unknown",
        slot_number: order.slots?.slot_number || 0,
        quantity: order.quantity,
        total_amount: order.total_amount,
        status: order.status,
        payment_status: order.payments?.[0]?.status || null,
        payment_processed_at: order.payments?.[0]?.processed_at || null,
        created_at: order.created_at,
        expires_at: order.expires_at,
      });
    } else {
      // MySQL: Original query
      const order = await db.query(
        `
        SELECT o.*, p.name as product_name, s.slot_number,
               pay.status as payment_status, pay.processed_at
        FROM orders o
        JOIN products p ON o.product_id = p.id
        JOIN slots s ON o.slot_id = s.id
        LEFT JOIN payments pay ON o.id = pay.order_id
        WHERE o.order_id = ?
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
        await db.query(
          'UPDATE orders SET status = "FAILED" WHERE order_id = ?',
          [order_id]
        );
        orderInfo.status = "FAILED";
      }

      res.json({
        order_id: orderInfo.order_id,
        machine_id: orderInfo.machine_id,
        product_name: orderInfo.product_name,
        slot_number: orderInfo.slot_number,
        quantity: orderInfo.quantity,
        total_amount: orderInfo.total_amount,
        status: orderInfo.status,
        payment_status: orderInfo.payment_status,
        payment_processed_at: orderInfo.processed_at,
        created_at: orderInfo.created_at,
        expires_at: orderInfo.expires_at,
      });
    }
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
