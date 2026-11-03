-- JUICED · Case 1: The Home Run Explosion
-- How did the league-wide home run rate move, and where does the data itself say the eras begin and end?

CREATE OR REPLACE VIEW out.league_trend AS
SELECT year_id,
       ROUND(100 * hr_per_pa, 3) AS hr_per_100_pa,
       ROUND(hr / games, 3)      AS hr_per_game,
       ROUND(100 * so_per_pa, 2) AS so_pct
FROM core.league_season
ORDER BY year_id;

-- Change-point detection in pure SQL.
-- Fit the 1960-2025 HR rate as four flat segments and search EVERY possible set of three
-- break years, keeping the split with the lowest total squared error. Prefix sums make each
-- segment's error O(1):   SSE(i..j] = Σy² - (Σy)² / n
-- Nobody tells the query where "the steroid era" is. It has to find it.
CREATE OR REPLACE TABLE out.change_points AS
WITH series AS (
    SELECT year_id,
           100 * hr_per_pa AS y
    FROM core.league_season
    WHERE year_id BETWEEN 1960 AND 2025
),
prefix AS (
    SELECT 0 AS n, 1959 AS year_id, 0.0::DOUBLE AS sy, 0.0::DOUBLE AS syy
    UNION ALL
    SELECT ROW_NUMBER() OVER w, year_id, SUM(y) OVER w, SUM(y * y) OVER w
    FROM series
    WINDOW w AS (ORDER BY year_id)
),
segment AS (                       -- every candidate segment of at least 5 seasons
    SELECT a.n AS i, b.n AS j,
           a.year_id + 1 AS start_year,
           b.year_id     AS end_year,
           (b.sy - a.sy) / (b.n - a.n)                          AS mean_rate,
           (b.syy - a.syy) - POWER(b.sy - a.sy, 2) / (b.n - a.n) AS sse
    FROM prefix a
    JOIN prefix b ON b.n - a.n >= 5
),
fits AS (                          -- chain four segments end-to-end across the whole series
    SELECT s1.sse + s2.sse + s3.sse + s4.sse AS total_sse,
           [s1.start_year, s2.start_year, s3.start_year, s4.start_year] AS starts,
           [s1.end_year,   s2.end_year,   s3.end_year,   s4.end_year]   AS ends,
           [s1.mean_rate,  s2.mean_rate,  s3.mean_rate,  s4.mean_rate]  AS means
    FROM segment s1
    JOIN segment s2 ON s2.i = s1.j
    JOIN segment s3 ON s3.i = s2.j
    JOIN segment s4 ON s4.i = s3.j
    WHERE s1.i = 0
      AND s4.j = (SELECT MAX(n) FROM prefix)
),
best AS (
    SELECT * FROM fits ORDER BY total_sse LIMIT 1
)
SELECT UNNEST(RANGE(1, 5))   AS segment,
       UNNEST(starts)        AS start_year,
       UNNEST(ends)          AS end_year,
       ROUND(UNNEST(means), 3) AS mean_hr_per_100_pa,
       (SELECT COUNT(*) FROM fits) AS splits_tested,
       ROUND(total_sse, 3)   AS total_sse
FROM best;
