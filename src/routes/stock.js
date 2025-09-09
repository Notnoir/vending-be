const express = require("express");
const { body, validationResult } = require("express-validator");
const db = require("../config/database");

const router = express.Router();

// Validation middleware
const validateStockUpdate = [
  body("slot_id").isInt({ min: 1 }).withMessage("Valid slot_id is required"),
  body("quantity").isInt({ min: 0 }).withMessage("Valid quantity is required"),
  body("change_type")
    .isIn(["RESTOCK", "MANUAL_ADJUST", "AUDIT"])
    .withMessage("Valid change_type is required"),
  body("reason")
    .optional()
    .isString()
    .isLength({ max: 200 })
    .withMessage("Reason must be string max 200 chars"),
];

// Get stock levels for machine
router.get("/:machine_id", async (req, res) => {
  try {
    const { machine_id } = req.params;

    const stock = await db.query(
      `
      SELECT 
        s.id as slot_id,
        s.slot_number,
        s.current_stock,
        s.capacity,
        s.is_active,
        p.id as product_id,
        p.name as product_name,
        p.image_url,
        ROUND((s.current_stock / s.capacity) * 100, 2) as stock_percentage,
        CASE 
          WHEN s.current_stock = 0 THEN 'EMPTY'
          WHEN s.current_stock <= (s.capacity * 0.2) THEN 'LOW'
          WHEN s.current_stock <= (s.capacity * 0.5) THEN 'MEDIUM'
          ELSE 'FULL'
        END as stock_level
      FROM slots s
      LEFT JOIN products p ON s.product_id = p.id
      WHERE s.machine_id = ?
      ORDER BY s.slot_number ASC
    `,
      [machine_id]
    );

    // Calculate summary
    const summary = {
      total_slots: stock.length,
      empty_slots: stock.filter((s) => s.stock_level === "EMPTY").length,
      low_stock_slots: stock.filter((s) => s.stock_level === "LOW").length,
      active_slots: stock.filter((s) => s.is_active).length,
    };

    res.json({
      machine_id,
      summary,
      slots: stock,
    });
  } catch (error) {
    console.error("Get stock error:", error);
    res.status(500).json({
      error: "Failed to get stock levels",
    });
  }
});

// Update stock (restock/adjust)
router.post("/update", validateStockUpdate, async (req, res) => {
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
      quantity,
      change_type,
      reason,
      performed_by = "system",
    } = req.body;

    // Get current slot info
    const slot = await db.query(
      `
      SELECT s.*, m.id as machine_id
      FROM slots s
      JOIN machines m ON s.machine_id = m.id
      WHERE s.id = ?
    `,
      [slot_id]
    );

    if (slot.length === 0) {
      return res.status(404).json({
        error: "Slot not found",
      });
    }

    const slotInfo = slot[0];
    const quantity_before = slotInfo.current_stock;
    let quantity_after = quantity;
    let quantity_change = 0;

    // Calculate quantity change based on type
    if (change_type === "RESTOCK") {
      quantity_after = Math.min(quantity_before + quantity, slotInfo.capacity);
      quantity_change = quantity_after - quantity_before;
    } else if (change_type === "MANUAL_ADJUST") {
      quantity_after = Math.min(Math.max(quantity, 0), slotInfo.capacity);
      quantity_change = quantity_after - quantity_before;
    } else if (change_type === "AUDIT") {
      quantity_after = Math.min(Math.max(quantity, 0), slotInfo.capacity);
      quantity_change = quantity_after - quantity_before;
    }

    await db.transaction(async (connection) => {
      // Update slot stock
      await connection.execute(
        `
        UPDATE slots SET current_stock = ? WHERE id = ?
      `,
        [quantity_after, slot_id]
      );

      // Log stock change
      await connection.execute(
        `
        INSERT INTO stock_logs (machine_id, slot_id, change_type, quantity_before, quantity_after, quantity_change, reason, performed_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          slotInfo.machine_id,
          slot_id,
          change_type,
          quantity_before,
          quantity_after,
          quantity_change,
          reason,
          performed_by,
        ]
      );
    });

    res.json({
      slot_id,
      machine_id: slotInfo.machine_id,
      slot_number: slotInfo.slot_number,
      change_type,
      quantity_before,
      quantity_after,
      quantity_change,
      reason,
      performed_by,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Update stock error:", error);
    res.status(500).json({
      error: "Failed to update stock",
    });
  }
});

// Get stock logs
router.get("/logs/:machine_id", async (req, res) => {
  try {
    const { machine_id } = req.params;
    const { limit = 50, offset = 0, change_type } = req.query;

    let whereClause = "WHERE sl.machine_id = ?";
    let queryParams = [machine_id];

    if (change_type) {
      whereClause += " AND sl.change_type = ?";
      queryParams.push(change_type);
    }

    const logs = await db.query(
      `
      SELECT 
        sl.*,
        s.slot_number,
        p.name as product_name
      FROM stock_logs sl
      JOIN slots s ON sl.slot_id = s.id
      LEFT JOIN products p ON s.product_id = p.id
      ${whereClause}
      ORDER BY sl.created_at DESC
      LIMIT ? OFFSET ?
    `,
      [...queryParams, parseInt(limit), parseInt(offset)]
    );

    const totalCount = await db.query(
      `
      SELECT COUNT(*) as count FROM stock_logs sl ${whereClause}
    `,
      queryParams
    );

    res.json({
      machine_id,
      logs,
      total: totalCount[0].count,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error("Get stock logs error:", error);
    res.status(500).json({
      error: "Failed to get stock logs",
    });
  }
});

// Report current stock snapshot
router.post("/report/:machine_id", async (req, res) => {
  try {
    const { machine_id } = req.params;

    const stock = await db.query(
      `
      SELECT 
        s.id as slot_id,
        s.slot_number,
        s.current_stock,
        s.capacity,
        p.name as product_name
      FROM slots s
      LEFT JOIN products p ON s.product_id = p.id
      WHERE s.machine_id = ?
      ORDER BY s.slot_number ASC
    `,
      [machine_id]
    );

    // Update machine last_seen
    await db.query(
      `
      UPDATE machines SET last_seen = NOW() WHERE id = ?
    `,
      [machine_id]
    );

    // Log the stock report
    for (const slot of stock) {
      await db.query(
        `
        INSERT INTO stock_logs (machine_id, slot_id, change_type, quantity_before, quantity_after, quantity_change, reason, performed_by)
        VALUES (?, ?, 'AUDIT', ?, ?, 0, 'Automated stock report', 'system')
      `,
        [machine_id, slot.slot_id, slot.current_stock, slot.current_stock]
      );
    }

    res.json({
      machine_id,
      reported_at: new Date().toISOString(),
      stock_count: stock.length,
      stock_snapshot: stock,
    });
  } catch (error) {
    console.error("Stock report error:", error);
    res.status(500).json({
      error: "Failed to process stock report",
    });
  }
});

module.exports = router;
