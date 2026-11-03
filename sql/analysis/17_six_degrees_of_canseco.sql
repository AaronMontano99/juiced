-- JUICED · Case 8: Six degrees of Canseco
-- José Canseco wrote that he introduced steroids to teammates in Oakland and Texas.
-- Build the teammate graph (two hitters are linked if they shared a roster with 100+ PA each)
-- and compute every hitter's "Canseco number" with a recursive CTE (breadth-first search).
-- Then ask whether documented players sat closer to Canseco than everyone else.
-- Proximity is NOT evidence. This is a test of a claim, not a list of suspects.

CREATE OR REPLACE TABLE core.teammate_edge AS
WITH rostered AS (
    SELECT DISTINCT b.player_id, b.year_id, b.team_id
    FROM raw.batting b
    JOIN core.player_season ps USING (player_id, year_id)
    WHERE b.year_id BETWEEN 1980 AND 2010
      AND ps.pa >= 100
)
SELECT DISTINCT a.player_id AS src, b.player_id AS dst
FROM rostered a
JOIN rostered b
  ON a.team_id = b.team_id AND a.year_id = b.year_id AND a.player_id <> b.player_id;

-- Breadth-first search. USING KEY keeps one row per player (the shortest distance found),
-- so the recursion explores the frontier instead of enumerating every path.
CREATE OR REPLACE TABLE core.canseco_number AS
WITH RECURSIVE bfs(player_id, hops) USING KEY (player_id) AS (
    SELECT 'cansejo01', 0
    UNION
    SELECT e.dst, MIN(f.hops) + 1
    FROM bfs f
    JOIN core.teammate_edge e ON e.src = f.player_id
    LEFT JOIN recurring.bfs seen ON seen.player_id = e.dst
    WHERE seen.player_id IS NULL AND f.hops < 4
    GROUP BY e.dst
)
SELECT * FROM bfs;

CREATE OR REPLACE VIEW out.canseco_degrees AS
WITH pop AS (               -- everyone who played 1993-2004 with real playing time
    SELECT DISTINCT player_id
    FROM core.player_season
    WHERE year_id BETWEEN 1993 AND 2004 AND pa >= 300
)
SELECT CASE WHEN pp.tier IN ('confirmed','named') THEN 'documented' ELSE 'not documented' END AS grp,
       COUNT(*)                                               AS players,
       ROUND(100 * AVG((c.hops = 1)::INT), 1)                 AS pct_direct_teammates,
       ROUND(100 * AVG((c.hops = 2)::INT), 1)                 AS pct_two_hops,
       ROUND(100 * AVG((c.hops >= 3 OR c.hops IS NULL)::INT), 1) AS pct_three_plus,
       ROUND(AVG(c.hops), 2)                                  AS avg_hops
FROM pop p
LEFT JOIN core.canseco_number c USING (player_id)
LEFT JOIN core.ped_player pp USING (player_id)
WHERE p.player_id <> 'cansejo01'
GROUP BY 1
ORDER BY 1;

-- Canseco's direct teammates who appear in the documented table
CREATE OR REPLACE VIEW out.canseco_teammates_documented AS
SELECT n.name, pp.tier, pp.event_types,
       (SELECT STRING_AGG(DISTINCT b1.team_id || ' ' || b1.year_id, ', ' ORDER BY b1.team_id || ' ' || b1.year_id)
          FROM raw.batting b1
          JOIN raw.batting b2 ON b2.team_id = b1.team_id AND b2.year_id = b1.year_id
         WHERE b1.player_id = c.player_id AND b2.player_id = 'cansejo01') AS shared_rosters
FROM core.canseco_number c
JOIN core.ped_player pp USING (player_id)
JOIN core.player_name n USING (player_id)
WHERE c.hops = 1 AND pp.tier IN ('confirmed','named')
ORDER BY n.name;
