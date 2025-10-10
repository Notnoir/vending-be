-- ============================================
-- INSERT SAMPLE DATA untuk Testing
-- ============================================

-- 1. Insert Machine
INSERT INTO machines (id, name, location, status, token, config)
VALUES (
  'VM01',
  'Vending Machine 01',
  'Lobby Utama',
  'ONLINE',
  'test-token-vm01-2025',
  '{"temperature": 25, "version": "1.0"}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  status = 'ONLINE',
  last_seen = NOW();

-- 2. Insert Slots (menghubungkan products ke machine)
-- Slot 1: Coca Cola
INSERT INTO slots (machine_id, slot_number, product_id, capacity, current_stock, is_active)
VALUES ('VM01', 1, 1, 10, 5, true)
ON CONFLICT (machine_id, slot_number) DO UPDATE SET
  current_stock = 5,
  is_active = true;

-- Slot 2: Aqua
INSERT INTO slots (machine_id, slot_number, product_id, capacity, current_stock, is_active)
VALUES ('VM01', 2, 2, 15, 10, true)
ON CONFLICT (machine_id, slot_number) DO UPDATE SET
  current_stock = 10,
  is_active = true;

-- Slot 3: Indomie
INSERT INTO slots (machine_id, slot_number, product_id, capacity, current_stock, is_active)
VALUES ('VM01', 3, 3, 12, 7, true)
ON CONFLICT (machine_id, slot_number) DO UPDATE SET
  current_stock = 7,
  is_active = true;

-- Slot 4: Chitato
INSERT INTO slots (machine_id, slot_number, product_id, capacity, current_stock, is_active)
VALUES ('VM01', 4, 4, 8, 3, true)
ON CONFLICT (machine_id, slot_number) DO UPDATE SET
  current_stock = 3,
  is_active = true;

-- Slot 5: Teh Botol
INSERT INTO slots (machine_id, slot_number, product_id, capacity, current_stock, is_active)
VALUES ('VM01', 5, 5, 10, 6, true)
ON CONFLICT (machine_id, slot_number) DO UPDATE SET
  current_stock = 6,
  is_active = true;

-- 3. Verify data
SELECT 
  s.slot_number,
  p.name as product_name,
  s.current_stock,
  s.capacity,
  p.price,
  CASE WHEN s.is_active AND s.current_stock > 0 THEN 'Available' ELSE 'Unavailable' END as status
FROM slots s
JOIN products p ON s.product_id = p.id
WHERE s.machine_id = 'VM01'
ORDER BY s.slot_number;
