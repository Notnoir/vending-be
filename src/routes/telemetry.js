const express = require("express");
const { body, validationResult } = require("express-validator");
const db = require("../config/database");

const router = express.Router();

// Validation middleware
const validateTelemetry = [
  body("machine_id").notEmpty().withMessage("Machine ID is required"),
  body("data").isObject().withMessage("Telemetry data must be an object"),
];

// Receive telemetry data from ESP32 via Pi
router.post("/", validateTelemetry, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array(),
      });
    }

    const { machine_id, data } = req.body;

    // Validate machine exists
    const machine = await db.query("SELECT id FROM machines WHERE id = ?", [
      machine_id,
    ]);
    if (machine.length === 0) {
      return res.status(404).json({
        error: "Machine not found",
      });
    }

    // Store telemetry data
    await db.query(
      `
      INSERT INTO telemetry (machine_id, data)
      VALUES (?, ?)
    `,
      [machine_id, JSON.stringify(data)]
    );

    // Update machine last_seen
    await db.query(
      `
      UPDATE machines SET last_seen = NOW() WHERE id = ?
    `,
      [machine_id]
    );

    // Process specific telemetry data if needed
    if (data.slots && Array.isArray(data.slots)) {
      // Update slot stock levels if provided
      for (const slotData of data.slots) {
        if (slotData.id && typeof slotData.level !== "undefined") {
          // Convert level to stock count (this is a simplified example)
          let estimated_stock = 0;
          switch (slotData.level) {
            case "FULL":
              estimated_stock = 10;
              break;
            case "HIGH":
              estimated_stock = 8;
              break;
            case "MEDIUM":
              estimated_stock = 5;
              break;
            case "LOW":
              estimated_stock = 2;
              break;
            case "EMPTY":
              estimated_stock = 0;
              break;
          }

          if (estimated_stock >= 0) {
            await db.query(
              `
              UPDATE slots 
              SET current_stock = ?
              WHERE machine_id = ? AND slot_number = ?
            `,
              [estimated_stock, machine_id, slotData.id]
            );
          }
        }
      }
    }

    res.json({
      machine_id,
      received_at: new Date().toISOString(),
      status: "processed",
    });
  } catch (error) {
    console.error("Telemetry error:", error);
    res.status(500).json({
      error: "Failed to process telemetry",
    });
  }
});

// Get telemetry data
router.get("/:machine_id", async (req, res) => {
  try {
    const { machine_id } = req.params;
    const { limit = 50, offset = 0, start_time, end_time } = req.query;

    let whereClause = "WHERE machine_id = ?";
    let queryParams = [machine_id];

    if (start_time) {
      whereClause += " AND received_at >= ?";
      queryParams.push(start_time);
    }

    if (end_time) {
      whereClause += " AND received_at <= ?";
      queryParams.push(end_time);
    }

    const telemetry = await db.query(
      `
      SELECT * FROM telemetry
      ${whereClause}
      ORDER BY received_at DESC
      LIMIT ? OFFSET ?
    `,
      [...queryParams, parseInt(limit), parseInt(offset)]
    );

    res.json({
      machine_id,
      telemetry: telemetry.map((t) => ({
        id: t.id,
        data: JSON.parse(t.data),
        received_at: t.received_at,
      })),
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error("Get telemetry error:", error);
    res.status(500).json({
      error: "Failed to get telemetry data",
    });
  }
});

// Get latest telemetry
router.get("/:machine_id/latest", async (req, res) => {
  try {
    const { machine_id } = req.params;

    const latest = await db.query(
      `
      SELECT * FROM telemetry
      WHERE machine_id = ?
      ORDER BY received_at DESC
      LIMIT 1
    `,
      [machine_id]
    );

    if (latest.length === 0) {
      return res.status(404).json({
        error: "No telemetry data found",
      });
    }

    res.json({
      machine_id,
      data: JSON.parse(latest[0].data),
      received_at: latest[0].received_at,
    });
  } catch (error) {
    console.error("Get latest telemetry error:", error);
    res.status(500).json({
      error: "Failed to get latest telemetry",
    });
  }
});

// Get telemetry summary/stats
router.get("/:machine_id/summary", async (req, res) => {
  try {
    const { machine_id } = req.params;
    const { period = "24h" } = req.query;

    let timeCondition = "";
    switch (period) {
      case "1h":
        timeCondition = "AND received_at >= NOW() - INTERVAL 1 HOUR";
        break;
      case "24h":
        timeCondition = "AND received_at >= NOW() - INTERVAL 24 HOUR";
        break;
      case "7d":
        timeCondition = "AND received_at >= NOW() - INTERVAL 7 DAY";
        break;
    }

    const summary = await db.query(
      `
      SELECT 
        COUNT(*) as total_records,
        MIN(received_at) as earliest_record,
        MAX(received_at) as latest_record
      FROM telemetry
      WHERE machine_id = ? ${timeCondition}
    `,
      [machine_id]
    );

    // Get latest telemetry for current status
    const latest = await db.query(
      `
      SELECT data FROM telemetry
      WHERE machine_id = ?
      ORDER BY received_at DESC
      LIMIT 1
    `,
      [machine_id]
    );

    let current_status = null;
    if (latest.length > 0) {
      current_status = JSON.parse(latest[0].data);
    }

    res.json({
      machine_id,
      period,
      summary: summary[0],
      current_status,
    });
  } catch (error) {
    console.error("Get telemetry summary error:", error);
    res.status(500).json({
      error: "Failed to get telemetry summary",
    });
  }
});

module.exports = router;
