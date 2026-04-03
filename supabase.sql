-- ============================================================
-- CRISPY CORNER — Supabase Setup Script (Idempotent)
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Create the event_bookings table
CREATE TABLE IF NOT EXISTS event_bookings (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  phone        TEXT,
  email        TEXT,
  event_type   TEXT,
  event_date   TEXT,
  location     TEXT,
  people       INTEGER,
  stall_fee    TEXT,
  message      TEXT,
  status       TEXT DEFAULT 'pending',
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable Row Level Security
ALTER TABLE event_bookings ENABLE ROW LEVEL SECURITY;

-- 3. Policies for event_bookings (drop if exist first to avoid errors)
DROP POLICY IF EXISTS "Public insert bookings" ON event_bookings;
DROP POLICY IF EXISTS "Public read bookings"   ON event_bookings;
DROP POLICY IF EXISTS "Public update bookings" ON event_bookings;
DROP POLICY IF EXISTS "Public delete bookings" ON event_bookings;

CREATE POLICY "Public insert bookings" ON event_bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read bookings"   ON event_bookings FOR SELECT USING (true);
CREATE POLICY "Public update bookings" ON event_bookings FOR UPDATE USING (true);
CREATE POLICY "Public delete bookings" ON event_bookings FOR DELETE USING (true);

-- 4. Make sure settings table exists
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Enable RLS on settings
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- 6. Settings policies
DROP POLICY IF EXISTS "Public read settings"   ON settings;
DROP POLICY IF EXISTS "Public insert settings" ON settings;
DROP POLICY IF EXISTS "Public update settings" ON settings;
DROP POLICY IF EXISTS "Public delete settings" ON settings;

CREATE POLICY "Public read settings"   ON settings FOR SELECT USING (true);
CREATE POLICY "Public insert settings" ON settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update settings" ON settings FOR UPDATE USING (true);
CREATE POLICY "Public delete settings" ON settings FOR DELETE USING (true);

-- 7. Trigger: auto-update updated_at on settings UPDATE
CREATE OR REPLACE FUNCTION settings_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_settings_updated_at ON settings;
CREATE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION settings_set_updated_at();

-- 8. Add realtime publications (idempotent — no error if already present)
DO $$
BEGIN
  -- Add event_bookings to realtime publication if not already there
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'event_bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE event_bookings;
    RAISE NOTICE 'Added event_bookings to realtime';
  ELSE
    RAISE NOTICE 'event_bookings already in realtime — skipped';
  END IF;

  -- settings realtime check
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE settings;
    RAISE NOTICE 'Added settings to realtime';
  ELSE
    RAISE NOTICE 'settings already in realtime — skipped';
  END IF;
END $$;

-- Done! ✅
-- event_bookings table is ready for booking form submissions
-- settings table handles: inventory, gallery, calendar, contact, finance
-- updated_at trigger ensures last-write-wins sync works correctly
