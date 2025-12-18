const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access token required",
    });
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET || "your-secret-key",
    (err, user) => {
      if (err) {
        return res.status(403).json({
          success: false,
          message: "Invalid or expired token",
        });
      }
      req.user = user;
      next();
    }
  );
}

// Middleware to check if user is admin
function authenticateAdmin(req, res, next) {
  const allowedRoles = ["admin", "super_admin", "SUPER_ADMIN", "ADMIN"];

  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: "Access denied. Admin privileges required.",
    });
  }
  next();
}

/**
 * GET /announcements/active
 * Get active announcements for display (public - no auth required)
 */
router.get("/active", async (req, res) => {
  try {
    const { platform, machine_id } = req.query; // platform: 'web' | 'mobile'
    const now = new Date().toISOString();

    // Build query
    let query = supabase
      .from("announcements")
      .select(
        "id, title, message, type, priority, icon, bg_color, text_color, has_action_button, action_button_text, action_button_url"
      )
      .eq("is_active", true)
      .or(`start_date.is.null,start_date.lte.${now}`)
      .or(`end_date.is.null,end_date.gte.${now}`);

    // Filter by platform
    if (platform === "web") {
      query = query.eq("show_on_web", true);
    } else if (platform === "mobile") {
      query = query.eq("show_on_mobile", true);
    }

    // Filter by machine (if specified)
    if (machine_id) {
      // For JSONB array: target_machines is null OR contains machine_id
      query = query.or(
        `target_machines.is.null,target_machines.cs.["${machine_id}"]`
      );
    }

    // Order and limit
    query = query.order("priority", { ascending: false }).order("created_at", {
      ascending: false,
    });
    query = query.limit(10);

    const { data: announcements, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: announcements || [],
      count: announcements?.length || 0,
    });
  } catch (error) {
    console.error("Error fetching active announcements:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch announcements",
      error: error.message,
    });
  }
});

/**
 * POST /announcements/track
 * Track announcement interaction (view/click/dismiss)
 * Public endpoint - no auth required
 */
router.post("/track", async (req, res) => {
  try {
    const { announcement_id, user_id, machine_id, action } = req.body;

    // Validate action
    if (!["VIEWED", "CLICKED", "DISMISSED"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Invalid action type",
      });
    }

    // Insert tracking record
    const { error: insertError } = await supabase
      .from("announcement_views")
      .insert({
        announcement_id,
        user_id: user_id || "anonymous",
        machine_id,
        action,
      });

    if (insertError) throw insertError;

    // Update counter in announcements table
    const counterField =
      action === "VIEWED"
        ? "view_count"
        : action === "CLICKED"
        ? "click_count"
        : "dismiss_count";

    // Get current count
    const { data: currentData, error: fetchError } = await supabase
      .from("announcements")
      .select(counterField)
      .eq("id", announcement_id)
      .single();

    if (fetchError) throw fetchError;

    // Increment counter
    const { error: updateError } = await supabase
      .from("announcements")
      .update({
        [counterField]: (currentData?.[counterField] || 0) + 1,
      })
      .eq("id", announcement_id);

    if (updateError) throw updateError;

    res.json({ success: true });
  } catch (error) {
    console.error("Error tracking announcement:", error);
    res.status(500).json({
      success: false,
      message: "Failed to track announcement",
      error: error.message,
    });
  }
});

/**
 * GET /announcements (Admin only)
 * Get all announcements with pagination
 */
router.get("/", authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { limit = 50, offset = 0, is_active } = req.query;

    let query = supabase.from("announcements").select("*");

    if (is_active !== undefined) {
      query = query.eq("is_active", is_active === "true");
    }

    query = query
      .order("created_at", { ascending: false })
      .range(
        parseInt(offset),
        parseInt(offset) + parseInt(limit) - 1
      );

    const { data: announcements, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: announcements || [],
      total: count || announcements?.length || 0,
    });
  } catch (error) {
    console.error("Error fetching announcements:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch announcements",
      error: error.message,
    });
  }
});

/**
 * POST /announcements (Admin only)
 * Create new announcement
 */
router.post("/", authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const {
      title,
      message,
      type,
      priority,
      icon,
      bg_color,
      text_color,
      show_on_web,
      show_on_mobile,
      target_machines,
      start_date,
      end_date,
      has_action_button,
      action_button_text,
      action_button_url,
    } = req.body;

    const created_by = req.user.username || req.user.email;

    const { data, error } = await supabase
      .from("announcements")
      .insert({
        title,
        message,
        type: type || "INFO",
        priority: priority || 0,
        icon,
        bg_color,
        text_color,
        show_on_web: show_on_web !== false,
        show_on_mobile: show_on_mobile !== false,
        target_machines: target_machines || null,
        start_date,
        end_date,
        has_action_button: has_action_button || false,
        action_button_text,
        action_button_url,
        created_by,
      })
      .select("id")
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: "Announcement created successfully",
      id: data.id,
    });
  } catch (error) {
    console.error("Error creating announcement:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create announcement",
      error: error.message,
    });
  }
});

/**
 * PUT /announcements/:id (Admin only)
 * Update announcement
 */
router.put("/:id", authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Build update object with allowed fields
    const allowedFields = [
      "title",
      "message",
      "type",
      "priority",
      "icon",
      "bg_color",
      "text_color",
      "show_on_web",
      "show_on_mobile",
      "target_machines",
      "start_date",
      "end_date",
      "has_action_button",
      "action_button_text",
      "action_button_url",
      "is_active",
    ];

    const updateData = {};
    Object.keys(updates).forEach((key) => {
      if (allowedFields.includes(key)) {
        updateData[key] = updates[key];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields to update",
      });
    }

    // Add updated_at
    updateData.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from("announcements")
      .update(updateData)
      .eq("id", parseInt(id));

    if (error) throw error;

    res.json({
      success: true,
      message: "Announcement updated successfully",
    });
  } catch (error) {
    console.error("Error updating announcement:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update announcement",
      error: error.message,
    });
  }
});

/**
 * DELETE /announcements/:id (Admin only)
 * Delete announcement
 */
router.delete(
  "/:id",
  authenticateToken,
  authenticateAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      const { error } = await supabase
        .from("announcements")
        .delete()
        .eq("id", parseInt(id));

      if (error) throw error;

      res.json({
        success: true,
        message: "Announcement deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting announcement:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete announcement",
        error: error.message,
      });
    }
  }
);

module.exports = router;
