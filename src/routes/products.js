const express = require("express");
const db = require("../config/database");

const router = express.Router();

// Get all products with availability
router.get("/", async (req, res) => {
  try {
    const { machine_id } = req.query;
    const currentMachine = machine_id || process.env.MACHINE_ID || "VM01";

    const products = await db.query(
      `
      SELECT 
        p.*,
        s.id as slot_id,
        s.slot_number,
        s.current_stock,
        s.capacity,
        s.price_override,
        COALESCE(s.price_override, p.price) as final_price,
        s.is_active as slot_active
      FROM products p
      LEFT JOIN slots s ON p.id = s.product_id AND s.machine_id = ?
      WHERE p.is_active = 1
      ORDER BY s.slot_number ASC, p.name ASC
    `,
      [currentMachine]
    );

    // Group by product and include all slots
    const productMap = new Map();

    products.forEach((product) => {
      const productId = product.id;

      if (!productMap.has(productId)) {
        productMap.set(productId, {
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          image_url: product.image_url,
          category: product.category,
          is_active: product.is_active,
          slots: [],
        });
      }

      if (product.slot_id) {
        productMap.get(productId).slots.push({
          slot_id: product.slot_id,
          slot_number: product.slot_number,
          current_stock: product.current_stock,
          capacity: product.capacity,
          final_price: product.final_price,
          is_available: product.slot_active && product.current_stock > 0,
        });
      }
    });

    const result = Array.from(productMap.values());

    res.json({
      machine_id: currentMachine,
      products: result,
    });
  } catch (error) {
    console.error("Get products error:", error);
    res.status(500).json({
      error: "Failed to get products",
    });
  }
});

// Get available products for purchase (only with stock)
router.get("/available", async (req, res) => {
  try {
    const { machine_id } = req.query;
    const currentMachine = machine_id || process.env.MACHINE_ID || "VM01";

    const products = await db.query(
      `
      SELECT 
        p.*,
        s.id as slot_id,
        s.slot_number,
        s.current_stock,
        COALESCE(s.price_override, p.price) as final_price
      FROM products p
      JOIN slots s ON p.id = s.product_id
      WHERE p.is_active = 1 
        AND s.is_active = 1 
        AND s.current_stock > 0
        AND s.machine_id = ?
      ORDER BY s.slot_number ASC
    `,
      [currentMachine]
    );

    res.json({
      machine_id: currentMachine,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.final_price,
        image_url: p.image_url,
        category: p.category,
        slot_id: p.slot_id,
        slot_number: p.slot_number,
        current_stock: p.current_stock,
      })),
    });
  } catch (error) {
    console.error("Get available products error:", error);
    res.status(500).json({
      error: "Failed to get available products",
    });
  }
});

// Get single product
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { machine_id } = req.query;
    const currentMachine = machine_id || process.env.MACHINE_ID || "VM01";

    const product = await db.query(
      `
      SELECT 
        p.*,
        s.id as slot_id,
        s.slot_number,
        s.current_stock,
        s.capacity,
        s.price_override,
        COALESCE(s.price_override, p.price) as final_price,
        s.is_active as slot_active
      FROM products p
      LEFT JOIN slots s ON p.id = s.product_id AND s.machine_id = ?
      WHERE p.id = ?
    `,
      [currentMachine, id]
    );

    if (product.length === 0) {
      return res.status(404).json({
        error: "Product not found",
      });
    }

    const productInfo = product[0];
    const slots = product
      .filter((p) => p.slot_id)
      .map((p) => ({
        slot_id: p.slot_id,
        slot_number: p.slot_number,
        current_stock: p.current_stock,
        capacity: p.capacity,
        final_price: p.final_price,
        is_available: p.slot_active && p.current_stock > 0,
      }));

    res.json({
      id: productInfo.id,
      name: productInfo.name,
      description: productInfo.description,
      price: productInfo.price,
      image_url: productInfo.image_url,
      category: productInfo.category,
      is_active: productInfo.is_active,
      slots,
    });
  } catch (error) {
    console.error("Get product error:", error);
    res.status(500).json({
      error: "Failed to get product",
    });
  }
});

module.exports = router;
