-- supabase.sql
-- Idempotent schema setup for Cripsy Corner
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.

-- Create the settings table if it does not already exist
CREATE TABLE IF NOT EXISTS public.settings (
    key         text        PRIMARY KEY,
    value       jsonb       NOT NULL DEFAULT 'null'::jsonb,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Add columns that may be missing in older deployments (idempotent)
ALTER TABLE public.settings
    ADD COLUMN IF NOT EXISTS value      jsonb        NOT NULL DEFAULT 'null'::jsonb,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz  NOT NULL DEFAULT now();

-- Enable Realtime so the live-sync subscription receives change events
-- (Only needed once per table; safe to run again.)
ALTER PUBLICATION supabase_realtime ADD TABLE public.settings;
