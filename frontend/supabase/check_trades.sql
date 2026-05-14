-- Check what trades and categories exist in your interviews table
SELECT trade, category, COUNT(*) as count
FROM interviews
GROUP BY trade, category
ORDER BY category, trade;
