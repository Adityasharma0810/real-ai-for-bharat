-- Fix the one Electrician record with NULL category
UPDATE interviews
SET category = 'Blue-collar Trades'
WHERE id = '7f203b07-f1d2-454c-85c0-acacb86a3316';

-- Also fix any other NULLs that slipped through for known blue-collar trades
UPDATE interviews
SET category = 'Blue-collar Trades'
WHERE category IS NULL
  AND LOWER(TRIM(trade)) IN (
    'electrician', 'plumber', 'welder', 'carpenter', 'mason', 'painter',
    'hvac technician', 'mechanic / automobile technician', 'mechanic',
    'fitter', 'turner', 'machinist', 'cnc operator', 'lathe operator',
    'sheet metal worker', 'fabricator', 'construction worker', 'construction',
    'civil site technician', 'heavy equipment operator', 'crane operator',
    'forklift operator', 'truck driver', 'driver', 'delivery driver',
    'railway technician', 'solar panel installer', 'wind turbine technician',
    'fire safety technician', 'refrigeration technician', 'boiler operator',
    'mining technician', 'industrial maintenance technician'
  );

UPDATE interviews
SET category = 'Polytechnic-Skilled Roles'
WHERE category IS NULL
  AND LOWER(TRIM(trade)) IN (
    'diploma mechanical engineer', 'mechanical engineer',
    'diploma civil engineer', 'diploma electrical engineer',
    'diploma electronics engineer', 'diploma computer science engineer',
    'diploma automobile engineer', 'diploma mechatronics engineer',
    'production supervisor', 'quality control engineer', 'cad designer',
    'autocad technician', 'network technician', 'embedded systems technician',
    'robotics technician', 'instrumentation technician', 'plant operator',
    'process technician', 'manufacturing technician', 'telecom technician',
    'biomedical equipment technician', 'surveyor', 'lab technician',
    'safety officer', 'junior site engineer', 'maintenance engineer',
    'service engineer', 'electrical design technician', 'tool and die maker',
    'water treatment technician', 'industrial automation technician'
  );

UPDATE interviews
SET category = 'Semi-Skilled Workforce'
WHERE category IS NULL
  AND LOWER(TRIM(trade)) IN (
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
  );

-- Verify — should be empty
SELECT id, trade, category FROM interviews
WHERE category IS NULL OR category = 'Unknown';
