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

-- ============================================================
-- 9. Optimistic Concurrency Control RPC
--    Prevents stale devices from overwriting newer cloud data.
--
--    Usage (from JS):
--      const { data } = await window.sb.rpc('upsert_setting_concurrency_safe', {
--        p_key: 'cc_inventory',
--        p_value: { ... },
--        p_expected_updated_at: '2024-01-01T00:00:00.000Z'   -- or null
--      });
--      // data: { success, conflict, current_updated_at, current_value }
--
--    Behavior:
--      • Row does not exist → INSERT and return success=true.
--      • Row exists, p_expected_updated_at is NULL → conflict=true (client
--          must sync first before it can write).
--      • Row exists, updated_at ≠ p_expected_updated_at → conflict=true
--          (another device wrote more recently; client must refresh).
--      • Row exists, updated_at = p_expected_updated_at → UPDATE value +
--          bump updated_at=now() and return success=true with new timestamp.
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_setting_concurrency_safe(
  p_key                TEXT,
  p_value              JSONB,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row          settings%ROWTYPE;
  v_now          TIMESTAMPTZ := NOW();
  v_result       JSONB;
BEGIN
  -- Try to fetch existing row
  SELECT * INTO v_row FROM settings WHERE key = p_key;

  IF NOT FOUND THEN
    -- Row does not exist → insert it
    INSERT INTO settings (key, value, updated_at)
    VALUES (p_key, p_value, v_now);

    v_result := jsonb_build_object(
      'success',          true,
      'conflict',         false,
      'current_updated_at', v_now,
      'current_value',    p_value
    );

  ELSIF p_expected_updated_at IS NULL THEN
    -- Client does not know the current timestamp → reject to force a sync
    v_result := jsonb_build_object(
      'success',          false,
      'conflict',         true,
      'current_updated_at', v_row.updated_at,
      'current_value',    v_row.value
    );

  ELSIF v_row.updated_at != p_expected_updated_at THEN
    -- Timestamps do not match → stale client, return current state
    v_result := jsonb_build_object(
      'success',          false,
      'conflict',         true,
      'current_updated_at', v_row.updated_at,
      'current_value',    v_row.value
    );

  ELSE
    -- Timestamps match → safe to update
    UPDATE settings
    SET value = p_value, updated_at = v_now
    WHERE key = p_key;

    v_result := jsonb_build_object(
      'success',          true,
      'conflict',         false,
      'current_updated_at', v_now,
      'current_value',    p_value
    );
  END IF;

  RETURN v_result;
END;
$$;

-- ============================================================
-- 10. RLS for the RPC function
--
--  SCENARIO A — RLS is OFF on the settings table:
--    No extra steps needed. The function above already works.
--    (RLS is currently ENABLED in this script; if you disabled it,
--     the policies below are ignored but harmless.)
--
--  SCENARIO B — RLS is ON (current setup in this script):
--    The function is declared SECURITY DEFINER, so it runs with the
--    privileges of the function owner (usually postgres / service role)
--    and bypasses RLS on the settings table internally.
--    Anon/public callers can call the function as long as EXECUTE
--    privilege is granted, which Supabase grants by default to the
--    anon role for functions created in the public schema.
--
--    If your project has restricted EXECUTE on functions, run:
--      GRANT EXECUTE ON FUNCTION upsert_setting_concurrency_safe(TEXT,JSONB,TIMESTAMPTZ)
--        TO anon, authenticated;
--
-- ⚠️  SECURITY TRADE-OFF WARNING ⚠️
--    This app uses the Supabase anon (public) key embedded in client-side
--    JavaScript and does NOT use Supabase Auth.  Anyone who inspects the
--    page source can read and modify settings data directly via the
--    Supabase API.  The optimistic concurrency RPC prevents accidental
--    overwrites between admin tabs/devices but does NOT provide security
--    against a malicious actor who finds the anon key.
--    For a production system, replace the anon key with server-side auth.
-- ============================================================

-- ============================================================
-- 11. cc_settings_write — Optimistic Concurrency RPC (v2)
--
--    This is the canonical write path for all settings.
--    It replaces direct upsert() calls and prevents stale
--    devices from overwriting newer cloud data.
--
--    Usage (from JS):
--      const { data } = await window.sb.rpc('cc_settings_write', {
--        p_key:                 'cc_inventory',
--        p_value:               { ... },
--        p_expected_updated_at: '2024-01-01T00:00:00.000Z'   -- or null
--      });
--      // data is an array; use data[0]:
--      // data[0].ok, data[0].conflict, data[0].updated_at, data[0].value
--
--    Behavior:
--      • Row does not exist AND p_expected_updated_at IS NULL
--          → INSERT and return ok=true (first-write succeeds).
--      • Row does not exist AND p_expected_updated_at IS NOT NULL
--          → conflict=true (client thinks row exists but it doesn't).
--      • Row exists AND updated_at matches p_expected_updated_at
--          → UPDATE value + bump updated_at=now(), return ok=true.
--      • Row exists AND updated_at does not match (stale client)
--          → conflict=true with current server value returned.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cc_settings_write(
  p_key                  TEXT,
  p_value                JSONB,
  p_expected_updated_at  TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  ok         BOOLEAN,
  conflict   BOOLEAN,
  updated_at TIMESTAMPTZ,
  value      JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row   settings%ROWTYPE;
  v_now   TIMESTAMPTZ := NOW();
BEGIN
  SELECT * INTO v_row FROM settings WHERE key = p_key;

  IF NOT FOUND THEN
    IF p_expected_updated_at IS NOT NULL THEN
      -- Client expected a row that no longer exists → conflict
      RETURN QUERY SELECT false, true, NULL::TIMESTAMPTZ, NULL::JSONB;
      RETURN;
    END IF;

    -- First write: INSERT
    INSERT INTO settings (key, value, updated_at)
    VALUES (p_key, p_value, v_now);

    RETURN QUERY SELECT true, false, v_now, p_value;
    RETURN;
  END IF;

  -- Row exists: check optimistic concurrency
  IF p_expected_updated_at IS NULL OR v_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    -- Stale client — return current server state without writing
    RETURN QUERY SELECT false, true, v_row.updated_at, v_row.value;
    RETURN;
  END IF;

  -- Timestamps match → safe to update
  UPDATE settings
  SET value = p_value, updated_at = v_now
  WHERE key = p_key;

  RETURN QUERY SELECT true, false, v_now, p_value;
END;
$$;

-- Grant execute to both anon (public website) and authenticated roles
GRANT EXECUTE ON FUNCTION public.cc_settings_write(TEXT, JSONB, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION public.cc_settings_write(TEXT, JSONB, TIMESTAMPTZ) TO authenticated;

-- Done! ✅
-- event_bookings table is ready for booking form submissions
-- settings table handles: inventory, gallery, calendar, contact, finance
-- updated_at trigger ensures last-write-wins sync works correctly
-- upsert_setting_concurrency_safe RPC (legacy) and cc_settings_write RPC both prevent
-- stale devices overwriting newer data; cc_settings_write is the canonical write path
