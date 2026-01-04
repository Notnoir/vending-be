-- Migration: Drop telemetry table (use machine_data instead)
-- Date: 2026-01-04
-- Purpose: Simplify data storage by using only machine_data table

-- Drop the telemetry table
DROP TABLE IF EXISTS telemetry;

-- Optional: Add comment to machine_data table
COMMENT ON TABLE machine_data IS 'Stores all machine telemetry data in structured format. Replaces the old telemetry table.';

-- Create index on machine_id and recorded_at for better query performance
CREATE INDEX IF NOT EXISTS idx_machine_data_machine_recorded 
ON machine_data (machine_id, recorded_at DESC);

-- Create index on status for filtering alerts
CREATE INDEX IF NOT EXISTS idx_machine_data_status 
ON machine_data (status);
