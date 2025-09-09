const bcrypt = require("bcryptjs");
const db = require("../config/database");

const seedData = async () => {
  try {
    console.log("🌱 Seeding database...");

    // Create default admin user
    const hashedPassword = await bcrypt.hash("admin123", 10);
    await db.query(
      `
      INSERT IGNORE INTO admin_users (username, email, password_hash, role)
      VALUES ('admin', 'admin@vendingmachine.com', ?, 'SUPER_ADMIN')
    `,
      [hashedPassword]
    );

    // Create default machine
    const machineToken =
      "vm01_secure_token_" + Math.random().toString(36).substr(2, 9);
    await db.query(
      `
      INSERT IGNORE INTO machines (id, name, location, status, token, config)
      VALUES (
        'VM01', 
        'Vending Machine 01', 
        'Lobby Area', 
        'OFFLINE',
        ?,
        '{"motor_timeout": 1500, "retry_count": 1, "drop_timeout": 3000}'
      )
    `,
      [machineToken]
    );

    // Create sample products
    const products = [
      {
        name: "Coca Cola",
        description: "Minuman berkarbonasi segar",
        price: 8000,
        image_url: "/images/products/coca-cola.jpg",
        category: "Minuman",
      },
      {
        name: "Pepsi",
        description: "Minuman berkarbonasi",
        price: 8000,
        image_url: "/images/products/pepsi.jpg",
        category: "Minuman",
      },
      {
        name: "Aqua 600ml",
        description: "Air mineral berkualitas",
        price: 5000,
        image_url: "/images/products/aqua.jpg",
        category: "Minuman",
      },
      {
        name: "Teh Botol Sosro",
        description: "Teh manis asli Indonesia",
        price: 6000,
        image_url: "/images/products/teh-botol.jpg",
        category: "Minuman",
      },
      {
        name: "Chitato",
        description: "Keripik kentang rasa original",
        price: 10000,
        image_url: "/images/products/chitato.jpg",
        category: "Snack",
      },
      {
        name: "Oreo",
        description: "Biskuit sandwich cream",
        price: 12000,
        image_url: "/images/products/oreo.jpg",
        category: "Snack",
      },
    ];

    for (const product of products) {
      await db.query(
        `
        INSERT IGNORE INTO products (name, description, price, image_url, category)
        VALUES (?, ?, ?, ?, ?)
      `,
        [
          product.name,
          product.description,
          product.price,
          product.image_url,
          product.category,
        ]
      );
    }

    // Create slots with products
    const slots = [
      {
        slot_number: 1,
        product_name: "Coca Cola",
        current_stock: 8,
        capacity: 10,
        motor_duration_ms: 1500,
      },
      {
        slot_number: 2,
        product_name: "Pepsi",
        current_stock: 7,
        capacity: 10,
        motor_duration_ms: 1500,
      },
      {
        slot_number: 3,
        product_name: "Aqua 600ml",
        current_stock: 10,
        capacity: 12,
        motor_duration_ms: 1200,
      },
      {
        slot_number: 4,
        product_name: "Teh Botol Sosro",
        current_stock: 6,
        capacity: 10,
        motor_duration_ms: 1400,
      },
      {
        slot_number: 5,
        product_name: "Chitato",
        current_stock: 5,
        capacity: 8,
        motor_duration_ms: 1800,
      },
      {
        slot_number: 6,
        product_name: "Oreo",
        current_stock: 4,
        capacity: 8,
        motor_duration_ms: 1700,
      },
    ];

    for (const slot of slots) {
      // Get product ID
      const product = await db.query("SELECT id FROM products WHERE name = ?", [
        slot.product_name,
      ]);
      if (product.length > 0) {
        await db.query(
          `
          INSERT IGNORE INTO slots (machine_id, slot_number, product_id, capacity, current_stock, motor_duration_ms)
          VALUES ('VM01', ?, ?, ?, ?, ?)
        `,
          [
            slot.slot_number,
            product[0].id,
            slot.capacity,
            slot.current_stock,
            slot.motor_duration_ms,
          ]
        );
      }
    }

    console.log("✅ Database seeded successfully");
    console.log("🔑 Default admin credentials:");
    console.log("   Username: admin");
    console.log("   Password: admin123");
    console.log(`🤖 Machine token: ${machineToken}`);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  }
};

// Run seed if called directly
if (require.main === module) {
  seedData()
    .then(() => {
      console.log("Seeding completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Seeding failed:", error);
      process.exit(1);
    });
}

module.exports = { seedData };
