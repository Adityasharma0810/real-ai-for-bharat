-- ============================================================
-- AI SkillFit — Profiles Table Migration
-- Run this in your Supabase SQL editor if you get 500 errors
-- on /rest/v1/profiles
-- ============================================================

-- Add missing columns to profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone              TEXT,
  ADD COLUMN IF NOT EXISTS age               TEXT,
  ADD COLUMN IF NOT EXISTS gender            TEXT,
  ADD COLUMN IF NOT EXISTS district          TEXT,
  ADD COLUMN IF NOT EXISTS trade             TEXT,
  ADD COLUMN IF NOT EXISTS experience_level  TEXT,
  ADD COLUMN IF NOT EXISTS skills            TEXT[],
  ADD COLUMN IF NOT EXISTS education         TEXT,
  ADD COLUMN IF NOT EXISTS work_preference   TEXT,
  ADD COLUMN IF NOT EXISTS language_preference TEXT DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Index for phone lookup (used by voice bot sync)
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles (phone);

-- Allow users to insert their own profile (needed for upsert on signup)
DROP POLICY IF EXISTS "Users can insert own profile." ON profiles;
CREATE POLICY "Users can insert own profile."
ON profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- Allow admins to read all profiles
DROP POLICY IF EXISTS "Admins can read all profiles." ON profiles;
CREATE POLICY "Admins can read all profiles."
ON profiles FOR SELECT
USING (
  public.current_user_role() = 'admin'
  OR auth.uid() = id
);
