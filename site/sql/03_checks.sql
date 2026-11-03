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

-- check: every timeline row has a quote and a Wikipedia source
SELECT 'policy_event_unsourced', event
FROM raw.policy_events WHERE length(quote) < 15 OR source NOT LIKE 'https://en.wikipedia.org/wiki/%';

-- check: food data is complete for both regions, all seven foods, every year 1961-2023
SELECT 'food_gap', e.ent || ' ' || d.fd || ' ' || g.y
FROM (SELECT DISTINCT entity AS ent FROM raw.food_supply) e
CROSS JOIN (SELECT DISTINCT food AS fd FROM raw.food_supply) d
CROSS JOIN generate_series(1961, 2023) g(y)
WHERE NOT EXISTS (SELECT 1 FROM raw.food_supply f WHERE f.entity = e.ent AND f.food = d.fd AND f.year = g.y)
UNION ALL
SELECT 'food_count', COUNT(DISTINCT food)::VARCHAR FROM raw.food_supply HAVING COUNT(DISTINCT food) <> 7;
