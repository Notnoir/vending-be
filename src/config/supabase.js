const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Use service key for backend

if (!supabaseUrl || !supabaseKey) {
  console.warn("⚠️  Supabase credentials not found in environment variables");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: false, // Backend doesn't need session persistence
  },
  db: {
    schema: "public",
  },
});

// Test connection
async function testConnection() {
  try {
    const { data, error } = await supabase
      .from("machines")
      .select("count")
      .limit(1);

    if (error && error.code !== "PGRST116") {
      // PGRST116 = table doesn't exist yet
      throw error;
    }
    console.log("✅ Supabase connected successfully");
    return true;
  } catch (error) {
    console.error("❌ Supabase connection failed:", error.message);
    return false;
  }
}

// Helper functions for common operations
const supabaseHelpers = {
  // Insert single record
  async insert(table, data) {
    const { data: result, error } = await supabase
      .from(table)
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return result;
  },

  // Insert multiple records
  async insertMany(table, data) {
    const { data: result, error } = await supabase
      .from(table)
      .insert(data)
      .select();

    if (error) throw error;
    return result;
  },

  // Update record
  async update(table, id, data, idColumn = "id") {
    const { data: result, error } = await supabase
      .from(table)
      .update(data)
      .eq(idColumn, id)
      .select()
      .single();

    if (error) throw error;
    return result;
  },

  // Delete record
  async delete(table, id, idColumn = "id") {
    const { error } = await supabase.from(table).delete().eq(idColumn, id);

    if (error) throw error;
    return true;
  },

  // Find by ID
  async findById(table, id, idColumn = "id") {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq(idColumn, id)
      .single();

    if (error) throw error;
    return data;
  },

  // Find all with optional filters
  async findAll(table, filters = {}) {
    let query = supabase.from(table).select("*");

    Object.entries(filters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  // Execute raw SQL (for complex queries)
  async rpc(functionName, params = {}) {
    const { data, error } = await supabase.rpc(functionName, params);
    if (error) throw error;
    return data;
  },

  // Transaction helper (using PostgreSQL function)
  async transaction(callback) {
    // Supabase doesn't have built-in transaction support in JS client
    // Use database functions or handle at application level
    return await callback(supabase);
  },
};

module.exports = {
  supabase,
  supabaseHelpers,
  testConnection,
};
