-- JUICED · Case 4: Who broke the model?
-- Build an expected-HR model in SQL, score every season since 1950 by how badly it beat
-- the model, and rank the results WITHOUT LOOKING AT NAMES. Case 5 unmasks them.
--
-- Projection (Marcel-style, the classic "dumbest reasonable forecast"):
--   1. Take the prior three seasons, weighted 5/4/3, in league-relative terms
--      (so a 1999 HR and a 1968 HR are compared to their own leagues).
--   2. Regress toward league average by adding 1,200 PA of an average hitter.
--   3. Age: +0.6% per year under 29, −0.3% per year over 29 (Marcel's standard factor,
--      chosen because it was NOT fit on steroid-era data).
--   4. Convert back to that season's league environment → expected HR rate p.
-- Surprise = z-score of actual HR vs. a binomial with that p:  (HR − p·PA) / √(PA·p·(1−p))

CREATE OR REPLACE TABLE core.season_projection AS
WITH base AS (
    SELECT player_id, year_id, pa, hr, age, teams, lg_hr_per_pa,
           hr / lg_hr_per_pa AS hr_rel          -- HR as multiples of a league-average hitter
    FROM core.player_season_rel
),
priors AS (
    SELECT t.player_id, t.year_id,
           SUM(w.weight * p.hr_rel) AS w_hr_rel,
           SUM(w.weight * p.pa)     AS w_pa,
           SUM(p.pa)                AS prior_pa,
           COUNT(*)                 AS prior_seasons
    FROM base t
    JOIN (VALUES (1, 5), (2, 4), (3, 3)) w(lag, weight) ON TRUE
    JOIN base p ON p.player_id = t.player_id AND p.year_id = t.year_id - w.lag
    GROUP BY t.player_id, t.year_id
)
SELECT b.player_id, b.year_id, b.age, b.pa, b.hr, b.teams,
       pr.prior_pa, pr.prior_seasons,
       (pr.w_hr_rel + 1200) / (pr.w_pa + 1200)                    AS proj_rel,   -- 1.0 = league average
       CASE WHEN b.age < 29 THEN 1 + 0.006 * (29 - b.age)
            ELSE 1 - 0.003 * (b.age - 29) END                       AS age_factor,
       b.lg_hr_per_pa,
       LAG(b.teams) OVER (PARTITION BY b.player_id ORDER BY b.year_id) AS prior_teams
FROM base b
JOIN priors pr USING (player_id, year_id);

CREATE OR REPLACE TABLE core.season_surprise AS
SELECT s.*,
       p_hr,
       p_hr * s.pa                                   AS expected_hr,
       s.hr - p_hr * s.pa                            AS hr_over_expected,
       (s.hr - p_hr * s.pa) / SQRT(s.pa * p_hr * (1 - p_hr)) AS z
FROM (
    SELECT *, proj_rel * age_factor * lg_hr_per_pa AS p_hr
    FROM core.season_projection
    WHERE pa >= 400 AND prior_pa >= 600 AND year_id >= 1950
) s;

-- Is the model honest? Bucket seasons by expected HR and compare to what actually happened.
-- A good model sits on the diagonal everywhere — including during the steroid era if it
-- were "just" a talent story. Where it doesn't, that's the anomaly.
CREATE OR REPLACE VIEW out.model_calibration AS
SELECT CASE WHEN year_id BETWEEN 1993 AND 2004 THEN '1993–2004' ELSE 'all other years' END AS window,
       FLOOR(expected_hr / 5) * 5       AS expected_bucket,
       COUNT(*)                         AS seasons,
       ROUND(AVG(expected_hr), 1)       AS avg_expected,
       ROUND(AVG(hr), 1)                AS avg_actual,
       ROUND(AVG(z), 2)                 AS avg_z
FROM core.season_surprise
GROUP BY 1, 2
HAVING COUNT(*) >= 25
ORDER BY 1, 2;

-- League-wide surprise by year: positive = the whole league out-homered its own projections.
CREATE OR REPLACE VIEW out.surprise_by_year AS
SELECT year_id,
       COUNT(*)                         AS seasons,
       ROUND(AVG(z), 3)                 AS avg_z,
       ROUND(AVG((z > 2.5)::INT) * 100, 2) AS pct_extreme
FROM core.season_surprise
GROUP BY year_id
ORDER BY year_id;

-- The blind board: top 100 seasons by surprise. Names are joined here so the site can reveal
-- them on click, but the ranking is computed from stats alone.
CREATE OR REPLACE TABLE out.model_outliers AS
SELECT ROW_NUMBER() OVER (ORDER BY s.z DESC, s.player_id, s.year_id) AS rank,
       n.name, s.player_id, s.year_id, s.age, s.teams,
       s.hr, ROUND(s.expected_hr, 1)          AS expected_hr,
       ROUND(s.z, 2)                          AS z,
       (s.prior_teams IS DISTINCT FROM s.teams) AS changed_teams,
       (s.teams LIKE '%COL%' AND COALESCE(s.prior_teams, '') NOT LIKE '%COL%') AS moved_to_coors,
       COALESCE(pp.tier, 'none')              AS ped_tier
FROM core.season_surprise s
JOIN core.player_name n USING (player_id)
LEFT JOIN core.ped_player pp USING (player_id)
ORDER BY s.z DESC, s.player_id, s.year_id   -- tie-breakers keep the order stable between builds
LIMIT 100;
