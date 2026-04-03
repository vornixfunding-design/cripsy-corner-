-- ================================================================
-- CRISPY CORNER — SUPABASE SCHEMA (v2 — Full Dedicated Tables)
-- ================================================================
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT DO NOTHING
-- ================================================================

-- ----------------------------------------------------------------
-- 1. BOOKINGS — Event booking requests from website forms
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bookings (
    id            bigint        PRIMARY KEY,
    name          text          NOT NULL DEFAULT '',
    phone         text          NOT NULL DEFAULT '',
    email         text          NOT NULL DEFAULT '',
    event_type    text          NOT NULL DEFAULT '',
    event_date    text          NOT NULL DEFAULT '',
    location      text          NOT NULL DEFAULT '',
    people        text          NOT NULL DEFAULT '',
    stall_fee     text          NOT NULL DEFAULT '',
    message       text          NOT NULL DEFAULT '',
    status        text          NOT NULL DEFAULT 'pending',
    submitted_at  timestamptz   NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- 2. BOOKED_DATES — Calendar availability dates
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booked_dates (
    date_str  text  PRIMARY KEY
);

-- ----------------------------------------------------------------
-- 3. INVENTORY — Stock items
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory (
    id          bigserial     PRIMARY KEY,
    name        text          NOT NULL DEFAULT '',
    category    text          NOT NULL DEFAULT 'packets',
    qty         numeric       NOT NULL DEFAULT 0,
    unit        text          NOT NULL DEFAULT 'units',
    min_level   numeric       NOT NULL DEFAULT 5,
    price       numeric       NOT NULL DEFAULT 0,
    updated_at  timestamptz   NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- 4. INVENTORY_LOG — Stock change history
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_log (
    id          bigint        PRIMARY KEY,
    item_name   text          NOT NULL DEFAULT '',
    change_amt  numeric       NOT NULL DEFAULT 0,
    new_qty     numeric       NOT NULL DEFAULT 0,
    change_type text          NOT NULL DEFAULT 'positive',
    icon        text          NOT NULL DEFAULT '📦',
    logged_at   timestamptz   NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- 5. FINANCE_ACCOUNTS — Bank/cash account definitions
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_accounts (
    id          text          PRIMARY KEY,
    name        text          NOT NULL DEFAULT '',
    opening     numeric       NOT NULL DEFAULT 0,
    balance     numeric       NOT NULL DEFAULT 0,
    color       text          NOT NULL DEFAULT '#ffffff',
    updated_at  timestamptz   NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- 6. FINANCE_TRANSACTIONS — Income / Expense / Investment records
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_transactions (
    id          bigint        PRIMARY KEY,
    tx_type     text          NOT NULL DEFAULT 'income',
    tx_date     text          NOT NULL DEFAULT '',
    amount      numeric       NOT NULL DEFAULT 0,
    account_id  text          NOT NULL DEFAULT '',
    description text          NOT NULL DEFAULT '',
    member      text,
    recorded_at timestamptz   NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- 7. CONTACT_INFO — Single-row contact & team settings
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_info (
    id          int           PRIMARY KEY DEFAULT 1,
    phone       text          NOT NULL DEFAULT '',
    whatsapp    text          NOT NULL DEFAULT '',
    email       text          NOT NULL DEFAULT '',
    instagram   text          NOT NULL DEFAULT '',
    city        text          NOT NULL DEFAULT '',
    team1       text          NOT NULL DEFAULT '',
    team2       text          NOT NULL DEFAULT '',
    team3       text          NOT NULL DEFAULT '',
    updated_at  timestamptz   NOT NULL DEFAULT now()
);
-- Ensure only one row ever exists
INSERT INTO public.contact_info (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
-- 8. GALLERY — Media items (images & videos)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gallery (
    id          bigserial     PRIMARY KEY,
    src         text          NOT NULL DEFAULT '',
    caption     text          NOT NULL DEFAULT '',
    media_type  text          NOT NULL DEFAULT 'image',
    storage_path text,
    added_at    timestamptz   NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- 9. FIN_HISTORY — Archived finance sessions
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fin_history (
    id            bigint        PRIMARY KEY,
    session_date  text          NOT NULL DEFAULT '',
    total_sales   numeric       NOT NULL DEFAULT 0,
    transactions  jsonb         NOT NULL DEFAULT '[]'::jsonb,
    archived_at   timestamptz   NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- 10. SETTINGS — Password + miscellaneous key-value pairs
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settings (
    key         text        PRIMARY KEY,
    value       jsonb       NOT NULL DEFAULT 'null'::jsonb,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed default password (only if not already set)
INSERT INTO public.settings (key, value) VALUES ('cc_admin_pwd', '"admin123"')
    ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------
-- 11. ENABLE REALTIME on all critical tables
-- ----------------------------------------------------------------
-- SET TABLE replaces the entire list for the publication, 
-- making it perfectly safe to re-run without "already exists" errors.
ALTER PUBLICATION supabase_realtime SET TABLE 
    public.bookings, 
    public.booked_dates, 
    public.inventory, 
    public.inventory_log, 
    public.finance_accounts, 
    public.finance_transactions, 
    public.contact_info, 
    public.gallery, 
    public.settings;

-- ----------------------------------------------------------------
-- 12. STORAGE BUCKET — For gallery media uploads
-- ----------------------------------------------------------------
-- Create the 'gallery' storage bucket (public, 10MB limit per file)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'gallery',
    'gallery',
    true,
    10485760, -- 10 MB per file
    ARRAY['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm']
) ON CONFLICT (id) DO NOTHING;

-- Allow anonymous uploads to the gallery bucket (public access)
DROP POLICY IF EXISTS "Allow public uploads to gallery" ON storage.objects;
CREATE POLICY "Allow public uploads to gallery"
    ON storage.objects FOR INSERT TO anon
    WITH CHECK (bucket_id = 'gallery');

DROP POLICY IF EXISTS "Allow public reads from gallery" ON storage.objects;
CREATE POLICY "Allow public reads from gallery"
    ON storage.objects FOR SELECT TO anon
    USING (bucket_id = 'gallery');

DROP POLICY IF EXISTS "Allow public deletes from gallery" ON storage.objects;
CREATE POLICY "Allow public deletes from gallery"
    ON storage.objects FOR DELETE TO anon
    USING (bucket_id = 'gallery');

-- ================================================================
-- DONE! Your schema is ready.
-- Next: Open admin.html and confirm supabaseUrl / supabaseKey
-- are set correctly, then log in to trigger automatic data migration.
-- ================================================================
