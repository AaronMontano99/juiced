-- JUICED · Case 5: The unmasking
-- Take the players with the most surprising seasons in 1993-2004 (before MLB testing had
-- penalties) and check them against the documented list. Then ask: could that overlap
-- happen by chance? A permutation test, written in SQL, answers it.
--
-- The trap: investigators and reporters focused on famous sluggers, so documented players
-- are better hitters on average. If we only checked the best-HR list we'd "find" PED links
-- that are just a talent effect. So we run the same test twice:
--   surprise  = top players by max z (beat THEIR OWN projection)   ← the signal we care about
--   talent    = top players by max HR+ (just hit a lot of homers)  ← the confound
-- If the surprise list shows more lift than the talent list, the anomaly is about change,
-- not just good hitters getting investigated.

CREATE OR REPLACE TABLE core.unmask_population AS
SELECT s.player_id,
       MAX(s.z)                                                   AS max_z,
       MAX(100.0 * s.hr / (s.pa * s.lg_hr_per_pa))               AS max_hr_plus,
       COALESCE(ANY_VALUE(pp.tier) IN ('confirmed', 'named'), FALSE) AS linked
FROM core.season_surprise s
LEFT JOIN core.ped_player pp USING (player_id)
WHERE s.year_id BETWEEN 1993 AND 2004
GROUP BY s.player_id;

-- Null distribution: 10,000 random "top 50s" drawn from the same population.
-- md5(player, iteration) instead of random() so the draws are reproducible run-to-run.
CREATE OR REPLACE TABLE core.unmask_null AS
SELECT it, SUM(linked::INT) AS hits
FROM (
    SELECT g.it, u.linked,
           ROW_NUMBER() OVER (PARTITION BY g.it ORDER BY md5(u.player_id || ':' || g.it)) AS rk
    FROM generate_series(1, 10000) g(it)
    CROSS JOIN core.unmask_population u
)
WHERE rk <= 50
GROUP BY it;

CREATE OR REPLACE VIEW out.unmasking_null AS
SELECT hits, COUNT(*) AS iterations FROM core.unmask_null GROUP BY hits ORDER BY hits;

CREATE OR REPLACE TABLE out.unmasking AS
WITH params AS (SELECT 50 AS top_n, 10000 AS iterations),
rankings AS (
    SELECT 'surprise' AS ranking, player_id, linked,
           ROW_NUMBER() OVER (ORDER BY max_z DESC) AS rk
    FROM core.unmask_population
    UNION ALL
    SELECT 'talent', player_id, linked,
           ROW_NUMBER() OVER (ORDER BY max_hr_plus DESC)
    FROM core.unmask_population
),
observed AS (
    SELECT ranking, SUM(linked::INT) AS hits
    FROM rankings, params
    WHERE rk <= top_n
    GROUP BY ranking
),
null_draws AS (SELECT * FROM core.unmask_null)
SELECT o.ranking,
       (SELECT COUNT(*) FROM core.unmask_population)                  AS population,
       (SELECT SUM(linked::INT) FROM core.unmask_population)          AS linked_in_population,
       p.top_n,
       o.hits                                                          AS linked_in_top,
       ROUND(AVG(n.hits), 2)                                           AS expected_by_chance,
       ROUND(o.hits / AVG(n.hits), 2)                                  AS lift,
       ROUND((SUM((n.hits >= o.hits)::INT) + 1.0) / (COUNT(*) + 1), 5) AS p_value,
       p.iterations
FROM observed o, null_draws n, params p
GROUP BY o.ranking, o.hits, p.top_n, p.iterations
ORDER BY o.ranking;

-- Who made the top 50 on surprise, for the reveal on the site
CREATE OR REPLACE VIEW out.unmasking_top AS
SELECT ROW_NUMBER() OVER (ORDER BY u.max_z DESC) AS rank,
       n.name, ROUND(u.max_z, 2) AS max_z, ROUND(u.max_hr_plus) AS max_hr_plus,
       COALESCE(pp.tier, 'none') AS ped_tier, pp.event_types
FROM core.unmask_population u
JOIN core.player_name n USING (player_id)
LEFT JOIN core.ped_player pp USING (player_id)
ORDER BY u.max_z DESC
LIMIT 50;
