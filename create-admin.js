const bcrypt = require("bcryptjs");
const path = require("path");

// Load .env from backend directory
require("dotenv").config({ path: path.join(__dirname, ".env") });

const { createClient } = require("@supabase/supabase-js");

const USE_SUPABASE = process.env.USE_SUPABASE === "true";

console.log("Environment check:");
console.log("USE_SUPABASE:", USE_SUPABASE);
console.log("SUPABASE_URL:", process.env.SUPABASE_URL ? "✓ Set" : "✗ Not set");
console.log(
  "SUPABASE_SERVICE_KEY:",
  process.env.SUPABASE_SERVICE_KEY ? "✓ Set" : "✗ Not set"
);
console.log("");

async function createAdmin() {
  const username = process.argv[2] || "admin";
  const password = process.argv[3] || "admin123";
  const email = process.argv[4] || "admin@vendingmachine.com";

  console.log("🔐 Creating admin user...");
  console.log("Username:", username);
  console.log("Email:", email);

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  console.log("Password hash:", passwordHash);

  if (USE_SUPABASE) {
    console.log("\n📡 Using Supabase...");

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Try to insert, if exists then update password
    const { data: insertData, error: insertError } = await supabase
      .from("admin_users")
      .insert({
        username,
        email,
        password_hash: passwordHash,
        role: "SUPER_ADMIN",
        is_active: true,
      })
      .select();

    if (insertError) {
      // If user already exists, update the password
      if (
        insertError.message.includes("duplicate") ||
        insertError.code === "23505"
      ) {
        console.log("⚠️  Admin user already exists, updating password...");

        const { data: updateData, error: updateError } = await supabase
          .from("admin_users")
          .update({
            password_hash: passwordHash,
            email: email,
            is_active: true,
          })
          .eq("username", username)
          .select();

        if (updateError) {
          console.error("❌ Error updating admin:", updateError.message);
          process.exit(1);
        }

        console.log("✅ Admin user password updated successfully in Supabase!");
        console.log("User data:", updateData);
      } else {
        console.error("❌ Error creating admin:", insertError.message);
        process.exit(1);
      }
    } else {
      console.log("✅ Admin user created successfully in Supabase!");
      console.log("User data:", insertData);
    }
  } else {
    console.log("\n📡 Using MySQL...");

    const mysql = require("mysql2/promise");

    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "vending_machine",
    });

    const [result] = await connection.execute(
      `INSERT INTO admin_users (username, email, password_hash, role, is_active)
       VALUES (?, ?, ?, 'SUPER_ADMIN', 1)`,
      [username, email, passwordHash]
    );

    console.log("✅ Admin user created successfully in MySQL!");
    console.log("Insert ID:", result.insertId);

    await connection.end();
  }

  console.log("\n📝 Login credentials:");
  console.log("Username:", username);
  console.log("Password:", password);
  console.log("\n⚠️  Please change the password after first login!");
}

createAdmin().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
