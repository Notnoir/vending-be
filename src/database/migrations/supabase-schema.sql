-- ============================================
-- Vending Machine Database Schema for Supabase
-- PostgreSQL Version
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- MACHINES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS machines (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  location VARCHAR(200),
  status VARCHAR(20) DEFAULT 'OFFLINE' CHECK (status IN ('ONLINE', 'OFFLINE', 'MAINTENANCE')),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  token VARCHAR(255) NOT NULL,
  config JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PRODUCTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  image_url VARCHAR(500),
  category VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SLOTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS slots (
  id SERIAL PRIMARY KEY,
  machine_id VARCHAR(50) NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  slot_number INTEGER NOT NULL,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  capacity INTEGER DEFAULT 10,
  current_stock INTEGER DEFAULT 0,
  price_override DECIMAL(10,2),
  motor_duration_ms INTEGER DEFAULT 1500,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (machine_id, slot_number)
);

-- ============================================
-- ORDERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(100) PRIMARY KEY,
  machine_id VARCHAR(50) NOT NULL REFERENCES machines(id),
  slot_id INTEGER NOT NULL REFERENCES slots(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER DEFAULT 1,
  total_amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'DISPENSING', 'COMPLETED', 'FAILED', 'REFUNDED')),
  payment_method VARCHAR(20) DEFAULT 'QRIS' CHECK (payment_method IN ('QRIS', 'VA', 'CASH')),
  payment_url TEXT,
  payment_token VARCHAR(255),
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  dispensed_at TIMESTAMPTZ,
  customer_phone VARCHAR(20),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ORDER ITEMS TABLE (for multi-item orders)
-- ============================================
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(100) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  slot_id INTEGER NOT NULL REFERENCES slots(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  dispense_status VARCHAR(20) DEFAULT 'PENDING' CHECK (dispense_status IN ('PENDING', 'DISPENSING', 'COMPLETED', 'FAILED')),
  dispensed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PAYMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(100) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  gateway_transaction_id VARCHAR(255),
  gateway_name VARCHAR(50),
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'EXPIRED')),
  payment_type VARCHAR(50),
  raw_response JSONB,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DISPENSE LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS dispense_logs (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(100) NOT NULL REFERENCES orders(id),
  machine_id VARCHAR(50) NOT NULL REFERENCES machines(id),
  slot_number INTEGER NOT NULL,
  command_sent_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  success BOOLEAN DEFAULT FALSE,
  drop_detected BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0
);

-- ============================================
-- STOCK LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS stock_logs (
  id SERIAL PRIMARY KEY,
  machine_id VARCHAR(50) NOT NULL REFERENCES machines(id),
  slot_id INTEGER NOT NULL REFERENCES slots(id),
  change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('RESTOCK', 'DISPENSE', 'MANUAL_ADJUST', 'AUDIT')),
  quantity_before INTEGER NOT NULL,
  quantity_after INTEGER NOT NULL,
  quantity_change INTEGER NOT NULL,
  reason VARCHAR(200),
  performed_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TELEMETRY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS telemetry (
  id SERIAL PRIMARY KEY,
  machine_id VARCHAR(50) NOT NULL REFERENCES machines(id),
  data JSONB NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_telemetry_machine_time ON telemetry(machine_id, received_at);

-- ============================================
-- ADMIN USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'ADMIN' CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'TECHNICIAN')),
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FUNCTIONS FOR AUTOMATIC UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to tables with updated_at
CREATE TRIGGER update_machines_updated_at BEFORE UPDATE ON machines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_slots_updated_at BEFORE UPDATE ON slots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================
-- Enable RLS on all tables
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispense_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Create policies for service role (backend access)
-- Service role bypasses RLS by default, but we can add explicit policies

-- Public read access for products (for vending machine display)
CREATE POLICY "Public can view active products"
  ON products FOR SELECT
  USING (is_active = true);

-- Allow service role full access
CREATE POLICY "Service role has full access to products"
  ON products FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to machines"
  ON machines FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to slots"
  ON slots FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to orders"
  ON orders FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to order_items"
  ON order_items FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to payments"
  ON payments FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to dispense_logs"
  ON dispense_logs FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to stock_logs"
  ON stock_logs FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to telemetry"
  ON telemetry FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to admin_users"
  ON admin_users FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_orders_machine_id ON orders(machine_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_slots_machine_id ON slots(machine_id);
CREATE INDEX IF NOT EXISTS idx_stock_logs_slot_id ON stock_logs(slot_id);
CREATE INDEX IF NOT EXISTS idx_dispense_logs_order_id ON dispense_logs(order_id);

-- ============================================
-- STORAGE BUCKETS (run in Supabase Dashboard)
-- ============================================
-- Create storage bucket for product images
-- This needs to be created via Supabase Dashboard or API:
-- 1. Go to Storage section
-- 2. Create new bucket: "product-images"
-- 3. Set public: true
-- 4. Set allowed file types: image/jpeg, image/png, image/webp

-- ============================================
-- SAMPLE DATA (Optional)
-- ============================================
-- Insert sample admin user (password: admin123)
-- Password hash for "admin123" using bcrypt
INSERT INTO admin_users (username, email, password_hash, role)
VALUES (
  'admin',
  'admin@vendingmachine.com',
  '$2a$10$rT4YvYJF7WmHxLvkVGPQ1.qE5pX4q1Z7KvYjF7WmHxLvkVGPQ1.qE',
  'SUPER_ADMIN'
) ON CONFLICT (username) DO NOTHING;

-- Insert sample products
INSERT INTO products (name, description, price, category, is_active)
VALUES
  ('Coca Cola', 'Minuman bersoda segar', 5000, 'Minuman', true),
  ('Aqua 600ml', 'Air mineral kemasan', 3000, 'Minuman', true),
  ('Indomie Goreng', 'Mie instan rasa goreng', 3500, 'Makanan', true),
  ('Chitato', 'Keripik kentang', 8000, 'Snack', true),
  ('Teh Botol', 'Teh kemasan botol', 4000, 'Minuman', true)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE machines IS 'Vending machine devices';
COMMENT ON TABLE products IS 'Products available in vending machines';
COMMENT ON TABLE slots IS 'Physical slots in vending machines';
COMMENT ON TABLE orders IS 'Customer orders/transactions';
COMMENT ON TABLE payments IS 'Payment records from payment gateway';
COMMENT ON TABLE dispense_logs IS 'Logs of product dispensing operations';
COMMENT ON TABLE stock_logs IS 'Inventory change history';
COMMENT ON TABLE telemetry IS 'IoT telemetry data from machines';
COMMENT ON TABLE admin_users IS 'Admin dashboard users';
