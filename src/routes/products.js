const express = require("express");
const db = require("../config/database");
const upload = require("../config/upload");
const { supabaseStorage } = require("../config/supabase");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// Supabase Storage bucket name
const STORAGE_BUCKET = "product-images";

// Get all products (admin - simple list without slots)
router.get("/all", async (req, res) => {
  try {
    let products;

    if (process.env.USE_SUPABASE === "true") {
      // Supabase: Get all products
      const supabase = db.getClient();
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      products = data;
    } else {
      // MySQL: Get all products
      products = await db.query(
        "SELECT * FROM products ORDER BY created_at DESC"
      );
    }

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

    if (process.env.USE_SUPABASE === "true") {
      // Supabase: Use getClient() to access supabase instance
      const supabase = db.getClient();

      const { data: products, error } = await supabase
        .from("slots")
        .select(
          `
          id,
          slot_number,
          current_stock,
          price_override,
          product_id,
          products (
            id,
            name,
            description,
            price,
            image_url,
            category,
            is_active
          )
        `
        )
        .eq("machine_id", currentMachine)
        .eq("is_active", true)
        .gt("current_stock", 0)
        .order("slot_number", { ascending: true });

      if (error) throw error;

      // Filter out slots where product is not active
      const activeProducts = products.filter(
        (slot) => slot.products && slot.products.is_active
      );

      // Transform data to match expected format
      const transformedProducts = activeProducts.map((slot) => ({
        id: slot.products.id,
        name: slot.products.name,
        description: slot.products.description,
        price: slot.products.price,
        image_url: slot.products.image_url,
        category: slot.products.category,
        is_active: slot.products.is_active,
        slot_id: slot.id,
        slot_number: slot.slot_number,
        current_stock: slot.current_stock,
        final_price: slot.price_override || slot.products.price,
      }));

      res.json({
        success: true,
        data: transformedProducts,
        count: transformedProducts.length,
      });
    } else {
      // MySQL: Use raw SQL query
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
        success: true,
        data: products,
        count: products.length,
      });
    }
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
  let uploadedFilePath = null;

  try {
    const { name, description, price, category, is_active } = req.body;

    // Validation
    if (!name || !price) {
      return res.status(400).json({
        error: "Name and price are required",
      });
    }

    let image_url = null;

    // Upload image to Supabase Storage if file uploaded
    if (req.file && process.env.USE_SUPABASE === "true") {
      try {
        const timestamp = Date.now();
        const fileExt = path.extname(req.file.originalname);
        const fileName = `${timestamp}-${Math.random()
          .toString(36)
          .substring(7)}${fileExt}`;
        const filePath = `products/${fileName}`;

        // Upload to Supabase Storage
        const { publicUrl, path: storagePath } =
          await supabaseStorage.uploadFile(
            STORAGE_BUCKET,
            filePath,
            req.file.buffer,
            {
              contentType: req.file.mimetype,
              upsert: false,
            }
          );

        image_url = publicUrl;
        uploadedFilePath = storagePath;

        console.log("✅ Image uploaded to Supabase Storage:", publicUrl);
      } catch (uploadError) {
        console.error("❌ Supabase Storage upload failed:", uploadError);
        throw new Error("Failed to upload image to storage");
      }
    } else if (req.file) {
      // Fallback to local storage for MySQL
      image_url = `/uploads/products/${req.file.filename}`;
    }

    const productData = {
      name,
      description: description || null,
      price: parseFloat(price),
      image_url,
      category: category || "Minuman",
      is_active: is_active === "true" || is_active === true,
    };

    let newProduct;

    if (process.env.USE_SUPABASE === "true") {
      // Supabase: Insert product
      const supabase = db.getClient();

      const { data, error } = await supabase
        .from("products")
        .insert(productData)
        .select()
        .single();

      if (error) {
        // Rollback: Delete uploaded image if product creation fails
        if (uploadedFilePath) {
          await supabaseStorage.deleteFile(STORAGE_BUCKET, uploadedFilePath);
        }
        throw error;
      }
      newProduct = data;
    } else {
      // MySQL: Insert product
      const result = await db.query(
        `
        INSERT INTO products (name, description, price, image_url, category, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        [
          productData.name,
          productData.description,
          productData.price,
          productData.image_url,
          productData.category,
          productData.is_active,
        ]
      );

      newProduct = {
        id: result.insertId,
        ...productData,
      };
    }

    res.status(201).json({
      message: "Product created successfully",
      product: newProduct,
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
  let uploadedFilePath = null;

  try {
    const { id } = req.params;
    const { name, description, price, category, is_active } = req.body;

    let oldProduct;

    if (process.env.USE_SUPABASE === "true") {
      // Supabase: Get existing product
      const supabase = db.getClient();
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {
        return res.status(404).json({
          error: "Product not found",
        });
      }
      oldProduct = data;
    } else {
      // MySQL: Check if product exists
      const existing = await db.query("SELECT * FROM products WHERE id = ?", [
        id,
      ]);

      if (existing.length === 0) {
        return res.status(404).json({
          error: "Product not found",
        });
      }
      oldProduct = existing[0];
    }

    // Prepare update data
    let image_url = oldProduct.image_url;
    let oldImagePath = null;

    // If new image uploaded
    if (req.file) {
      if (process.env.USE_SUPABASE === "true") {
        // Upload new image to Supabase Storage
        try {
          const timestamp = Date.now();
          const fileExt = path.extname(req.file.originalname);
          const fileName = `${timestamp}-${Math.random()
            .toString(36)
            .substring(7)}${fileExt}`;
          const filePath = `products/${fileName}`;

          const { publicUrl, path: storagePath } =
            await supabaseStorage.uploadFile(
              STORAGE_BUCKET,
              filePath,
              req.file.buffer,
              {
                contentType: req.file.mimetype,
                upsert: false,
              }
            );

          image_url = publicUrl;
          uploadedFilePath = storagePath;

          // Extract old image path from Supabase URL for deletion later
          if (oldProduct.image_url) {
            oldImagePath = supabaseStorage.extractPathFromUrl(
              oldProduct.image_url
            );
          }

          console.log("✅ New image uploaded to Supabase Storage:", publicUrl);
        } catch (uploadError) {
          console.error("❌ Supabase Storage upload failed:", uploadError);
          throw new Error("Failed to upload image to storage");
        }
      } else {
        // Delete old local image if exists
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
    }

    const updateData = {
      name: name || oldProduct.name,
      description:
        description !== undefined ? description : oldProduct.description,
      price: price !== undefined ? parseFloat(price) : oldProduct.price,
      image_url,
      category: category || oldProduct.category,
      is_active:
        is_active !== undefined
          ? is_active === "true" || is_active === true
          : oldProduct.is_active,
    };

    let updatedProduct;

    if (process.env.USE_SUPABASE === "true") {
      // Supabase: Update product
      const supabase = db.getClient();

      const { data, error } = await supabase
        .from("products")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        // Rollback: Delete newly uploaded image if update fails
        if (uploadedFilePath) {
          await supabaseStorage.deleteFile(STORAGE_BUCKET, uploadedFilePath);
        }
        throw error;
      }

      updatedProduct = data;

      // Success: Delete old image from Supabase Storage
      if (oldImagePath && req.file) {
        await supabaseStorage.deleteFile(STORAGE_BUCKET, oldImagePath);
        console.log("✅ Old image deleted from Supabase Storage");
      }
    } else {
      // MySQL: Update product
      await db.query(
        `
        UPDATE products 
        SET name = ?, description = ?, price = ?, image_url = ?, category = ?, is_active = ?
        WHERE id = ?
      `,
        [
          updateData.name,
          updateData.description,
          updateData.price,
          updateData.image_url,
          updateData.category,
          updateData.is_active,
          id,
        ]
      );

      updatedProduct = {
        id: parseInt(id),
        ...updateData,
      };
    }

    res.json({
      message: "Product updated successfully",
      product: updatedProduct,
    });
  } catch (error) {
    console.error("Update product error:", error);

    // Rollback: Delete uploaded file if update failed
    if (req.file) {
      if (process.env.USE_SUPABASE === "true" && uploadedFilePath) {
        // Delete from Supabase Storage
        await supabaseStorage.deleteFile(STORAGE_BUCKET, uploadedFilePath);
        console.log(
          "🔄 Rolled back: Deleted uploaded image from Supabase Storage"
        );
      } else if (req.file.filename) {
        // Delete from local filesystem
        const filePath = path.join(
          __dirname,
          "../../uploads/products",
          req.file.filename
        );
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
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

    let product;

    if (process.env.USE_SUPABASE === "true") {
      // Supabase: Get product
      const supabase = db.getClient();
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {
        return res.status(404).json({
          error: "Product not found",
        });
      }
      product = data;
    } else {
      // MySQL: Get product to delete image
      const result = await db.query("SELECT * FROM products WHERE id = ?", [
        id,
      ]);

      if (result.length === 0) {
        return res.status(404).json({
          error: "Product not found",
        });
      }
      product = result[0];
    }

    // Delete image
    if (product.image_url) {
      if (process.env.USE_SUPABASE === "true") {
        // Delete from Supabase Storage
        const imagePath = supabaseStorage.extractPathFromUrl(product.image_url);
        if (imagePath) {
          await supabaseStorage.deleteFile(STORAGE_BUCKET, imagePath);
          console.log("✅ Image deleted from Supabase Storage:", imagePath);
        }
      } else {
        // Delete local file
        if (product.image_url.startsWith("/uploads/")) {
          const filename = path.basename(product.image_url);
          const filePath = path.join(
            __dirname,
            "../../uploads/products",
            filename
          );
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      }
    }

    if (process.env.USE_SUPABASE === "true") {
      // Supabase: Delete product
      const supabase = db.getClient();
      const { error } = await supabase.from("products").delete().eq("id", id);

      if (error) throw error;
    } else {
      // MySQL: Delete product
      await db.query("DELETE FROM products WHERE id = ?", [id]);
    }

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
