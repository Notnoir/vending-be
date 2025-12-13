const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const db = require("../config/database");
const { supabase } = require("../config/supabase");

const USE_SUPABASE = process.env.USE_SUPABASE === "true";
const router = express.Router();

// Validation middleware
const validateLogin = [
  body("username").notEmpty().withMessage("Username is required"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
];

// Admin login
router.post("/login", validateLogin, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array(),
      });
    }

    const { username, password } = req.body;

    let userInfo;

    if (USE_SUPABASE) {
      // Supabase: Find user
      const { data: userData, error } = await supabase
        .from("admin_users")
        .select("*")
        .eq("username", username)
        .eq("is_active", true)
        .single();

      if (error || !userData) {
        return res.status(401).json({
          error: "Invalid credentials",
        });
      }

      userInfo = userData;
    } else {
      // MySQL: Find user
      const user = await db.query(
        `SELECT * FROM admin_users WHERE username = ? AND is_active = 1`,
        [username]
      );

      if (user.length === 0) {
        return res.status(401).json({
          error: "Invalid credentials",
        });
      }

      userInfo = user[0];
    }

    // Check password
    const isValidPassword = await bcrypt.compare(
      password,
      userInfo.password_hash
    );
    if (!isValidPassword) {
      return res.status(401).json({
        error: "Invalid credentials",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: userInfo.id,
        username: userInfo.username,
        role: userInfo.role,
      },
      process.env.JWT_SECRET || "default-secret-key",
      { expiresIn: process.env.JWT_EXPIRE || "24h" }
    );

    // Update last login
    if (USE_SUPABASE) {
      await supabase
        .from("admin_users")
        .update({ last_login: new Date().toISOString() })
        .eq("id", userInfo.id);
    } else {
      await db.query(`UPDATE admin_users SET last_login = NOW() WHERE id = ?`, [
        userInfo.id,
      ]);
    }

    res.json({
      token,
      user: {
        id: userInfo.id,
        username: userInfo.username,
        email: userInfo.email,
        role: userInfo.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      error: "Login failed",
    });
  }
});

// Machine authentication (for Pi/ESP32)
router.post("/machine", async (req, res) => {
  try {
    const { machine_id, token } = req.body;

    if (!machine_id || !token) {
      return res.status(400).json({
        error: "Machine ID and token are required",
      });
    }

    // Verify machine token
    const machine = await db.query(
      `
      SELECT * FROM machines WHERE id = ? AND token = ?
    `,
      [machine_id, token]
    );

    if (machine.length === 0) {
      return res.status(401).json({
        error: "Invalid machine credentials",
      });
    }

    // Generate machine JWT
    const machineToken = jwt.sign(
      {
        machine_id,
        type: "machine",
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    // Update machine status
    await db.query(
      `
      UPDATE machines SET status = 'ONLINE', last_seen = NOW() WHERE id = ?
    `,
      [machine_id]
    );

    res.json({
      token: machineToken,
      machine_id,
      status: "authenticated",
    });
  } catch (error) {
    console.error("Machine auth error:", error);
    res.status(500).json({
      error: "Machine authentication failed",
    });
  }
});

// Verify token middleware
const verifyToken = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({
      error: "Access denied. No token provided.",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      error: "Invalid token",
    });
  }
};

// Get current user info
router.get("/me", verifyToken, async (req, res) => {
  try {
    if (req.user.type === "machine") {
      const machine = await db.query(
        `
        SELECT id, name, location, status FROM machines WHERE id = ?
      `,
        [req.user.machine_id]
      );

      return res.json({
        type: "machine",
        machine: machine[0] || null,
      });
    }

    const user = await db.query(
      `
      SELECT id, username, email, role, last_login FROM admin_users WHERE id = ?
    `,
      [req.user.id]
    );

    if (user.length === 0) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    res.json({
      type: "admin",
      user: user[0],
    });
  } catch (error) {
    console.error("Get user info error:", error);
    res.status(500).json({
      error: "Failed to get user info",
    });
  }
});

module.exports = { router, verifyToken };
