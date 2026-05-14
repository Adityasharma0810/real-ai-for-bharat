-- ============================================================
-- AI SkillFit — Interview Results Migration
-- Run this in your Supabase SQL editor AFTER migrations.sql
-- ============================================================

-- 1. Add missing columns to interviews table
ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS candidate_name   TEXT,
  ADD COLUMN IF NOT EXISTS phone_number     TEXT,
  ADD COLUMN IF NOT EXISTS trade            TEXT,
  ADD COLUMN IF NOT EXISTS language         TEXT DEFAULT 'English',
  ADD COLUMN IF NOT EXISTS district         TEXT,
  ADD COLUMN IF NOT EXISTS category         TEXT,        -- Blue-collar Trades / Polytechnic-Skilled Roles / Semi-Skilled Workforce
  ADD COLUMN IF NOT EXISTS average_score    FLOAT,
  ADD COLUMN IF NOT EXISTS fitment          TEXT,        -- Job-Ready / Requires Training / Low Confidence / Requires Significant Upskilling
  ADD COLUMN IF NOT EXISTS scores           JSONB,       -- [6, 7, 5, 8, ...] per-question scores
  ADD COLUMN IF NOT EXISTS weak_topics      JSONB,       -- ["Safety Practices", "Troubleshooting"]
  ADD COLUMN IF NOT EXISTS confidence_score FLOAT,       -- 0-100 derived metric
  ADD COLUMN IF NOT EXISTS integrity_flag   BOOLEAN DEFAULT FALSE;

-- 2. Add CHECK constraint for fitment values (safe to run multiple times)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'interviews_fitment_check'
  ) THEN
    ALTER TABLE interviews
      ADD CONSTRAINT interviews_fitment_check
      CHECK (fitment IN (
        'Job-Ready',
        'Requires Training',
        'Low Confidence',
        'Requires Significant Upskilling'
      ));
  END IF;
END $$;

-- 3. Add CHECK constraint for category values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'interviews_category_check'
  ) THEN
    ALTER TABLE interviews
      ADD CONSTRAINT interviews_category_check
      CHECK (category IN (
        'Blue-collar Trades',
        'Polytechnic-Skilled Roles',
        'Semi-Skilled Workforce',
        'Unknown'
      ));
  END IF;
END $$;

-- 4. Create indexes for common filter queries
CREATE INDEX IF NOT EXISTS idx_interviews_fitment       ON interviews (fitment);
CREATE INDEX IF NOT EXISTS idx_interviews_category      ON interviews (category);
CREATE INDEX IF NOT EXISTS idx_interviews_language      ON interviews (language);
CREATE INDEX IF NOT EXISTS idx_interviews_district      ON interviews (district);
CREATE INDEX IF NOT EXISTS idx_interviews_average_score ON interviews (average_score);
CREATE INDEX IF NOT EXISTS idx_interviews_integrity     ON interviews (integrity_flag);
CREATE INDEX IF NOT EXISTS idx_interviews_phone         ON interviews (phone_number);
CREATE INDEX IF NOT EXISTS idx_interviews_created_at    ON interviews (created_at DESC);

-- 5. RLS: Allow admins to read ALL interviews (not just their own)
DROP POLICY IF EXISTS "Admins can view all interviews" ON interviews;
CREATE POLICY "Admins can view all interviews"
ON interviews FOR SELECT
USING (
  public.current_user_role() = 'admin'
);

-- 6. RLS: Allow the backend service role to insert interviews
-- (The backend uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS automatically)

-- 7. RLS: Candidates can view their own interview results
DROP POLICY IF EXISTS "Candidates can view own interviews" ON interviews;
CREATE POLICY "Candidates can view own interviews"
ON interviews FOR SELECT
USING (
  auth.uid() = user_id
);

-- 8. Helper function to get current user role (if not already created)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- 9. View for admin dashboard — joins interviews with profiles for easy querying
CREATE OR REPLACE VIEW admin_interview_view AS
SELECT
  i.id,
  i.user_id,
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
  p.district AS profile_district,
  p.experience_level,
  p.education
FROM interviews i
LEFT JOIN profiles p ON p.id = i.user_id;

-- Grant access to the view for authenticated users (RLS on base table still applies)
GRANT SELECT ON admin_interview_view TO authenticated;
