const express = require("express");
const db = require("../config/database");

const router = express.Router();

// Get machine info
router.get("/:machine_id", async (req, res) => {
  try {
    const { machine_id } = req.params;

    const machine = await db.query(
      `
      SELECT * FROM machines WHERE id = ?
    `,
      [machine_id]
    );

    if (machine.length === 0) {
      return res.status(404).json({
        error: "Machine not found",
      });
    }

    const machineInfo = machine[0];

    // Get slots info
    const slots = await db.query(
      `
      SELECT s.*, p.name as product_name, p.image_url
      FROM slots s
      LEFT JOIN products p ON s.product_id = p.id
      WHERE s.machine_id = ?
      ORDER BY s.slot_number ASC
    `,
      [machine_id]
    );

    res.json({
      ...machineInfo,
      slots,
    });
  } catch (error) {
    console.error("Get machine error:", error);
    res.status(500).json({
      error: "Failed to get machine info",
    });
  }
});

// Update machine status
router.post("/:machine_id/status", async (req, res) => {
  try {
    const { machine_id } = req.params;
    const { status } = req.body;

    if (!["ONLINE", "OFFLINE", "MAINTENANCE"].includes(status)) {
      return res.status(400).json({
        error: "Invalid status",
      });
    }

    await db.query(
      `
      UPDATE machines 
      SET status = ?, last_seen = NOW() 
      WHERE id = ?
    `,
      [status, machine_id]
    );

    res.json({
      machine_id,
      status,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Update machine status error:", error);
    res.status(500).json({
      error: "Failed to update machine status",
    });
  }
});

// Get machine statistics
router.get("/:machine_id/stats", async (req, res) => {
  try {
    const { machine_id } = req.params;
    const { period = "24h" } = req.query;

    let timeCondition = "";
    switch (period) {
      case "1h":
        timeCondition = "AND o.created_at >= NOW() - INTERVAL 1 HOUR";
        break;
      case "24h":
        timeCondition = "AND o.created_at >= NOW() - INTERVAL 24 HOUR";
        break;
      case "7d":
        timeCondition = "AND o.created_at >= NOW() - INTERVAL 7 DAY";
        break;
      case "30d":
        timeCondition = "AND o.created_at >= NOW() - INTERVAL 30 DAY";
        break;
    }

    // Sales statistics
    const salesStats = await db.query(
      `
      SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed_orders,
        COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total_amount ELSE 0 END), 0) as total_revenue
      FROM orders o
      WHERE machine_id = ? ${timeCondition}
    `,
      [machine_id]
    );

    // Stock levels
    const stockLevels = await db.query(
      `
      SELECT 
        s.slot_number,
        p.name as product_name,
        s.current_stock,
        s.capacity,
        ROUND((s.current_stock / s.capacity) * 100, 2) as stock_percentage
      FROM slots s
      LEFT JOIN products p ON s.product_id = p.id
      WHERE s.machine_id = ?
      ORDER BY s.slot_number ASC
    `,
      [machine_id]
    );

    // Popular products
    const popularProducts = await db.query(
      `
      SELECT 
        p.name,
        COUNT(*) as order_count,
        SUM(o.quantity) as total_quantity,
        SUM(CASE WHEN o.status = 'COMPLETED' THEN o.total_amount ELSE 0 END) as revenue
      FROM orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.machine_id = ? ${timeCondition}
      GROUP BY p.id, p.name
      ORDER BY order_count DESC
      LIMIT 5
    `,
      [machine_id]
    );

    res.json({
      machine_id,
      period,
      sales_stats: salesStats[0],
      stock_levels: stockLevels,
      popular_products: popularProducts,
    });
  } catch (error) {
    console.error("Get machine stats error:", error);
    res.status(500).json({
      error: "Failed to get machine statistics",
    });
  }
});

module.exports = router;
