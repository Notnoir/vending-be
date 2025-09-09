const db = require("../config/database");

const createTables = async () => {
  try {
    console.log("🏗️  Creating database tables...");

    // Machines table
    await db.query(`
      CREATE TABLE IF NOT EXISTS machines (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        location VARCHAR(200),
        status ENUM('ONLINE', 'OFFLINE', 'MAINTENANCE') DEFAULT 'OFFLINE',
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        token VARCHAR(255) NOT NULL,
        config JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Products table
    await db.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        image_url VARCHAR(500),
        category VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Slots table
    await db.query(`
      CREATE TABLE IF NOT EXISTS slots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        machine_id VARCHAR(50) NOT NULL,
        slot_number INT NOT NULL,
        product_id INT,
        capacity INT DEFAULT 10,
        current_stock INT DEFAULT 0,
        price_override DECIMAL(10,2) NULL,
        motor_duration_ms INT DEFAULT 1500,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
        UNIQUE KEY unique_machine_slot (machine_id, slot_number)
      )
    `);

    // Orders table
    await db.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(100) PRIMARY KEY,
        machine_id VARCHAR(50) NOT NULL,
        slot_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT DEFAULT 1,
        total_amount DECIMAL(10,2) NOT NULL,
        status ENUM('PENDING', 'PAID', 'DISPENSING', 'COMPLETED', 'FAILED', 'REFUNDED') DEFAULT 'PENDING',
        payment_method ENUM('QRIS', 'VA', 'CASH') DEFAULT 'QRIS',
        payment_url TEXT,
        payment_token VARCHAR(255),
        expires_at TIMESTAMP,
        paid_at TIMESTAMP NULL,
        dispensed_at TIMESTAMP NULL,
        customer_phone VARCHAR(20),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (machine_id) REFERENCES machines(id),
        FOREIGN KEY (slot_id) REFERENCES slots(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    // Payments table
    await db.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(100) NOT NULL,
        gateway_transaction_id VARCHAR(255),
        gateway_name VARCHAR(50),
        amount DECIMAL(10,2) NOT NULL,
        status ENUM('PENDING', 'SUCCESS', 'FAILED', 'EXPIRED') DEFAULT 'PENDING',
        payment_type VARCHAR(50),
        raw_response JSON,
        processed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      )
    `);

    // Dispense logs table
    await db.query(`
      CREATE TABLE IF NOT EXISTS dispense_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(100) NOT NULL,
        machine_id VARCHAR(50) NOT NULL,
        slot_number INT NOT NULL,
        command_sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP NULL,
        completed_at TIMESTAMP NULL,
        duration_ms INT NULL,
        success BOOLEAN DEFAULT FALSE,
        drop_detected BOOLEAN DEFAULT FALSE,
        error_message TEXT,
        retry_count INT DEFAULT 0,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (machine_id) REFERENCES machines(id)
      )
    `);

    // Stock logs table
    await db.query(`
      CREATE TABLE IF NOT EXISTS stock_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        machine_id VARCHAR(50) NOT NULL,
        slot_id INT NOT NULL,
        change_type ENUM('RESTOCK', 'DISPENSE', 'MANUAL_ADJUST', 'AUDIT') NOT NULL,
        quantity_before INT NOT NULL,
        quantity_after INT NOT NULL,
        quantity_change INT NOT NULL,
        reason VARCHAR(200),
        performed_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (machine_id) REFERENCES machines(id),
        FOREIGN KEY (slot_id) REFERENCES slots(id)
      )
    `);

    // Telemetry table
    await db.query(`
      CREATE TABLE IF NOT EXISTS telemetry (
        id INT AUTO_INCREMENT PRIMARY KEY,
        machine_id VARCHAR(50) NOT NULL,
        data JSON NOT NULL,
        received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (machine_id) REFERENCES machines(id),
        INDEX idx_machine_time (machine_id, received_at)
      )
    `);

    // Admin users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('SUPER_ADMIN', 'ADMIN', 'TECHNICIAN') DEFAULT 'ADMIN',
        is_active BOOLEAN DEFAULT TRUE,
        last_login TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    console.log("✅ All tables created successfully");
  } catch (error) {
    console.error("❌ Error creating tables:", error);
    throw error;
  }
};

// Run migration if called directly
if (require.main === module) {
  createTables()
    .then(() => {
      console.log("Migration completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}

module.exports = { createTables };
