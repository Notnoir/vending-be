const express = require("express");
const { body, validationResult } = require("express-validator");
const { supabase } = require("../config/supabase");

const router = express.Router();

// Validation middleware
const validateTelemetry = [
  body("machine_id").notEmpty().withMessage("Machine ID is required"),
  body("data").isObject().withMessage("Telemetry data must be an object"),
];

/**
 * POST /api/telemetry
 * DEPRECATED: Now redirects to machine-data endpoint
 * Kept for backward compatibility with old ESP32 code
 */
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
    const { data: machine, error: machineError } = await supabase
      .from("machines")
      .select("id")
      .eq("id", machine_id)
      .single();

    if (machineError || !machine) {
      return res.status(404).json({
        error: "Machine not found",
      });
    }

    // Store to machine_data table
    const { error: insertError } = await supabase.from("machine_data").insert({
      machine_id,
      temperature: data.temperature || null,
      humidity: data.humidity || null,
      door_status: data.door_open || data.doorOpen ? "open" : "closed",
      power_status: "on",
      status: "normal",
      recorded_at: new Date().toISOString(),
    });

    if (insertError) {
      throw insertError;
    }

    // Update machine last_seen
    await supabase
      .from("machines")
      .update({ last_seen: new Date().toISOString() })
      .eq("id", machine_id);

    res.json({
      machine_id,
      received_at: new Date().toISOString(),
      status: "processed",
      note: "Data saved to machine_data table",
    });
  } catch (error) {
    console.error("Telemetry error:", error);
    res.status(500).json({
      error: "Failed to process telemetry",
    });
  }
});

/**
 * GET /api/telemetry/:machine_id
 * DEPRECATED: Redirects to machine-data endpoint
 */
router.get("/:machine_id", async (req, res) => {
  try {
    const { machine_id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Fetch from machine_data instead
    let query = supabase
      .from("machine_data")
      .select("*")
      .eq("machine_id", machine_id)
      .order("recorded_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    const { data: machineData, error } = await query;

    if (error) throw error;

    // Transform to old telemetry format for backward compatibility
    const telemetry = machineData.map((d) => ({
      id: d.id,
      data: {
        temperature: d.temperature,
        humidity: d.humidity,
        door_open: d.door_status === "open",
      },
      received_at: d.recorded_at,
    }));

    res.json({
      machine_id,
      telemetry,
      limit: parseInt(limit),
      offset: parseInt(offset),
      note: "Data served from machine_data table",
    });
  } catch (error) {
    console.error("Get telemetry error:", error);
    res.status(500).json({
      error: "Failed to get telemetry data",
    });
  }
});

/**
 * GET /api/telemetry/:machine_id/latest
 * DEPRECATED: Redirects to machine-data endpoint
 */
router.get("/:machine_id/latest", async (req, res) => {
  try {
    const { machine_id } = req.params;

    // Fetch from machine_data instead
    const { data: machineData, error } = await supabase
      .from("machine_data")
      .select("*")
      .eq("machine_id", machine_id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !machineData) {
      return res.status(404).json({
        error: "No telemetry data found",
      });
    }

    // Transform to old telemetry format
    res.json({
      machine_id,
      data: {
        temperature: machineData.temperature,
        humidity: machineData.humidity,
        door_open: machineData.door_status === "closed",
      },
      received_at: machineData.recorded_at,
      note: "Data served from machine_data table",
    });
  } catch (error) {
    console.error("Get latest telemetry error:", error);
    res.status(500).json({
      error: "Failed to get latest telemetry",
    });
  }
});

module.exports = router;
