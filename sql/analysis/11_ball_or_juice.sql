-- JUICED · Case 2: Was it the ball or the players?
-- A livelier ball (or smaller parks, or expansion pitching) lifts EVERYONE.
-- A drug that helps some hitters a lot stretches the TOP of the distribution.
-- So instead of the average, look at the shape: median vs. 99th percentile, and the Gini
-- coefficient of home runs among regulars. 2016-2019 is the control group: MLB's own
-- commissioned study attributed that surge largely to changes in the baseball.

CREATE OR REPLACE TABLE out.hr_distribution AS
WITH regulars AS (
    SELECT year_id, hr, pa, 100.0 * hr / pa AS rate
    FROM core.player_season
    WHERE pa >= 300 AND year_id >= 1960
),
ranked AS (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY year_id ORDER BY hr) AS i,
           COUNT(*)     OVER (PARTITION BY year_id)             AS n,
           SUM(hr)      OVER (PARTITION BY year_id)             AS total_hr
    FROM regulars
)
SELECT year_id,
       n                                                         AS regulars,
       ROUND(QUANTILE_CONT(rate, 0.50), 3)                       AS p50_rate,
       ROUND(QUANTILE_CONT(rate, 0.90), 3)                       AS p90_rate,
       ROUND(QUANTILE_CONT(rate, 0.99), 3)                       AS p99_rate,
       ROUND(MAX(rate), 3)                                       AS max_rate,
       ROUND(QUANTILE_CONT(rate, 0.99) / QUANTILE_CONT(rate, 0.50), 3) AS tail_ratio,
       -- Gini via the rank formula:  G = Σ (2i − n − 1)·xᵢ / (n · Σx)
       ROUND(SUM((2 * i - n - 1) * hr)::DOUBLE / (n * ANY_VALUE(total_hr)), 4) AS gini
FROM ranked
GROUP BY year_id, n
ORDER BY year_id;

CREATE OR REPLACE VIEW out.ball_or_juice AS
WITH windows(label, y0, y1, sort) AS (
    VALUES ('Before the surge (1985–1992)', 1985, 1992, 1),
           ('Steroid-era peak (1996–2001)', 1996, 2001, 2),
           ('Testing, dead-ball dip (2010–2014)', 2010, 2014, 3),
           ('Juiced-ball years (2016–2019)', 2016, 2019, 4)
)
SELECT w.label,
       ROUND(AVG(d.p50_rate), 2)   AS median_hr_per_100_pa,
       ROUND(AVG(d.p99_rate), 2)   AS p99_hr_per_100_pa,
       ROUND(AVG(d.tail_ratio), 2) AS tail_ratio,
       ROUND(AVG(d.gini), 3)       AS gini
FROM windows w
JOIN out.hr_distribution d ON d.year_id BETWEEN w.y0 AND w.y1
GROUP BY w.label, w.sort
ORDER BY w.sort;
