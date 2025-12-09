const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * @route   GET /api/machine-data/latest
 * @desc    Get latest machine data for all machines
 * @access  Public
 */
router.get("/latest", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("latest_machine_data")
      .select("*")
      .order("recorded_at", { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error("Error fetching latest machine data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch machine data",
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/machine-data/machine/:machineId
 * @desc    Get machine data history for specific machine
 * @access  Public
 */
router.get("/machine/:machineId", async (req, res) => {
  try {
    const { machineId } = req.params;
    const { from, to, limit = 50 } = req.query;

    let query = supabase
      .from("machine_data")
      .select(
        `
        *,
        machines (
          name,
          location,
          status
        )
      `
      )
      .eq("machine_id", machineId)
      .order("recorded_at", { ascending: false })
      .limit(parseInt(limit));

    // Add date range filter if provided
    if (from) {
      query = query.gte("recorded_at", from);
    }
    if (to) {
      query = query.lte("recorded_at", to);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error("Error fetching machine data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch machine data",
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/machine-data/today
 * @desc    Get today's scheduled machine data (10:00, 12:00, 14:00)
 * @access  Public
 */
router.get("/today", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("today_machine_data")
      .select("*")
      .order("machine_id")
      .order("recorded_at");

    if (error) throw error;

    // Group by machine
    const groupedData = data.reduce((acc, item) => {
      if (!acc[item.machine_id]) {
        acc[item.machine_id] = {
          machine_id: item.machine_id,
          machine_name: item.machine_name,
          location: item.location,
          recordings: [],
        };
      }
      acc[item.machine_id].recordings.push(item);
      return acc;
    }, {});

    res.json({
      success: true,
      data: Object.values(groupedData),
    });
  } catch (error) {
    console.error("Error fetching today machine data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch today machine data",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/machine-data
 * @desc    Record new machine data (from IoT device)
 * @access  Public (should be protected with machine token in production)
 */
router.post("/", async (req, res) => {
  try {
    const {
      machine_id,
      temperature,
      humidity,
      door_status,
      power_status,
      stock_summary,
      sales_count,
      error_codes,
      status,
      recorded_at,
    } = req.body;

    // Validate required fields
    if (!machine_id || !recorded_at) {
      return res.status(400).json({
        success: false,
        message: "machine_id and recorded_at are required",
      });
    }

    // Check if machine exists
    const { data: machine, error: machineError } = await supabase
      .from("machines")
      .select("id")
      .eq("id", machine_id)
      .single();

    if (machineError || !machine) {
      return res.status(404).json({
        success: false,
        message: "Machine not found",
      });
    }

    // Insert machine data
    const { data, error } = await supabase
      .from("machine_data")
      .insert({
        machine_id,
        temperature,
        humidity,
        door_status,
        power_status,
        stock_summary,
        sales_count: sales_count || 0,
        error_codes,
        status: status || "normal",
        recorded_at,
      })
      .select()
      .single();

    if (error) throw error;

    // Update machine last_seen
    await supabase
      .from("machines")
      .update({ last_seen: new Date().toISOString() })
      .eq("id", machine_id);

    res.json({
      success: true,
      message: "Machine data recorded successfully",
      data,
    });
  } catch (error) {
    console.error("Error recording machine data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to record machine data",
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/machine-data/stats/:machineId
 * @desc    Get statistics for a specific machine
 * @access  Public
 */
router.get("/stats/:machineId", async (req, res) => {
  try {
    const { machineId } = req.params;
    const { days = 7 } = req.query;

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - parseInt(days));

    const { data, error } = await supabase
      .from("machine_data")
      .select("*")
      .eq("machine_id", machineId)
      .gte("recorded_at", fromDate.toISOString())
      .order("recorded_at", { ascending: true });

    if (error) throw error;

    // Calculate statistics
    const stats = {
      machine_id: machineId,
      period_days: parseInt(days),
      total_recordings: data.length,
      avg_temperature:
        data.length > 0
          ? (
              data.reduce(
                (sum, d) => sum + (parseFloat(d.temperature) || 0),
                0
              ) / data.length
            ).toFixed(2)
          : 0,
      avg_humidity:
        data.length > 0
          ? (
              data.reduce((sum, d) => sum + (parseFloat(d.humidity) || 0), 0) /
              data.length
            ).toFixed(2)
          : 0,
      total_sales: data.reduce((sum, d) => sum + (d.sales_count || 0), 0),
      status_distribution: data.reduce((acc, d) => {
        acc[d.status] = (acc[d.status] || 0) + 1;
        return acc;
      }, {}),
      temperature_trend: data.map((d) => ({
        recorded_at: d.recorded_at,
        temperature: d.temperature,
      })),
      stock_trend: data.map((d) => ({
        recorded_at: d.recorded_at,
        total_current: d.stock_summary?.total_current || 0,
        total_capacity: d.stock_summary?.total_capacity || 0,
      })),
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Error fetching machine stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch machine statistics",
      error: error.message,
    });
  }
});

module.exports = router;
