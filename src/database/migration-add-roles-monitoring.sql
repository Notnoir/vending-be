-- ============================================
-- MIGRATION: Add Role System & Machine Monitoring
-- Date: 2025-12-09
-- Purpose: Add multi-role authentication and machine monitoring data
-- ============================================

-- ============================================
-- USERS TABLE (for Buyer/Customer)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100),
  phone VARCHAR(20),
  role VARCHAR(20) DEFAULT 'buyer' CHECK (role IN ('admin', 'buyer', 'guest')),
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  fcm_token VARCHAR(255), -- For push notifications
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add trigger for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid() = id OR auth.role() = 'service_role');

-- Users can update their own data
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id OR auth.role() = 'service_role');

-- Service role has full access
CREATE POLICY "Service role has full access to users"
  ON users FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- MACHINE DATA TABLE (Scheduled Monitoring Data)
-- ============================================
CREATE TABLE IF NOT EXISTS machine_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  machine_id VARCHAR(50) NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  temperature DECIMAL(5,2), -- Celsius
  humidity DECIMAL(5,2), -- Percentage
  door_status VARCHAR(20), -- OPEN, CLOSED
  power_status VARCHAR(20), -- NORMAL, LOW, CRITICAL
  stock_summary JSONB, -- {"total_capacity": 100, "total_current": 45, "slots": [...]}
  sales_count INTEGER DEFAULT 0, -- Number of sales since last report
  error_codes JSONB, -- Array of error codes if any
  status VARCHAR(20) DEFAULT 'normal' CHECK (status IN ('normal', 'warning', 'error', 'offline')),
  recorded_at TIMESTAMPTZ NOT NULL, -- When data was recorded (10:00, 12:00, 14:00)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_machine_data_machine ON machine_data(machine_id);
CREATE INDEX IF NOT EXISTS idx_machine_data_recorded ON machine_data(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_machine_data_status ON machine_data(status);
CREATE INDEX IF NOT EXISTS idx_machine_data_machine_recorded ON machine_data(machine_id, recorded_at DESC);

-- Enable RLS
ALTER TABLE machine_data ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role has full access to machine_data"
  ON machine_data FOR ALL
  USING (auth.role() = 'service_role');

-- Public can view latest machine data
CREATE POLICY "Public can view machine data"
  ON machine_data FOR SELECT
  USING (true);

-- ============================================
-- ADD ROLE TO ADMIN_USERS (if needed)
-- ============================================
-- Update admin_users to be compatible with mobile app
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS fcm_token VARCHAR(255);

-- ============================================
-- UPDATE ORDERS TABLE
-- ============================================
-- Add user_id to orders table to link with buyers
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- ============================================
-- SAMPLE DATA
-- ============================================

-- Insert sample admin user (for testing)
-- Password: admin123 (hashed with bcrypt)
INSERT INTO users (email, password_hash, full_name, role)
VALUES (
  'admin@vendingmachine.com',
  '$2b$10$YourHashedPasswordHere', -- Replace with actual bcrypt hash
  'System Administrator',
  'admin'
) ON CONFLICT (email) DO NOTHING;

-- Insert sample buyer users (for testing)
-- Password: buyer123 (hashed with bcrypt)
INSERT INTO users (email, password_hash, full_name, phone, role)
VALUES 
  ('buyer1@example.com', '$2b$10$YourHashedPasswordHere', 'John Buyer', '081234567890', 'buyer'),
  ('buyer2@example.com', '$2b$10$YourHashedPasswordHere', 'Jane Customer', '081234567891', 'buyer')
ON CONFLICT (email) DO NOTHING;

-- Insert sample guest user
INSERT INTO users (email, password_hash, full_name, role)
VALUES (
  'guest@vendingmachine.com',
  '$2b$10$YourHashedPasswordHere',
  'Guest User',
  'guest'
) ON CONFLICT (email) DO NOTHING;

-- Insert sample machine data (for demonstration)
INSERT INTO machine_data (
  machine_id,
  temperature,
  humidity,
  door_status,
  power_status,
  stock_summary,
  sales_count,
  status,
  recorded_at
)
SELECT 
  'VM001',
  ROUND((RANDOM() * 10 + 20)::numeric, 2), -- 20-30°C
  ROUND((RANDOM() * 20 + 40)::numeric, 2), -- 40-60%
  'CLOSED',
  'NORMAL',
  jsonb_build_object(
    'total_capacity', 100,
    'total_current', FLOOR(RANDOM() * 50 + 30)::int,
    'slots', jsonb_build_array(
      jsonb_build_object('slot', 1, 'capacity', 10, 'current', FLOOR(RANDOM() * 10)::int),
      jsonb_build_object('slot', 2, 'capacity', 10, 'current', FLOOR(RANDOM() * 10)::int),
      jsonb_build_object('slot', 3, 'capacity', 10, 'current', FLOOR(RANDOM() * 10)::int)
    )
  ),
  FLOOR(RANDOM() * 20)::int, -- 0-20 sales
  'normal',
  timestamp '2025-12-09 10:00:00' + (interval '2 hours' * generate_series)
FROM generate_series(0, 11) -- Generate data for 10:00, 12:00, 14:00 over 4 days
WHERE EXISTS (SELECT 1 FROM machines WHERE id = 'VM001');

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE users IS 'Mobile app users (buyers/customers) with role-based access';
COMMENT ON TABLE machine_data IS 'Scheduled monitoring data from vending machines (10:00, 12:00, 14:00)';
COMMENT ON COLUMN machine_data.recorded_at IS 'Scheduled recording time (10:00, 12:00, 14:00)';
COMMENT ON COLUMN machine_data.stock_summary IS 'JSON summary of all slots stock levels';
COMMENT ON COLUMN machine_data.sales_count IS 'Number of completed sales since last recording';

-- ============================================
-- HELPER VIEWS
-- ============================================

-- View for latest machine status
CREATE OR REPLACE VIEW latest_machine_data AS
SELECT DISTINCT ON (machine_id) 
  md.*,
  m.name as machine_name,
  m.location,
  m.status as machine_status
FROM machine_data md
JOIN machines m ON md.machine_id = m.id
ORDER BY machine_id, recorded_at DESC;

COMMENT ON VIEW latest_machine_data IS 'Latest monitoring data for each machine';

-- View for today's machine data
CREATE OR REPLACE VIEW today_machine_data AS
SELECT 
  md.*,
  m.name as machine_name,
  m.location
FROM machine_data md
JOIN machines m ON md.machine_id = m.id
WHERE DATE(md.recorded_at) = CURRENT_DATE
ORDER BY md.machine_id, md.recorded_at;

COMMENT ON VIEW today_machine_data IS 'All monitoring data for today (10:00, 12:00, 14:00)';
