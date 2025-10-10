/**
 * Data Migration Tool - MySQL to Supabase
 * This script migrates existing data from MySQL to Supabase
 */

const mysql = require("mysql2/promise");
const { supabase } = require("../config/supabase");
require("dotenv").config();

const BATCH_SIZE = 100; // Process records in batches

class DataMigration {
  constructor() {
    this.mysqlConnection = null;
    this.stats = {
      machines: 0,
      products: 0,
      slots: 0,
      orders: 0,
      payments: 0,
      dispense_logs: 0,
      stock_logs: 0,
      telemetry: 0,
      admin_users: 0,
    };
  }

  async connectMySQL() {
    console.log("🔌 Connecting to MySQL...");
    this.mysqlConnection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "vending_machine",
    });
    console.log("✅ MySQL connected\n");
  }

  async disconnect() {
    if (this.mysqlConnection) {
      await this.mysqlConnection.end();
      console.log("🔌 MySQL disconnected");
    }
  }

  async migrateTable(tableName, transformFn = null) {
    try {
      console.log(`\n📦 Migrating ${tableName}...`);

      // Get data from MySQL
      const [rows] = await this.mysqlConnection.query(
        `SELECT * FROM ${tableName}`
      );

      if (rows.length === 0) {
        console.log(`  ⚠️  No data found in ${tableName}`);
        return 0;
      }

      console.log(`  Found ${rows.length} records`);

      // Transform data if needed
      let dataToInsert = rows;
      if (transformFn) {
        dataToInsert = rows.map(transformFn);
      }

      // Insert in batches
      let inserted = 0;
      for (let i = 0; i < dataToInsert.length; i += BATCH_SIZE) {
        const batch = dataToInsert.slice(i, i + BATCH_SIZE);

        const { data, error } = await supabase
          .from(tableName)
          .upsert(batch, { onConflict: "id" });

        if (error) {
          console.error(
            `  ❌ Error inserting batch ${i}-${i + batch.length}:`,
            error.message
          );
          // Continue with next batch
        } else {
          inserted += batch.length;
          console.log(`  ✅ Inserted batch ${i}-${i + batch.length}`);
        }
      }

      this.stats[tableName] = inserted;
      console.log(`  ✨ Total inserted: ${inserted}/${rows.length}`);
      return inserted;
    } catch (error) {
      console.error(`❌ Error migrating ${tableName}:`, error.message);
      throw error;
    }
  }

  async migrate() {
    try {
      await this.connectMySQL();

      console.log("🚀 Starting data migration from MySQL to Supabase\n");
      console.log("=".repeat(60));

      // Migrate in order (respecting foreign keys)

      // 1. Machines (no dependencies)
      await this.migrateTable("machines", (row) => ({
        ...row,
        config:
          typeof row.config === "string" ? JSON.parse(row.config) : row.config,
      }));

      // 2. Products (no dependencies)
      await this.migrateTable("products");

      // 3. Admin users (no dependencies)
      await this.migrateTable("admin_users");

      // 4. Slots (depends on machines, products)
      await this.migrateTable("slots");

      // 5. Orders (depends on machines, slots, products)
      await this.migrateTable("orders");

      // 6. Payments (depends on orders)
      await this.migrateTable("payments", (row) => ({
        ...row,
        raw_response:
          typeof row.raw_response === "string"
            ? JSON.parse(row.raw_response)
            : row.raw_response,
      }));

      // 7. Dispense logs (depends on orders, machines)
      await this.migrateTable("dispense_logs");

      // 8. Stock logs (depends on machines, slots)
      await this.migrateTable("stock_logs");

      // 9. Telemetry (depends on machines)
      await this.migrateTable("telemetry", (row) => ({
        ...row,
        data: typeof row.data === "string" ? JSON.parse(row.data) : row.data,
      }));

      console.log("\n" + "=".repeat(60));
      console.log("✅ Migration completed!\n");

      this.printStats();
    } catch (error) {
      console.error("\n❌ Migration failed:", error.message);
      throw error;
    } finally {
      await this.disconnect();
    }
  }

  printStats() {
    console.log("📊 Migration Statistics:\n");
    console.log("Table".padEnd(20) + "Records Migrated");
    console.log("-".repeat(40));

    Object.entries(this.stats).forEach(([table, count]) => {
      console.log(table.padEnd(20) + count.toString());
    });

    const total = Object.values(this.stats).reduce((a, b) => a + b, 0);
    console.log("-".repeat(40));
    console.log("TOTAL".padEnd(20) + total.toString());
    console.log("");
  }

  async verifyMigration() {
    console.log("\n🔍 Verifying migration...\n");

    const tables = Object.keys(this.stats);

    for (const table of tables) {
      // Count records in Supabase
      const { count, error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true });

      if (error) {
        console.log(`  ❌ ${table}: Error - ${error.message}`);
      } else {
        const mysqlCount = this.stats[table];
        const match = count === mysqlCount ? "✅" : "⚠️";
        console.log(
          `  ${match} ${table}: ${count} records (MySQL: ${mysqlCount})`
        );
      }
    }
  }
}

// CLI Commands
const commands = {
  async migrate() {
    const migration = new DataMigration();
    await migration.migrate();
    await migration.verifyMigration();
  },

  async verify() {
    const migration = new DataMigration();
    await migration.connectMySQL();
    await migration.verifyMigration();
    await migration.disconnect();
  },

  async clean() {
    console.log("⚠️  This will DELETE ALL DATA from Supabase tables!");
    console.log("Press Ctrl+C to cancel, or wait 5 seconds to continue...");

    await new Promise((resolve) => setTimeout(resolve, 5000));

    console.log("\n🗑️  Cleaning Supabase tables...");

    const tables = [
      "telemetry",
      "stock_logs",
      "dispense_logs",
      "payments",
      "orders",
      "slots",
      "admin_users",
      "products",
      "machines",
    ];

    for (const table of tables) {
      const { error } = await supabase.from(table).delete().neq("id", 0);
      if (error) {
        console.log(`  ❌ ${table}: ${error.message}`);
      } else {
        console.log(`  ✅ ${table} cleaned`);
      }
    }

    console.log("\n✅ All tables cleaned");
  },
};

// Run command from CLI
if (require.main === module) {
  const command = process.argv[2] || "migrate";

  if (commands[command]) {
    commands[command]()
      .then(() => {
        console.log("🎉 Done!");
        process.exit(0);
      })
      .catch((error) => {
        console.error("❌ Failed:", error);
        process.exit(1);
      });
  } else {
    console.log("Usage:");
    console.log(
      "  node migrate-to-supabase.js migrate  - Migrate all data from MySQL to Supabase"
    );
    console.log("  node migrate-to-supabase.js verify   - Verify migration");
    console.log(
      "  node migrate-to-supabase.js clean    - Clean all Supabase tables (DANGEROUS!)"
    );
    process.exit(1);
  }
}

module.exports = DataMigration;
