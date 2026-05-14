-- ============================================================
-- AI SkillFit — Complete RLS Fix
-- Run this ENTIRE script in your Supabase SQL editor
-- Fixes: profiles 500, job posting, companies insert,
--        interviews visibility, recursive policy crash
-- ============================================================

-- ── STEP 1: Drop the broken recursive function ───────────────
DROP FUNCTION IF EXISTS public.current_user_role() CASCADE;

-- ── STEP 2: Create a SECURITY DEFINER helper (no recursion) ──
-- Reads role directly, bypasses RLS on profiles
CREATE OR REPLACE FUNCTION public.get_user_role(uid UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = uid;
$$;

-- ── STEP 3: PROFILES — drop all, recreate clean ──────────────
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

-- ── STEP 4: COMPANIES — drop all, recreate clean ─────────────
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'companies' AND schemaname = 'public'
  LOOP EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON companies'; END LOOP;
END $$;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_select_all"   ON companies FOR SELECT USING (true);
CREATE POLICY "companies_insert_auth"  ON companies FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "companies_update_owner" ON companies FOR UPDATE USING (auth.uid() = created_by OR public.get_user_role(auth.uid()) IN ('admin','employer'));
CREATE POLICY "companies_delete_owner" ON companies FOR DELETE USING (auth.uid() = created_by OR public.get_user_role(auth.uid()) = 'admin');

-- ── STEP 5: JOBS — drop all, recreate clean ──────────────────
ALTER TABLE jobs DISABLE ROW LEVEL SECURITY;
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'jobs' AND schemaname = 'public'
  LOOP EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON jobs'; END LOOP;
END $$;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jobs_select_all"    ON jobs FOR SELECT USING (true);
CREATE POLICY "jobs_insert_auth"   ON jobs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "jobs_update_owner"  ON jobs FOR UPDATE USING (auth.uid() = created_by OR public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "jobs_delete_owner"  ON jobs FOR DELETE USING (auth.uid() = created_by OR public.get_user_role(auth.uid()) = 'admin');

-- ── STEP 6: APPLICATIONS — drop all, recreate clean ──────────
ALTER TABLE applications DISABLE ROW LEVEL SECURITY;
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'applications' AND schemaname = 'public'
  LOOP EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON applications'; END LOOP;
END $$;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- Candidates see and create their own applications
CREATE POLICY "applications_candidate_select" ON applications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "applications_candidate_insert" ON applications FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Employers see applications for their jobs
CREATE POLICY "applications_employer_select" ON applications FOR SELECT USING (
  EXISTS (SELECT 1 FROM jobs j WHERE j.id = applications.job_id AND j.created_by = auth.uid())
);

-- Employers update application status for their jobs
CREATE POLICY "applications_employer_update" ON applications FOR UPDATE USING (
  EXISTS (SELECT 1 FROM jobs j WHERE j.id = applications.job_id AND j.created_by = auth.uid())
  OR public.get_user_role(auth.uid()) = 'admin'
);

-- Admins see all
CREATE POLICY "applications_admin_select" ON applications FOR SELECT USING (
  public.get_user_role(auth.uid()) = 'admin'
);

-- ── STEP 7: INTERVIEWS — drop all, recreate clean ────────────
ALTER TABLE interviews DISABLE ROW LEVEL SECURITY;
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'interviews' AND schemaname = 'public'
  LOOP EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON interviews'; END LOOP;
END $$;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;

-- Candidates see their own
CREATE POLICY "interviews_candidate_select" ON interviews FOR SELECT USING (auth.uid() = user_id);

-- Employers see interviews for their jobs
CREATE POLICY "interviews_employer_select" ON interviews FOR SELECT USING (
  EXISTS (SELECT 1 FROM jobs j WHERE j.id = interviews.job_id AND j.created_by = auth.uid())
);

-- Admins see ALL interviews
CREATE POLICY "interviews_admin_select" ON interviews FOR SELECT USING (
  public.get_user_role(auth.uid()) = 'admin'
);

-- Employers see interviews by candidate name (voice bot interviews without job_id)
CREATE POLICY "interviews_employer_name_select" ON interviews FOR SELECT USING (
  public.get_user_role(auth.uid()) IN ('employer', 'admin')
);

-- Backend service role inserts (service role bypasses RLS automatically)
-- But add a permissive insert policy as fallback
CREATE POLICY "interviews_insert_any" ON interviews FOR INSERT WITH CHECK (true);

-- ── STEP 7b: Fix fitment check constraint to include all 5 values ──
ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_fitment_check;
ALTER TABLE interviews ADD CONSTRAINT interviews_fitment_check
  CHECK (fitment IN (
    'Job-Ready',
    'Requires Training',
    'Low Confidence',
    'Requires Significant Upskilling',
    'Requires Manual Verification'
  ));

-- ── STEP 8: BLOCKED_CANDIDATES ───────────────────────────────
ALTER TABLE blocked_candidates DISABLE ROW LEVEL SECURITY;
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'blocked_candidates' AND schemaname = 'public'
  LOOP EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON blocked_candidates'; END LOOP;
END $$;
ALTER TABLE blocked_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blocked_employer_all" ON blocked_candidates FOR ALL USING (
  EXISTS (SELECT 1 FROM companies c WHERE c.id = blocked_candidates.company_id AND c.created_by = auth.uid())
  OR public.get_user_role(auth.uid()) = 'admin'
);
CREATE POLICY "blocked_candidate_select" ON blocked_candidates FOR SELECT USING (auth.uid() = user_id);

-- ── STEP 9: Add missing profiles columns if not present ──────
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

-- ── STEP 10: Add missing interviews columns if not present ────
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
  ADD COLUMN IF NOT EXISTS integrity_flag   BOOLEAN DEFAULT FALSE;

-- ── STEP 11: Indexes for fast filtering ──────────────────────
CREATE INDEX IF NOT EXISTS idx_interviews_fitment       ON interviews (fitment);
CREATE INDEX IF NOT EXISTS idx_interviews_category      ON interviews (category);
CREATE INDEX IF NOT EXISTS idx_interviews_language      ON interviews (language);
CREATE INDEX IF NOT EXISTS idx_interviews_district      ON interviews (district);
CREATE INDEX IF NOT EXISTS idx_interviews_avg_score     ON interviews (average_score);
CREATE INDEX IF NOT EXISTS idx_interviews_integrity     ON interviews (integrity_flag);
CREATE INDEX IF NOT EXISTS idx_profiles_phone           ON profiles (phone);

-- ── Done ──────────────────────────────────────────────────────
SELECT 'RLS policies fixed successfully' AS status;
