/**
 * Database Service - Unified interface for MySQL and Supabase
 * Provides abstraction layer for database operations
 */

const db = require("../config/database");
const { supabase } = require("../config/supabase");

const USE_SUPABASE = process.env.USE_SUPABASE === "true";

class DatabaseService {
  constructor() {
    this.useSupabase = USE_SUPABASE;
  }

  // ============================================
  // PRODUCTS
  // ============================================
  async getAllProducts(filters = {}) {
    if (this.useSupabase) {
      let query = supabase.from("products").select("*");

      if (filters.is_active !== undefined) {
        query = query.eq("is_active", filters.is_active);
      }
      if (filters.category) {
        query = query.eq("category", filters.category);
      }

      const { data, error } = await query.order("name");
      if (error) throw error;
      return data;
    }

    let sql = "SELECT * FROM products WHERE 1=1";
    const params = [];

    if (filters.is_active !== undefined) {
      sql += " AND is_active = ?";
      params.push(filters.is_active);
    }
    if (filters.category) {
      sql += " AND category = ?";
      params.push(filters.category);
    }

    sql += " ORDER BY name";
    return await db.query(sql, params);
  }

  async getProductById(id) {
    if (this.useSupabase) {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    }

    const rows = await db.query("SELECT * FROM products WHERE id = ?", [id]);
    return rows[0];
  }

  async createProduct(productData) {
    if (this.useSupabase) {
      const { data, error } = await supabase
        .from("products")
        .insert(productData)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const result = await db.query("INSERT INTO products SET ?", [productData]);
    return { id: result.insertId, ...productData };
  }

  async updateProduct(id, productData) {
    if (this.useSupabase) {
      const { data, error } = await supabase
        .from("products")
        .update(productData)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    await db.query("UPDATE products SET ? WHERE id = ?", [productData, id]);
    return await this.getProductById(id);
  }

  async deleteProduct(id) {
    if (this.useSupabase) {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      return true;
    }

    await db.query("DELETE FROM products WHERE id = ?", [id]);
    return true;
  }

  // ============================================
  // MACHINES
  // ============================================
  async getAllMachines() {
    if (this.useSupabase) {
      const { data, error } = await supabase
        .from("machines")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    }

    return await db.query("SELECT * FROM machines ORDER BY name");
  }

  async getMachineById(id) {
    if (this.useSupabase) {
      const { data, error } = await supabase
        .from("machines")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    }

    const rows = await db.query("SELECT * FROM machines WHERE id = ?", [id]);
    return rows[0];
  }

  async updateMachineStatus(id, status, lastSeen = new Date()) {
    if (this.useSupabase) {
      const { data, error } = await supabase
        .from("machines")
        .update({ status, last_seen: lastSeen })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    await db.query(
      "UPDATE machines SET status = ?, last_seen = ? WHERE id = ?",
      [status, lastSeen, id]
    );
    return await this.getMachineById(id);
  }

  // ============================================
  // SLOTS
  // ============================================
  async getSlotsByMachine(machineId) {
    if (this.useSupabase) {
      const { data, error } = await supabase
        .from("slots")
        .select(
          `
          *,
          product:products(*)
        `
        )
        .eq("machine_id", machineId)
        .order("slot_number");
      if (error) throw error;
      return data;
    }

    return await db.query(
      `
      SELECT s.*, p.* 
      FROM slots s 
      LEFT JOIN products p ON s.product_id = p.id 
      WHERE s.machine_id = ? 
      ORDER BY s.slot_number
    `,
      [machineId]
    );
  }

  async updateSlotStock(slotId, newStock) {
    if (this.useSupabase) {
      const { data, error } = await supabase
        .from("slots")
        .update({ current_stock: newStock })
        .eq("id", slotId)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    await db.query("UPDATE slots SET current_stock = ? WHERE id = ?", [
      newStock,
      slotId,
    ]);
    const rows = await db.query("SELECT * FROM slots WHERE id = ?", [slotId]);
    return rows[0];
  }

  // ============================================
  // ORDERS
  // ============================================
  async createOrder(orderData) {
    if (this.useSupabase) {
      const { data, error } = await supabase
        .from("orders")
        .insert(orderData)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    await db.query("INSERT INTO orders SET ?", [orderData]);
    const rows = await db.query("SELECT * FROM orders WHERE id = ?", [
      orderData.id,
    ]);
    return rows[0];
  }

  async getOrderById(id) {
    if (this.useSupabase) {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          *,
          machine:machines(*),
          slot:slots(*),
          product:products(*)
        `
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    }

    const rows = await db.query(
      `
      SELECT o.*, m.name as machine_name, p.name as product_name
      FROM orders o
      LEFT JOIN machines m ON o.machine_id = m.id
      LEFT JOIN products p ON o.product_id = p.id
      WHERE o.id = ?
    `,
      [id]
    );
    return rows[0];
  }

  async updateOrderStatus(orderId, status, additionalData = {}) {
    if (this.useSupabase) {
      const updateData = { status, ...additionalData };
      const { data, error } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", orderId)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const updateData = { status, ...additionalData };
    await db.query("UPDATE orders SET ? WHERE id = ?", [updateData, orderId]);
    return await this.getOrderById(orderId);
  }

  async getRecentOrders(limit = 10, machineId = null) {
    if (this.useSupabase) {
      let query = supabase
        .from("orders")
        .select(
          `
          *,
          machine:machines(name),
          product:products(name)
        `
        )
        .order("created_at", { ascending: false })
        .limit(limit);

      if (machineId) {
        query = query.eq("machine_id", machineId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    }

    let sql = `
      SELECT o.*, m.name as machine_name, p.name as product_name
      FROM orders o
      LEFT JOIN machines m ON o.machine_id = m.id
      LEFT JOIN products p ON o.product_id = p.id
    `;
    const params = [];

    if (machineId) {
      sql += " WHERE o.machine_id = ?";
      params.push(machineId);
    }

    sql += " ORDER BY o.created_at DESC LIMIT ?";
    params.push(limit);

    return await db.query(sql, params);
  }

  // ============================================
  // PAYMENTS
  // ============================================
  async createPayment(paymentData) {
    if (this.useSupabase) {
      const { data, error } = await supabase
        .from("payments")
        .insert(paymentData)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const result = await db.query("INSERT INTO payments SET ?", [paymentData]);
    return { id: result.insertId, ...paymentData };
  }

  async updatePaymentStatus(orderId, status, processedData = {}) {
    if (this.useSupabase) {
      const updateData = { status, ...processedData };
      const { data, error } = await supabase
        .from("payments")
        .update(updateData)
        .eq("order_id", orderId)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const updateData = { status, ...processedData };
    await db.query("UPDATE payments SET ? WHERE order_id = ?", [
      updateData,
      orderId,
    ]);
    return true;
  }

  // ============================================
  // STOCK LOGS
  // ============================================
  async createStockLog(logData) {
    if (this.useSupabase) {
      const { data, error } = await supabase
        .from("stock_logs")
        .insert(logData)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const result = await db.query("INSERT INTO stock_logs SET ?", [logData]);
    return { id: result.insertId, ...logData };
  }

  // ============================================
  // DISPENSE LOGS
  // ============================================
  async createDispenseLog(logData) {
    if (this.useSupabase) {
      const { data, error } = await supabase
        .from("dispense_logs")
        .insert(logData)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const result = await db.query("INSERT INTO dispense_logs SET ?", [logData]);
    return { id: result.insertId, ...logData };
  }

  async updateDispenseLog(id, updateData) {
    if (this.useSupabase) {
      const { data, error } = await supabase
        .from("dispense_logs")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    await db.query("UPDATE dispense_logs SET ? WHERE id = ?", [updateData, id]);
    return true;
  }

  // ============================================
  // TELEMETRY
  // ============================================
  async saveTelemetry(machineId, telemetryData) {
    if (this.useSupabase) {
      const { data, error } = await supabase
        .from("telemetry")
        .insert({
          machine_id: machineId,
          data: telemetryData,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const result = await db.query(
      "INSERT INTO telemetry (machine_id, data) VALUES (?, ?)",
      [machineId, JSON.stringify(telemetryData)]
    );
    return { id: result.insertId };
  }

  // ============================================
  // ADMIN USERS
  // ============================================
  async getUserByUsername(username) {
    if (this.useSupabase) {
      const { data, error } = await supabase
        .from("admin_users")
        .select("*")
        .eq("username", username)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data || null;
    }

    const rows = await db.query(
      "SELECT * FROM admin_users WHERE username = ?",
      [username]
    );
    return rows[0] || null;
  }

  async getUserByEmail(email) {
    if (this.useSupabase) {
      const { data, error } = await supabase
        .from("admin_users")
        .select("*")
        .eq("email", email)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data || null;
    }

    const rows = await db.query("SELECT * FROM admin_users WHERE email = ?", [
      email,
    ]);
    return rows[0] || null;
  }
}

module.exports = new DatabaseService();
