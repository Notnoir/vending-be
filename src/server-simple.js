const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(compression());

// CORS configuration
app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
  })
);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Vending Machine Backend is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// Mock data untuk testing (tanpa database)
const mockProducts = [
  {
    id: 1,
    name: "Coca Cola",
    price: 5000,
    image_url: "/images/coca-cola.jpg",
    stock: 10,
    slot_number: "A1",
    description: "Minuman soda segar",
  },
  {
    id: 2,
    name: "Pepsi",
    price: 5000,
    image_url: "/images/pepsi.jpg",
    stock: 8,
    slot_number: "A2",
    description: "Minuman cola yang menyegarkan",
  },
  {
    id: 3,
    name: "Sprite",
    price: 4500,
    image_url: "/images/sprite.jpg",
    stock: 12,
    slot_number: "A3",
    description: "Minuman lemon-lime segar",
  },
  {
    id: 4,
    name: "Fanta",
    price: 4500,
    image_url: "/images/fanta.jpg",
    stock: 6,
    slot_number: "B1",
    description: "Minuman jeruk yang manis",
  },
  {
    id: 5,
    name: "Aqua",
    price: 3000,
    image_url: "/images/aqua.jpg",
    stock: 15,
    slot_number: "B2",
    description: "Air mineral murni",
  },
  {
    id: 6,
    name: "Teh Botol",
    price: 4000,
    image_url: "/images/teh-botol.jpg",
    stock: 9,
    slot_number: "B3",
    description: "Teh manis dalam botol",
  },
];

let orders = [];
let payments = [];

// API Routes untuk testing tanpa database

// Products endpoints
app.get("/api/products", (req, res) => {
  const { machine_id } = req.query;
  res.json({
    success: true,
    data: mockProducts,
    machine_id: machine_id || "VM01",
  });
});

app.get("/api/products/:id", (req, res) => {
  const product = mockProducts.find((p) => p.id === parseInt(req.params.id));
  if (product) {
    res.json({ success: true, data: product });
  } else {
    res.status(404).json({ success: false, error: "Product not found" });
  }
});

// Orders endpoints
app.post("/api/orders", (req, res) => {
  const { machine_id, product_id, quantity } = req.body;

  const product = mockProducts.find((p) => p.id === parseInt(product_id));
  if (!product) {
    return res.status(404).json({ success: false, error: "Product not found" });
  }

  if (product.stock < quantity) {
    return res
      .status(400)
      .json({ success: false, error: "Insufficient stock" });
  }

  const order = {
    id: Date.now(),
    machine_id: machine_id || "VM01",
    product_id: parseInt(product_id),
    product_name: product.name,
    quantity: quantity || 1,
    unit_price: product.price,
    total_amount: product.price * (quantity || 1),
    status: "pending",
    created_at: new Date().toISOString(),
  };

  orders.push(order);

  res.json({
    success: true,
    data: order,
    message: "Order created successfully",
  });
});

app.get("/api/orders/:id", (req, res) => {
  const order = orders.find((o) => o.id === parseInt(req.params.id));
  if (order) {
    res.json({ success: true, data: order });
  } else {
    res.status(404).json({ success: false, error: "Order not found" });
  }
});

// Payments endpoints
app.post("/api/payments", (req, res) => {
  const { order_id, payment_method } = req.body;

  const order = orders.find((o) => o.id === parseInt(order_id));
  if (!order) {
    return res.status(404).json({ success: false, error: "Order not found" });
  }

  const payment = {
    id: Date.now(),
    order_id: parseInt(order_id),
    amount: order.total_amount,
    payment_method: payment_method || "qris",
    status: "pending",
    qr_string: `vending-machine-payment-${Date.now()}`,
    payment_url: `https://simulator.sandbox.midtrans.com/qris/index?qr_code=${Date.now()}`,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes
    created_at: new Date().toISOString(),
  };

  payments.push(payment);

  res.json({
    success: true,
    data: payment,
    message: "Payment created successfully",
  });
});

app.post("/api/payments/:id/verify", (req, res) => {
  const payment = payments.find((p) => p.id === parseInt(req.params.id));
  if (!payment) {
    return res.status(404).json({ success: false, error: "Payment not found" });
  }

  // Simulate payment verification (always success for testing)
  payment.status = "completed";
  payment.verified_at = new Date().toISOString();

  // Update order status
  const order = orders.find((o) => o.id === payment.order_id);
  if (order) {
    order.status = "paid";
    order.paid_at = new Date().toISOString();
  }

  res.json({
    success: true,
    data: payment,
    message: "Payment verified successfully",
  });
});

// Dispense endpoints
app.post("/api/dispense", (req, res) => {
  const { order_id } = req.body;

  const order = orders.find((o) => o.id === parseInt(order_id));
  if (!order) {
    return res.status(404).json({ success: false, error: "Order not found" });
  }

  if (order.status !== "paid") {
    return res.status(400).json({ success: false, error: "Order not paid" });
  }

  // Simulate dispensing
  const product = mockProducts.find((p) => p.id === order.product_id);
  if (product) {
    product.stock -= order.quantity; // Reduce stock
  }

  const dispense = {
    id: Date.now(),
    order_id: parseInt(order_id),
    product_name: order.product_name,
    quantity: order.quantity,
    slot_number: product?.slot_number || "A1",
    status: "dispensing",
    started_at: new Date().toISOString(),
  };

  // Simulate dispensing delay
  setTimeout(() => {
    dispense.status = "completed";
    dispense.completed_at = new Date().toISOString();

    // Update order status
    order.status = "completed";
    order.completed_at = new Date().toISOString();
  }, 3000);

  res.json({
    success: true,
    data: dispense,
    message: "Dispensing started",
  });
});

// Machine status endpoint
app.get("/api/machines/VM01/status", (req, res) => {
  res.json({
    success: true,
    data: {
      id: "VM01",
      name: "Vending Machine Test",
      status: "online",
      location: "Testing Lab",
      last_ping: new Date().toISOString(),
    },
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: err.message,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Vending Machine Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`⚠️  Running in SIMPLE MODE - No database/MQTT required`);
  console.log(`🎯 Frontend URL: http://localhost:3000`);
  console.log(`📱 Test products: ${mockProducts.length} items available`);
});
