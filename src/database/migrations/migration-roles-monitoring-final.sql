-- ==============================================
-- Migration: Add Role System & Machine Monitoring
-- Date: 2025-12-09
-- Description: Add users table with role-based auth and machine_data for IoT monitoring
-- ==============================================

-- 1. CREATE USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(20) NOT NULL DEFAULT 'buyer' CHECK (role IN ('admin', 'buyer', 'guest')),
  fcm_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

-- 2. CREATE MACHINE DATA TABLE
CREATE TABLE IF NOT EXISTS machine_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id VARCHAR(50) NOT NULL REFERENCES machines(machine_id) ON DELETE CASCADE,
  temperature DECIMAL(5,2),
  humidity DECIMAL(5,2),
  door_status VARCHAR(20),
  power_status VARCHAR(20),
  stock_summary JSONB,
  sales_count INTEGER DEFAULT 0,
  error_codes JSONB,
  status VARCHAR(20) DEFAULT 'normal' CHECK (status IN ('normal', 'warning', 'error', 'offline')),
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CREATE INDEXES
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_machine_data_machine_id ON machine_data(machine_id);
CREATE INDEX IF NOT EXISTS idx_machine_data_recorded_at ON machine_data(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_machine_data_status ON machine_data(status);

-- 4. CREATE VIEWS
-- Drop existing views if they exist
DROP VIEW IF EXISTS latest_machine_data CASCADE;
DROP VIEW IF EXISTS today_machine_data CASCADE;

-- Latest data for each machine
CREATE VIEW latest_machine_data AS
SELECT DISTINCT ON (machine_id)
  id,
  machine_id,
  temperature,
  humidity,
  door_status,
  power_status,
  stock_summary,
  sales_count,
  error_codes,
  status,
  recorded_at,
  created_at
FROM machine_data
ORDER BY machine_id, recorded_at DESC;

-- Today's scheduled data (10:00, 12:00, 14:00)
CREATE VIEW today_machine_data AS
SELECT 
  id,
  machine_id,
  temperature,
  humidity,
  door_status,
  power_status,
  stock_summary,
  sales_count,
  error_codes,
  status,
  recorded_at,
  created_at
FROM machine_data
WHERE DATE(recorded_at) = CURRENT_DATE
ORDER BY recorded_at DESC;

-- 5. ADD USER_ID TO ORDERS (optional for future)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
    CREATE INDEX idx_orders_user_id ON orders(user_id);
  END IF;
END $$;

-- 6. INSERT SAMPLE USERS (with bcrypt hashed passwords)
-- Password for all: admin123, buyer123, guest123
INSERT INTO users (email, password_hash, full_name, phone, role) VALUES
  ('admin@medivend.com', '$2a$10$cA3syLsEr9tC3OqlOrFXLucN3JlWHsSiWU35F32sAk3.4.6AQJVn6', 'Admin MediVend', '081234567890', 'admin'),
  ('buyer1@example.com', '$2a$10$p9uuAxENENcuoxkba0J6.eUTTNGmYa8HMen5CW9yiAH1BlCnzjMbu', 'Buyer One', '081234567891', 'buyer'),
  ('buyer2@example.com', '$2a$10$04xqPrqrHhkF8gi4YSe1jOrUHjMFRhbOz426F8hugO2t9QNyRP2oS', 'Buyer Two', '081234567892', 'buyer'),
  ('guest@example.com', '$2a$10$0OQHjqGNuSUspku1QaP5.eCMQssktPYAsCju/cBW3kYaRA4cd.mkK', 'Guest User', NULL, 'guest')
ON CONFLICT (email) DO NOTHING;

-- 7. ENABLE RLS (Row Level Security)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_data ENABLE ROW LEVEL SECURITY;

-- 8. CREATE RLS POLICIES
-- Users table policies
DROP POLICY IF EXISTS "Service role has full access to users" ON users;
CREATE POLICY "Service role has full access to users"
  ON users FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid()::text = id::text);

-- Machine data policies
DROP POLICY IF EXISTS "Public can view machine data" ON machine_data;
CREATE POLICY "Public can view machine data"
  ON machine_data FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role can insert machine data" ON machine_data;
CREATE POLICY "Service role can insert machine data"
  ON machine_data FOR INSERT
  WITH CHECK (true);

-- 9. GRANT PERMISSIONS
GRANT ALL ON users TO service_role;
GRANT SELECT ON users TO anon;
GRANT ALL ON machine_data TO service_role;
GRANT SELECT ON machine_data TO anon;

-- ==============================================
-- MIGRATION COMPLETED
-- ==============================================
-- Sample credentials:
-- Admin: admin@medivend.com / admin123
-- Buyer: buyer1@example.com / buyer123
-- Guest: guest@example.com / guest123
-- ==============================================
