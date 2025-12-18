-- ============================================
-- Migration: Add order_items table for multi-item checkout
-- Date: 2025-12-12
-- ============================================

-- Create order_items table
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- Enable RLS
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for service role
CREATE POLICY "Service role has full access to order_items"
  ON order_items FOR ALL
  USING (auth.role() = 'service_role');

-- Add comment
COMMENT ON TABLE order_items IS 'Individual items in multi-item orders';
