-- Drop constraint first so updates aren't blocked
ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_category_check;

-- Fix "Diploma Mechanical Engineer" (NULL category)
UPDATE interviews
SET category = 'Polytechnic-Skilled Roles'
WHERE LOWER(TRIM(trade)) = 'diploma mechanical engineer';

-- Fix "mechanical engineer" (Unknown category)
UPDATE interviews
SET category = 'Polytechnic-Skilled Roles'
WHERE LOWER(TRIM(trade)) = 'mechanical engineer';

-- Re-add constraint
ALTER TABLE interviews
  ADD CONSTRAINT interviews_category_check
  CHECK (category IN (
    'Blue-collar Trades',
    'Polytechnic-Skilled Roles',
    'Semi-Skilled Workforce',
    'Unknown'
  ));

-- Verify — should show no Unknown or NULL now
SELECT trade, category, COUNT(*) as count
FROM interviews
GROUP BY trade, category
ORDER BY category, trade;
