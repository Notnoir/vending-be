#!/usr/bin/env node

const { createTables } = require("./database/migrate");
const { seedData } = require("./database/seed");

async function setup() {
  try {
    console.log("🚀 Setting up Vending Machine Backend...\n");

    // Create tables
    console.log("1. Creating database tables...");
    await createTables();

    // Seed initial data
    console.log("\n2. Seeding initial data...");
    await seedData();

    console.log("\n✅ Setup completed successfully!");
    console.log("\n📋 Next steps:");
    console.log(
      "1. Copy .env.example to .env and configure your database settings"
    );
    console.log('2. Run "npm run dev" to start the development server');
    console.log("3. Access the API at http://localhost:3001");
    console.log(
      "4. Use the admin credentials shown above to access the admin panel"
    );
  } catch (error) {
    console.error("\n❌ Setup failed:", error.message);
    process.exit(1);
  }
}

setup();
