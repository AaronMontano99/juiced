-- JUICED · Case 7: The late bloomers
-- Hitters normally peak in their late 20s. Who hit for MORE power in their mid-30s than in
-- their prime, and by how much? Compares PA-weighted HR+ at ages 26-30 vs. 33-37
-- (at least 1,200 PA in each window).

CREATE OR REPLACE VIEW out.late_bloomers AS
WITH windows AS (
    SELECT player_id,
           SUM(hr) FILTER (WHERE age BETWEEN 26 AND 30) AS hr_prime,
           SUM(pa) FILTER (WHERE age BETWEEN 26 AND 30) AS pa_prime,
           SUM(hr / lg_hr_per_pa) FILTER (WHERE age BETWEEN 26 AND 30) AS rel_prime,
           SUM(hr) FILTER (WHERE age BETWEEN 33 AND 37) AS hr_late,
           SUM(pa) FILTER (WHERE age BETWEEN 33 AND 37) AS pa_late,
           SUM(hr / lg_hr_per_pa) FILTER (WHERE age BETWEEN 33 AND 37) AS rel_late,
           MIN(year_id) FILTER (WHERE age = 33) AS year_at_33
    FROM core.player_season_rel
    WHERE year_id >= 1947
    GROUP BY player_id
)
SELECT ROW_NUMBER() OVER (ORDER BY rel_late / pa_late - rel_prime / pa_prime DESC) AS rank,
       n.name,
       w.year_at_33,
       w.hr_prime, ROUND(100 * w.rel_prime / w.pa_prime) AS hr_plus_26_30,
       w.hr_late,  ROUND(100 * w.rel_late  / w.pa_late)  AS hr_plus_33_37,
       ROUND(100 * (w.rel_late / w.pa_late - w.rel_prime / w.pa_prime)) AS change,
       COALESCE(pp.tier, 'none') AS ped_tier
FROM windows w
JOIN core.player_name n USING (player_id)
LEFT JOIN core.ped_player pp USING (player_id)
WHERE w.pa_prime >= 1200 AND w.pa_late >= 1200
ORDER BY rank
LIMIT 25;

-- How common is a late-career power gain, by the year a player turned 33?
CREATE OR REPLACE VIEW out.late_bloomers_by_era AS
WITH w AS (
    SELECT player_id,
           MIN(year_id) FILTER (WHERE age = 33) AS y33,
           SUM(hr / lg_hr_per_pa) FILTER (WHERE age BETWEEN 26 AND 30) / SUM(pa) FILTER (WHERE age BETWEEN 26 AND 30) AS prime,
           SUM(hr / lg_hr_per_pa) FILTER (WHERE age BETWEEN 33 AND 37) / SUM(pa) FILTER (WHERE age BETWEEN 33 AND 37) AS late,
           SUM(pa) FILTER (WHERE age BETWEEN 26 AND 30) AS pa_prime,
           SUM(pa) FILTER (WHERE age BETWEEN 33 AND 37) AS pa_late
    FROM core.player_season_rel
    GROUP BY player_id
)
SELECT (FLOOR(y33 / 5) * 5)::INT                 AS turned_33_in,
       COUNT(*)                                   AS players,
       ROUND(100 * AVG((late > prime)::INT), 1)   AS pct_gained_power,
       ROUND(100 * MEDIAN(late / prime), 1)       AS median_late_vs_prime_pct
FROM w
WHERE pa_prime >= 1200 AND pa_late >= 1200 AND y33 BETWEEN 1950 AND 2019
GROUP BY 1
ORDER BY 1;
