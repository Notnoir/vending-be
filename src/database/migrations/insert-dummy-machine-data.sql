-- ==============================================
-- Insert Dummy Machine Data for VM001
-- Scheduled data at 10:00, 12:00, 14:00
-- ==============================================

-- Data for Today at 10:00
INSERT INTO machine_data (
  machine_id,
  temperature,
  humidity,
  door_status,
  power_status,
  stock_summary,
  sales_count,
  error_codes,
  status,
  recorded_at
) VALUES (
  'VM01',
  25.5,
  60,
  'CLOSED',
  'NORMAL',
  '{
    "total_capacity": 100,
    "total_current": 75,
    "slots": [
      {"slot": "A1", "product_id": "PROD001", "current": 10, "capacity": 10},
      {"slot": "A2", "product_id": "PROD002", "current": 8, "capacity": 10},
      {"slot": "A3", "product_id": "PROD003", "current": 12, "capacity": 15},
      {"slot": "B1", "product_id": "PROD004", "current": 15, "capacity": 15},
      {"slot": "B2", "product_id": "PROD005", "current": 10, "capacity": 15},
      {"slot": "B3", "product_id": "PROD006", "current": 20, "capacity": 25}
    ]
  }'::jsonb,
  5,
  '[]'::jsonb,
  'normal',
  (CURRENT_DATE + TIME '10:00:00')::timestamptz
);

-- Data for Today at 12:00
INSERT INTO machine_data (
  machine_id,
  temperature,
  humidity,
  door_status,
  power_status,
  stock_summary,
  sales_count,
  error_codes,
  status,
  recorded_at
) VALUES (
  'VM01',
  26.2,
  58,
  'CLOSED',
  'NORMAL',
  '{
    "total_capacity": 100,
    "total_current": 68,
    "slots": [
      {"slot": "A1", "product_id": "PROD001", "current": 9, "capacity": 10},
      {"slot": "A2", "product_id": "PROD002", "current": 7, "capacity": 10},
      {"slot": "A3", "product_id": "PROD003", "current": 10, "capacity": 15},
      {"slot": "B1", "product_id": "PROD004", "current": 14, "capacity": 15},
      {"slot": "B2", "product_id": "PROD005", "current": 9, "capacity": 15},
      {"slot": "B3", "product_id": "PROD006", "current": 19, "capacity": 25}
    ]
  }'::jsonb,
  12,
  '[]'::jsonb,
  'normal',
  (CURRENT_DATE + TIME '12:00:00')::timestamptz
);

-- Data for Today at 14:00
INSERT INTO machine_data (
  machine_id,
  temperature,
  humidity,
  door_status,
  power_status,
  stock_summary,
  sales_count,
  error_codes,
  status,
  recorded_at
) VALUES (
  'VM01',
  27.0,
  62,
  'CLOSED',
  'NORMAL',
  '{
    "total_capacity": 100,
    "total_current": 60,
    "slots": [
      {"slot": "A1", "product_id": "PROD001", "current": 8, "capacity": 10},
      {"slot": "A2", "product_id": "PROD002", "current": 6, "capacity": 10},
      {"slot": "A3", "product_id": "PROD003", "current": 8, "capacity": 15},
      {"slot": "B1", "product_id": "PROD004", "current": 12, "capacity": 15},
      {"slot": "B2", "product_id": "PROD005", "current": 8, "capacity": 15},
      {"slot": "B3", "product_id": "PROD006", "current": 18, "capacity": 25}
    ]
  }'::jsonb,
  18,
  '[]'::jsonb,
  'normal',
  (CURRENT_DATE + TIME '14:00:00')::timestamptz
);

-- Data for Yesterday (for history)
INSERT INTO machine_data (
  machine_id,
  temperature,
  humidity,
  door_status,
  power_status,
  stock_summary,
  sales_count,
  error_codes,
  status,
  recorded_at
) VALUES 
(
  'VM01',
  24.8,
  55,
  'CLOSED',
  'NORMAL',
  '{
    "total_capacity": 100,
    "total_current": 85,
    "slots": [
      {"slot": "A1", "product_id": "PROD001", "current": 10, "capacity": 10},
      {"slot": "A2", "product_id": "PROD002", "current": 10, "capacity": 10},
      {"slot": "A3", "product_id": "PROD003", "current": 15, "capacity": 15},
      {"slot": "B1", "product_id": "PROD004", "current": 15, "capacity": 15},
      {"slot": "B2", "product_id": "PROD005", "current": 10, "capacity": 15},
      {"slot": "B3", "product_id": "PROD006", "current": 25, "capacity": 25}
    ]
  }'::jsonb,
  15,
  '[]'::jsonb,
  'normal',
  (CURRENT_DATE - INTERVAL '1 day' + TIME '10:00:00')::timestamptz
),
(
  'VM01',
  25.5,
  57,
  'CLOSED',
  'NORMAL',
  '{
    "total_capacity": 100,
    "total_current": 78,
    "slots": [
      {"slot": "A1", "product_id": "PROD001", "current": 9, "capacity": 10},
      {"slot": "A2", "product_id": "PROD002", "current": 9, "capacity": 10},
      {"slot": "A3", "product_id": "PROD003", "current": 14, "capacity": 15},
      {"slot": "B1", "product_id": "PROD004", "current": 14, "capacity": 15},
      {"slot": "B2", "product_id": "PROD005", "current": 9, "capacity": 15},
      {"slot": "B3", "product_id": "PROD006", "current": 23, "capacity": 25}
    ]
  }'::jsonb,
  22,
  '[]'::jsonb,
  'normal',
  (CURRENT_DATE - INTERVAL '1 day' + TIME '12:00:00')::timestamptz
),
(
  'VM01',
  26.0,
  60,
  'CLOSED',
  'NORMAL',
  '{
    "total_capacity": 100,
    "total_current": 70,
    "slots": [
      {"slot": "A1", "product_id": "PROD001", "current": 8, "capacity": 10},
      {"slot": "A2", "product_id": "PROD002", "current": 8, "capacity": 10},
      {"slot": "A3", "product_id": "PROD003", "current": 12, "capacity": 15},
      {"slot": "B1", "product_id": "PROD004", "current": 13, "capacity": 15},
      {"slot": "B2", "product_id": "PROD005", "current": 8, "capacity": 15},
      {"slot": "B3", "product_id": "PROD006", "current": 21, "capacity": 25}
    ]
  }'::jsonb,
  30,
  '[]'::jsonb,
  'normal',
  (CURRENT_DATE - INTERVAL '1 day' + TIME '14:00:00')::timestamptz
);

-- Warning status example (high temperature)
INSERT INTO machine_data (
  machine_id,
  temperature,
  humidity,
  door_status,
  power_status,
  stock_summary,
  sales_count,
  error_codes,
  status,
  recorded_at
) VALUES (
  'VM01',
  32.5,
  65,
  'CLOSED',
  'NORMAL',
  '{
    "total_capacity": 100,
    "total_current": 55,
    "slots": [
      {"slot": "A1", "product_id": "PROD001", "current": 7, "capacity": 10},
      {"slot": "A2", "product_id": "PROD002", "current": 5, "capacity": 10},
      {"slot": "A3", "product_id": "PROD003", "current": 8, "capacity": 15},
      {"slot": "B1", "product_id": "PROD004", "current": 11, "capacity": 15},
      {"slot": "B2", "product_id": "PROD005", "current": 7, "capacity": 15},
      {"slot": "B3", "product_id": "PROD006", "current": 17, "capacity": 25}
    ]
  }'::jsonb,
  25,
  '["HIGH_TEMP"]'::jsonb,
  'warning',
  (CURRENT_DATE - INTERVAL '2 days' + TIME '12:00:00')::timestamptz
);

-- Verify data inserted
SELECT 
  machine_id,
  temperature,
  humidity,
  sales_count,
  status,
  recorded_at
FROM machine_data
WHERE machine_id = 'VM01'
ORDER BY recorded_at DESC;

-- ==============================================
-- Query selesai!
-- Data dummy untuk VM01 sudah tersedia:
-- - Data hari ini: 10:00, 12:00, 14:00
-- - Data kemarin: 10:00, 12:00, 14:00
-- - Data 2 hari lalu: warning status
-- ==============================================
