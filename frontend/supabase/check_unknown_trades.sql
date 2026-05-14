-- Show all trades that are Unknown or NULL category
SELECT trade, category, COUNT(*) as count
FROM interviews
WHERE category = 'Unknown' OR category IS NULL
GROUP BY trade, category
ORDER BY count DESC;
