const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Validation middleware
const validateRegister = [
  body("email").isEmail().withMessage("Valid email is required"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
  body("full_name").notEmpty().withMessage("Full name is required"),
];

const validateLogin = [
  body("email").isEmail().withMessage("Valid email is required"),
  body("password").notEmpty().withMessage("Password is required"),
];

/**
 * @route   POST /api/users/register
 * @desc    Register new user (buyer)
 * @access  Public
 */
router.post("/register", validateRegister, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { email, password, full_name, phone } = req.body;

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("email")
      .eq("email", email)
      .single();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Create user
    const { data: newUser, error } = await supabase
      .from("users")
      .insert({
        email,
        password_hash,
        full_name,
        phone,
        role: "buyer", // Default role
      })
      .select("id, email, full_name, phone, role, created_at")
      .single();

    if (error) throw error;

    // Generate JWT token
    const token = jwt.sign(
      {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" }
    );

    res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user: newUser,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      message: "Registration failed",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/users/login
 * @desc    Login user (buyer/admin)
 * @access  Public
 */
router.post("/login", validateLogin, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { email, password, fcm_token } = req.body;

    // Find user
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .eq("is_active", true)
      .single();

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Update last login and FCM token
    const updates = { last_login: new Date().toISOString() };
    if (fcm_token) {
      updates.fcm_token = fcm_token;
    }

    await supabase.from("users").update(updates).eq("id", user.id);

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" }
    );

    // Return user data without password
    const { password_hash, ...userData } = user;

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: userData,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Login failed",
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/users/profile
 * @desc    Get user profile
 * @access  Private
 */
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, full_name, phone, role, created_at, last_login")
      .eq("id", req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
      error: error.message,
    });
  }
});

/**
 * @route   PUT /api/users/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put("/profile", authenticateToken, async (req, res) => {
  try {
    const { full_name, phone, fcm_token } = req.body;

    const updates = {};
    if (full_name) updates.full_name = full_name;
    if (phone) updates.phone = phone;
    if (fcm_token) updates.fcm_token = fcm_token;

    const { data: updatedUser, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", req.user.id)
      .select("id, email, full_name, phone, role")
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message,
    });
  }
});

/**
 * @route   PUT /api/users/password
 * @desc    Change password
 * @access  Private
 */
router.put(
  "/password",
  authenticateToken,
  [
    body("current_password")
      .notEmpty()
      .withMessage("Current password is required"),
    body("new_password")
      .isLength({ min: 6 })
      .withMessage("New password must be at least 6 characters"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { current_password, new_password } = req.body;

      // Get current user
      const { data: user } = await supabase
        .from("users")
        .select("password_hash")
        .eq("id", req.user.id)
        .single();

      // Verify current password
      const isValid = await bcrypt.compare(
        current_password,
        user.password_hash
      );
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: "Current password is incorrect",
        });
      }

      // Hash new password
      const new_password_hash = await bcrypt.hash(new_password, 10);

      // Update password
      const { error } = await supabase
        .from("users")
        .update({ password_hash: new_password_hash })
        .eq("id", req.user.id);

      if (error) throw error;

      res.json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to change password",
        error: error.message,
      });
    }
  }
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

module.exports = router;
