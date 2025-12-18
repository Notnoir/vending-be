const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

// Initialize MQTT Service
const mqttService = require("./services/mqttService");

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});
app.use("/api/", limiter);

// CORS configuration
const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? [
        process.env.FRONTEND_URL || "https://vending-fe.vercel.app",
        "https://vending-machine-frontend.vercel.app",
        process.env.BACKEND_URL || "https://vending-be.onrender.com",
      ]
    : [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.168.100.17:3000", 
        "http://localhost:3001",
      ];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, curl, etc)
      if (!origin) return callback(null, true);

      // Development mode - allow all
      if (process.env.NODE_ENV !== "production") {
        return callback(null, true);
      }

      // Production mode - check allowed origins
      // 1. Check exact match
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }

      // 2. Allow all Vercel preview deployments
      if (origin.endsWith(".vercel.app")) {
        console.log(`✅ CORS allowed for Vercel deployment: ${origin}`);
        return callback(null, true);
      }

      // 3. Allow Render deployments
      if (origin.endsWith(".onrender.com")) {
        console.log(`✅ CORS allowed for Render deployment: ${origin}`);
        return callback(null, true);
      }

      // 4. Allow localhost and 127.0.0.1 for testing
      if (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) {
        console.log(`✅ CORS allowed for localhost: ${origin}`);
        return callback(null, true);
      }

      // Log and reject
      console.error(`❌ CORS blocked origin: ${origin}`);
      console.error(`Allowed origins:`, allowedOrigins);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Static files
app.use("/uploads", express.static("uploads"));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// API Routes
app.use("/api/auth", require("./routes/auth").router);

// Load new routes with error handling
try {
  const usersRouter = require("./routes/users");
  app.use("/api/users", usersRouter);
  console.log("✅ Users route loaded");
} catch (error) {
  console.error("❌ Failed to load users route:", error.message);
}

try {
  const machineDataRouter = require("./routes/machine-data");
  app.use("/api/machine-data", machineDataRouter);
  console.log("✅ Machine-data route loaded");
} catch (error) {
  console.error("❌ Failed to load machine-data route:", error.message);
}

app.use("/api/machines", require("./routes/machines"));
app.use("/api/products", require("./routes/products"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/payments", require("./routes/payments"));
app.use("/api/dispense", require("./routes/dispense"));
app.use("/api/stock", require("./routes/stock"));
app.use("/api/telemetry", require("./routes/telemetry"));
app.use("/api/upload", require("./routes/upload"));
app.use("/api/health-assistant", require("./routes/healthAssistant"));
app.use("/api/prescription-scan", require("./routes/prescriptionScan"));
app.use("/api/debug", require("./routes/debug")); // Debug endpoints for testing
app.use("/api/announcements", require("./routes/announcements")); // Announcement system


// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      error: "Invalid JSON payload",
    });
  }

  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation error",
      details: err.details,
    });
  }

  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message || "Something went wrong",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Vending Machine Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(
    `📡 MQTT Service: ${
      mqttService.isConnected ? "Connected" : "Initializing..."
    }`
  );
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down gracefully...");
  mqttService.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Shutting down gracefully...");
  mqttService.close();
  process.exit(0);
});

module.exports = app;
