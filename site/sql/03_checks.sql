-- JUICED · 03_checks.sql
-- Data-quality assertions. Each query returns rows ONLY when something is wrong.
-- scripts/build.py fails the build if any check returns a row.

-- check: every PED seed row resolves to a real player who batted in AL/NL
SELECT 'ped_player_never_batted' AS check_name, e.name AS detail
FROM raw.ped_events e
LEFT JOIN core.player_season ps USING (player_id)
WHERE ps.player_id IS NULL;

-- check: stint totals survive the collapse (no rows lost or double-counted)
SELECT 'hr_total_mismatch', (SELECT SUM(hr) FROM raw.batting WHERE lg_id IN ('AL','NL') AND year_id >= 1901)::VARCHAR
WHERE (SELECT SUM(hr) FROM raw.batting WHERE lg_id IN ('AL','NL') AND year_id >= 1901)
   <> (SELECT SUM(hr) FROM core.player_season);

-- check: known anchors (if these fail, the load is wrong)
SELECT 'anchor_bonds_2001', hr::VARCHAR FROM core.player_season WHERE player_id = 'bondsba01' AND year_id = 2001 AND hr <> 73
UNION ALL
SELECT 'anchor_maris_1961', hr::VARCHAR FROM core.player_season WHERE player_id = 'marisro01' AND year_id = 1961 AND hr <> 61
UNION ALL
SELECT 'anchor_judge_2022', hr::VARCHAR FROM core.player_season WHERE player_id = 'judgeaa01' AND year_id = 2022 AND hr <> 62;

-- check: every season 1901-2025 present, with sane HR rates
SELECT 'missing_or_weird_season', y::VARCHAR
FROM generate_series(1901, 2025) g(y)
LEFT JOIN core.league_season l ON l.year_id = y
WHERE l.year_id IS NULL OR l.hr_per_pa NOT BETWEEN 0.001 AND 0.05;

-- check: ages are plausible for anyone with real playing time
SELECT 'implausible_age', player_id || ' ' || year_id
FROM core.player_season WHERE pa >= 100 AND (age < 15 OR age > 50);
