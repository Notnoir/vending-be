-- ============================================
-- ANNOUNCEMENTS SYSTEM
-- Migration: Add announcements tables
-- PostgreSQL/Supabase Compatible
-- ============================================

-- Main announcements table
CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(20) DEFAULT 'INFO' CHECK (type IN ('INFO', 'WARNING', 'ERROR', 'MAINTENANCE', 'PROMOTION')),
  priority INTEGER DEFAULT 0,
  
  -- Display settings
  is_active BOOLEAN DEFAULT TRUE,
  show_on_web BOOLEAN DEFAULT TRUE,
  show_on_mobile BOOLEAN DEFAULT TRUE,
  
  -- Styling
  icon VARCHAR(50),
  bg_color VARCHAR(20),
  text_color VARCHAR(20),
  
  -- Targeting (JSONB for PostgreSQL)
  target_machines JSONB, -- Array of machine IDs (null = all machines)
  target_users JSONB, -- Array of user roles (null = all users)
  
  -- Scheduling
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  
  -- Tracking
  view_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  dismiss_count INTEGER DEFAULT 0,
  
  -- Action button (optional)
  has_action_button BOOLEAN DEFAULT FALSE,
  action_button_text VARCHAR(50),
  action_button_url VARCHAR(500),
  
  -- Metadata
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tracking table for user interactions
CREATE TABLE IF NOT EXISTS announcement_views (
  id SERIAL PRIMARY KEY,
  announcement_id INTEGER NOT NULL,
  user_id VARCHAR(100),
  machine_id VARCHAR(50),
  action VARCHAR(20) CHECK (action IN ('VIEWED', 'CLICKED', 'DISMISSED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_announcements_type ON announcements(type);
CREATE INDEX IF NOT EXISTS idx_announcement_views_ann_id ON announcement_views(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_views_user_id ON announcement_views(user_id);

-- Trigger for updated_at (PostgreSQL version)
CREATE OR REPLACE FUNCTION update_announcements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_announcements_updated_at
    BEFORE UPDATE ON announcements
    FOR EACH ROW
    EXECUTE FUNCTION update_announcements_updated_at();

-- Sample announcement
INSERT INTO announcements (
  title, 
  message, 
  type, 
  priority, 
  icon, 
  bg_color, 
  text_color, 
  created_by,
  show_on_web,
  show_on_mobile
) VALUES (
  'Welcome to MediVend!',
  'Thank you for using our vending machine service. Get your medicines quickly and easily.',
  'INFO',
  1,
  'info',
  '#E3F2FD',
  '#1565C0',
  'system',
  TRUE,
  TRUE
);
