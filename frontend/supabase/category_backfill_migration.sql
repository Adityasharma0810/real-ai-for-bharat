-- ============================================================
-- Category Backfill + Constraint Fix Migration
-- Run this in your Supabase SQL editor
-- ============================================================

-- Step 1: Drop the old category CHECK constraint so we can update freely
ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_category_check;

-- Step 2: Backfill category for all existing rows based on trade name
-- Uses LOWER(TRIM()) so casing and whitespace don't matter
UPDATE interviews
SET category = CASE

  -- Polytechnic-Skilled Roles
  WHEN LOWER(TRIM(trade)) IN (
    'diploma mechanical engineer', 'mechanical engineer',
    'diploma civil engineer', 'civil engineer',
    'diploma electrical engineer', 'electrical engineer',
    'diploma electronics engineer', 'electronics engineer',
    'diploma computer science engineer', 'computer science engineer',
    'diploma automobile engineer', 'automobile engineer',
    'diploma mechatronics engineer', 'mechatronics engineer',
    'production supervisor',
    'quality control engineer', 'qc engineer',
    'cad designer', 'autocad technician',
    'network technician', 'embedded systems technician',
    'robotics technician', 'instrumentation technician', 'plant operator',
    'process technician', 'manufacturing technician', 'telecom technician',
    'biomedical equipment technician', 'surveyor', 'lab technician',
    'safety officer', 'junior site engineer', 'maintenance engineer',
    'service engineer', 'electrical design technician', 'tool and die maker',
    'water treatment technician', 'industrial automation technician'
  ) THEN 'Polytechnic-Skilled Roles'

  -- Blue-collar Trades
  WHEN LOWER(TRIM(trade)) IN (
    'electrician', 'plumber', 'welder', 'carpenter', 'mason', 'painter',
    'hvac technician', 'mechanic / automobile technician', 'mechanic',
    'automobile technician', 'fitter', 'turner',
    'machinist', 'cnc operator', 'lathe operator', 'sheet metal worker',
    'fabricator', 'construction worker', 'construction', 'civil site technician',
    'heavy equipment operator', 'crane operator', 'forklift operator',
    'truck driver', 'driver', 'delivery driver', 'railway technician',
    'solar panel installer', 'wind turbine technician',
    'fire safety technician', 'refrigeration technician', 'boiler operator',
    'mining technician', 'industrial maintenance technician'
  ) THEN 'Blue-collar Trades'

  -- Semi-Skilled Workforce
  WHEN LOWER(TRIM(trade)) IN (
    'data entry operator', 'office assistant', 'warehouse assistant',
    'store keeper', 'sales associate', 'retail executive',
    'customer support executive', 'bpo executive', 'delivery executive',
    'packing staff', 'machine helper', 'production line worker',
    'security guard', 'housekeeping staff', 'hospital ward assistant',
    'nursing assistant', 'caregiver', 'receptionist', 'field executive',
    'inventory assistant', 'helper technician', 'loading/unloading staff',
    'food delivery executive', 'kitchen assistant', 'driver assistant',
    'assembly line worker', 'courier staff', 'printing machine assistant',
    'office support staff', 'dispatch assistant'
  ) THEN 'Semi-Skilled Workforce'

  -- Keep if already correct
  WHEN category IN ('Blue-collar Trades', 'Polytechnic-Skilled Roles', 'Semi-Skilled Workforce')
    THEN category

  ELSE 'Unknown'
END
WHERE trade IS NOT NULL;

-- Step 3: Re-add the CHECK constraint
ALTER TABLE interviews
  ADD CONSTRAINT interviews_category_check
  CHECK (category IN (
    'Blue-collar Trades',
    'Polytechnic-Skilled Roles',
    'Semi-Skilled Workforce',
    'Unknown'
  ));

-- Step 4: Recreate the admin_interview_view
DROP VIEW IF EXISTS admin_interview_view;
CREATE VIEW admin_interview_view AS
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

GRANT SELECT ON admin_interview_view TO authenticated;

-- Step 5: Verify
SELECT trade, category, COUNT(*) as count
FROM interviews
GROUP BY trade, category
ORDER BY category, trade;
