# Cripsy Corner 🌶️

A live snack mixing experience stall — static site with Supabase cloud sync.

## Setup

### 1. Supabase table

Run `supabase.sql` once in the **Supabase SQL Editor** (Dashboard → SQL Editor → New query).
This creates the `settings` table used to sync admin data across devices.

### 2. Deploy

Push to GitHub. Vercel auto-deploys on every push.

---

## ⚠️ Security note — Row Level Security (RLS)

The `settings` table is currently **publicly readable and writable** using the anon key
that is embedded in the HTML. This is acceptable for a low-risk internal tool, but be aware:

- Anyone who inspects the page source can find the anon key and read/write the table.
- Do **not** store truly sensitive data (credit-card numbers, personal information, etc.)
  in the `settings` table.

To harden the setup in the future, enable RLS in Supabase and add policies that restrict
write access to authenticated users only. The current implementation deliberately skips
RLS to keep the single-password login simple (Option A).
