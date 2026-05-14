-- ============================================================
-- AI SkillFit — Admin Dashboard & Integration Fixes
-- Run this in your Supabase SQL editor AFTER fix_rls_policies.sql
-- ============================================================

-- ── STEP 1: Ensure interviews table has all required columns ──
ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS candidate_name   TEXT,
  ADD COLUMN IF NOT EXISTS phone_number     TEXT,
  ADD COLUMN IF NOT EXISTS trade            TEXT,
  ADD COLUMN IF NOT EXISTS language         TEXT DEFAULT 'English',
  ADD COLUMN IF NOT EXISTS district         TEXT,
  ADD COLUMN IF NOT EXISTS category         TEXT,
  ADD COLUMN IF NOT EXISTS average_score    FLOAT,
  ADD COLUMN IF NOT EXISTS fitment          TEXT,
  ADD COLUMN IF NOT EXISTS scores           JSONB,
  ADD COLUMN IF NOT EXISTS weak_topics      JSONB,
  ADD COLUMN IF NOT EXISTS confidence_score INTEGER,
  ADD COLUMN IF NOT EXISTS integrity_flag   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS feedback         JSONB,
  ADD COLUMN IF NOT EXISTS transcript       JSONB;

-- ── STEP 2: Fix fitment constraint to include all 5 values ──
ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_fitment_check;
ALTER TABLE interviews ADD CONSTRAINT interviews_fitment_check
  CHECK (fitment IN (
    'Job-Ready',
    'Requires Training',
    'Low Confidence',
    'Requires Significant Upskilling',
    'Requires Manual Verification'
  ));

-- ── STEP 3: Fix category constraint to include Unknown ──
ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_category_check;
ALTER TABLE interviews ADD CONSTRAINT interviews_category_check
  CHECK (category IN (
    'Blue-collar Trades',
    'Polytechnic-Skilled Roles',
    'Semi-Skilled Workforce',
    'Unknown'
  ));

-- ── STEP 4: Ensure profiles has all required columns ──
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

-- ── STEP 5: Drop and recreate the get_user_role helper (no recursion) ──
DROP FUNCTION IF EXISTS public.get_user_role(UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.get_user_role(uid UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = uid;
$$;

-- ── STEP 6: Fix RLS on profiles ──
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'profiles' AND schemaname = 'public'
  LOOP EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON profiles'; END LOOP;
END $$;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_all"  ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own"  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own"  ON profiles FOR UPDATE USING (auth.uid() = id);

-- ── STEP 7: Fix RLS on interviews ──
ALTER TABLE interviews DISABLE ROW LEVEL SECURITY;
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'interviews' AND schemaname = 'public'
  LOOP EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON interviews'; END LOOP;
END $$;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;

-- Candidates see their own interviews
-- Match by user_id (primary) — covers interviews saved with user_id linked
CREATE POLICY "interviews_candidate_select" ON interviews FOR SELECT
  USING (auth.uid() = user_id);

-- Candidates can also see interviews matched by their phone number
-- (covers older interviews saved before user_id was linked)
CREATE POLICY "interviews_candidate_phone_select" ON interviews FOR SELECT
  USING (
    phone_number IS NOT NULL AND
    phone_number = (SELECT phone FROM public.profiles WHERE id = auth.uid() LIMIT 1)
  );

-- Employers see interviews for their jobs OR for their applicants
CREATE POLICY "interviews_employer_select" ON interviews FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM jobs j WHERE j.id = interviews.job_id AND j.created_by = auth.uid())
    OR EXISTS (
      SELECT 1 FROM applications a
      JOIN jobs j ON j.id = a.job_id
      WHERE a.user_id = interviews.user_id AND j.created_by = auth.uid()
    )
  );

-- Admins see ALL interviews
CREATE POLICY "interviews_admin_select" ON interviews FOR SELECT
  USING (public.get_user_role(auth.uid()) = 'admin');

-- Employers and admins can update admin_status on interviews
CREATE POLICY "interviews_employer_update" ON interviews FOR UPDATE
  USING (
    public.get_user_role(auth.uid()) IN ('admin', 'employer')
    OR EXISTS (SELECT 1 FROM jobs j WHERE j.id = interviews.job_id AND j.created_by = auth.uid())
    OR EXISTS (
      SELECT 1 FROM applications a
      JOIN jobs j ON j.id = a.job_id
      WHERE a.user_id = interviews.user_id AND j.created_by = auth.uid()
    )
  )
  WITH CHECK (true);

-- Backend service role inserts (service role bypasses RLS automatically)
CREATE POLICY "interviews_insert_any" ON interviews FOR INSERT WITH CHECK (true);

-- ── STEP 8: Fix RLS on applications ──
ALTER TABLE applications DISABLE ROW LEVEL SECURITY;
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'applications' AND schemaname = 'public'
  LOOP EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON applications'; END LOOP;
END $$;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "applications_candidate_select" ON applications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "applications_candidate_insert" ON applications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "applications_employer_select" ON applications FOR SELECT USING (
  EXISTS (SELECT 1 FROM jobs j WHERE j.id = applications.job_id AND j.created_by = auth.uid())
);
CREATE POLICY "applications_employer_update" ON applications FOR UPDATE USING (
  EXISTS (SELECT 1 FROM jobs j WHERE j.id = applications.job_id AND j.created_by = auth.uid())
  OR public.get_user_role(auth.uid()) = 'admin'
);
CREATE POLICY "applications_admin_select" ON applications FOR SELECT USING (
  public.get_user_role(auth.uid()) = 'admin'
);
-- Allow admins to insert applications (for interview-only candidates being shortlisted)
CREATE POLICY "applications_admin_insert" ON applications FOR INSERT WITH CHECK (
  public.get_user_role(auth.uid()) = 'admin'
);

-- ── STEP 9: Indexes for performance ──
CREATE INDEX IF NOT EXISTS idx_interviews_user_id     ON interviews (user_id);
CREATE INDEX IF NOT EXISTS idx_interviews_job_id      ON interviews (job_id);
CREATE INDEX IF NOT EXISTS idx_interviews_fitment     ON interviews (fitment);
CREATE INDEX IF NOT EXISTS idx_interviews_category    ON interviews (category);
CREATE INDEX IF NOT EXISTS idx_interviews_language    ON interviews (language);
CREATE INDEX IF NOT EXISTS idx_interviews_district    ON interviews (district);
CREATE INDEX IF NOT EXISTS idx_interviews_avg_score   ON interviews (average_score);
CREATE INDEX IF NOT EXISTS idx_interviews_integrity   ON interviews (integrity_flag);
CREATE INDEX IF NOT EXISTS idx_interviews_created_at  ON interviews (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_phone         ON profiles (phone);
CREATE INDEX IF NOT EXISTS idx_profiles_email         ON profiles (email);
CREATE INDEX IF NOT EXISTS idx_applications_user_id   ON applications (user_id);
CREATE INDEX IF NOT EXISTS idx_applications_job_id    ON applications (job_id);

-- ── STEP 10: Updated admin view with all profile fields ──
DROP VIEW IF EXISTS admin_interview_view;
CREATE OR REPLACE VIEW admin_interview_view AS
SELECT
  i.id,
  i.user_id,
  i.job_id,
  i.candidate_name,
  i.phone_number,
  i.trade,
  i.language,
  i.district,
  i.category,
  i.fitment,
  i.average_score,
  i.confidence_score,
  i.integrity_flag,
  i.scores,
  i.weak_topics,
  i.feedback,
  i.transcript,
  i.created_at,
  p.full_name,
  p.email,
  p.phone,
  p.age,
  p.gender,
  p.district AS profile_district,
  p.experience_level,
  p.education,
  p.work_preference,
  p.skills,
  p.trade AS profile_trade
FROM interviews i
LEFT JOIN profiles p ON p.id = i.user_id;

GRANT SELECT ON admin_interview_view TO authenticated;

-- ── STEP 11: Add admin_status column to interviews for direct shortlisting ──
-- This allows admins/employers to mark candidates without needing an application record
ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS admin_status TEXT DEFAULT NULL
  CHECK (admin_status IN ('shortlisted', 'rejected', 'marked_for_training', NULL));

CREATE INDEX IF NOT EXISTS idx_interviews_admin_status ON interviews (admin_status);

SELECT 'Admin dashboard policies applied successfully' AS status;
