const express = require("express");
const db = require("../config/database");
const upload = require("../config/upload");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// Get all products (admin - simple list without slots)
router.get("/all", async (req, res) => {
  try {
    const products = await db.query(
      "SELECT * FROM products ORDER BY created_at DESC"
    );

    res.json(products);
  } catch (error) {
    console.error("Get all products error:", error);
    res.status(500).json({
      error: "Failed to get products",
    });
  }
});

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

// Create new product
router.post("/", upload.single("image"), async (req, res) => {
  try {
    const { name, description, price, category } = req.body;

    // Validation
    if (!name || !price) {
      return res.status(400).json({
        error: "Name and price are required",
      });
    }

    // Get image URL if uploaded
    const image_url = req.file
      ? `/uploads/products/${req.file.filename}`
      : null;

    // Insert product
    const result = await db.query(
      `
      INSERT INTO products (name, description, price, image_url, category, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `,
      [
        name,
        description || null,
        parseFloat(price),
        image_url,
        category || "beverage",
      ]
    );

    res.status(201).json({
      message: "Product created successfully",
      product: {
        id: result.insertId,
        name,
        description,
        price: parseFloat(price),
        image_url,
        category: category || "beverage",
        is_active: true,
      },
    });
  } catch (error) {
    console.error("Create product error:", error);

    // Delete uploaded file if product creation failed
    if (req.file) {
      const filePath = path.join(
        __dirname,
        "../../uploads/products",
        req.file.filename
      );
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.status(500).json({
      error: "Failed to create product",
    });
  }
});

// Update product
router.put("/:id", upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, category, is_active } = req.body;

    // Check if product exists
    const existing = await db.query("SELECT * FROM products WHERE id = ?", [
      id,
    ]);

    if (existing.length === 0) {
      return res.status(404).json({
        error: "Product not found",
      });
    }

    const oldProduct = existing[0];

    // Prepare update data
    let image_url = oldProduct.image_url;

    // If new image uploaded, delete old image and use new one
    if (req.file) {
      // Delete old image if exists
      if (
        oldProduct.image_url &&
        oldProduct.image_url.startsWith("/uploads/")
      ) {
        const oldFilename = path.basename(oldProduct.image_url);
        const oldFilePath = path.join(
          __dirname,
          "../../uploads/products",
          oldFilename
        );
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      }

      image_url = `/uploads/products/${req.file.filename}`;
    }

    // Update product
    await db.query(
      `
      UPDATE products 
      SET name = ?, description = ?, price = ?, image_url = ?, category = ?, is_active = ?
      WHERE id = ?
    `,
      [
        name || oldProduct.name,
        description !== undefined ? description : oldProduct.description,
        price !== undefined ? parseFloat(price) : oldProduct.price,
        image_url,
        category || oldProduct.category,
        is_active !== undefined ? is_active : oldProduct.is_active,
        id,
      ]
    );

    res.json({
      message: "Product updated successfully",
      product: {
        id: parseInt(id),
        name: name || oldProduct.name,
        description:
          description !== undefined ? description : oldProduct.description,
        price: price !== undefined ? parseFloat(price) : oldProduct.price,
        image_url,
        category: category || oldProduct.category,
        is_active: is_active !== undefined ? is_active : oldProduct.is_active,
      },
    });
  } catch (error) {
    console.error("Update product error:", error);

    // Delete uploaded file if update failed
    if (req.file) {
      const filePath = path.join(
        __dirname,
        "../../uploads/products",
        req.file.filename
      );
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.status(500).json({
      error: "Failed to update product",
    });
  }
});

// Delete product
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Get product to delete image
    const product = await db.query("SELECT * FROM products WHERE id = ?", [id]);

    if (product.length === 0) {
      return res.status(404).json({
        error: "Product not found",
      });
    }

    // Delete image if exists
    if (product[0].image_url && product[0].image_url.startsWith("/uploads/")) {
      const filename = path.basename(product[0].image_url);
      const filePath = path.join(__dirname, "../../uploads/products", filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Delete product
    await db.query("DELETE FROM products WHERE id = ?", [id]);

    res.json({
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Delete product error:", error);
    res.status(500).json({
      error: "Failed to delete product",
    });
  }
});

module.exports = router;
