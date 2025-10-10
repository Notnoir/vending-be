const mysql = require("mysql2/promise");
const { supabase, supabaseHelpers } = require("./supabase");

// Check if we should use Supabase
const USE_SUPABASE = process.env.USE_SUPABASE === "true";

class Database {
  constructor() {
    this.pool = null;
    this.useSupabase = USE_SUPABASE;
    this.init();
  }

  async init() {
    if (this.useSupabase) {
      console.log("🔄 Using Supabase as database");
      try {
        // Test Supabase connection
        const { testConnection } = require("./supabase");
        await testConnection();
      } catch (error) {
        console.error("❌ Supabase connection failed:", error.message);
        console.log("⚠️  Falling back to MySQL");
        this.useSupabase = false;
        await this.initMySQL();
      }
    } else {
      await this.initMySQL();
    }
  }

  async initMySQL() {
    try {
      this.pool = mysql.createPool({
        host: process.env.DB_HOST || "localhost",
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "vending_machine",
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        acquireTimeout: 60000,
        timeout: 60000,
        reconnect: true,
      });

      // Test connection
      const connection = await this.pool.getConnection();
      console.log("✅ MySQL Database connected successfully");
      connection.release();
    } catch (error) {
      console.error("❌ MySQL Database connection failed:", error.message);
      process.exit(1);
    }
  }

  async query(sql, params = []) {
    if (this.useSupabase) {
      throw new Error(
        "Direct SQL queries not supported with Supabase. Use table methods instead."
      );
    }

    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows;
    } catch (error) {
      console.error("Database query error:", error);
      throw error;
    }
  }

  async transaction(callback) {
    if (this.useSupabase) {
      // Supabase transactions handled at application level
      return await callback(supabase);
    }

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log("Database connection closed");
    }
  }

  // ============================================
  // Supabase-compatible methods
  // ============================================

  getClient() {
    if (this.useSupabase) {
      return supabase;
    }
    return this.pool;
  }

  // Generic table operations
  table(tableName) {
    if (this.useSupabase) {
      return {
        select: (columns = "*") => supabase.from(tableName).select(columns),
        insert: (data) => supabaseHelpers.insert(tableName, data),
        insertMany: (data) => supabaseHelpers.insertMany(tableName, data),
        update: (id, data, idColumn) =>
          supabaseHelpers.update(tableName, id, data, idColumn),
        delete: (id, idColumn) =>
          supabaseHelpers.delete(tableName, id, idColumn),
        findById: (id, idColumn) =>
          supabaseHelpers.findById(tableName, id, idColumn),
        findAll: (filters) => supabaseHelpers.findAll(tableName, filters),
      };
    }

    // MySQL implementation would go here
    throw new Error("Table methods only available with Supabase");
  }
}

module.exports = new Database();
