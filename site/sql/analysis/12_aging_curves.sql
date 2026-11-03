-- JUICED · Case 3: Did hitters stop aging?
-- The delta method (standard in sabermetrics): pair every hitter's consecutive seasons,
-- measure the change in HR+, weight each pair by the harmonic mean of the two PA totals,
-- average by age, then chain the deltas into a curve. Done separately per era.
-- HR+ is league-relative, so league-wide changes (ball, parks) cancel out.

CREATE OR REPLACE TABLE out.aging_curves AS
WITH eras(era, y0, y1) AS (
    VALUES ('1970–1992 · before', 1970, 1992),
           ('1993–2004 · untested', 1993, 2004),
           ('2005–2025 · testing', 2005, 2025)
),
pairs AS (
    SELECT e.era,
           a.age AS from_age,
           b.hr_plus - a.hr_plus           AS delta,
           2.0 / (1.0 / a.pa + 1.0 / b.pa) AS w
    FROM core.player_season_rel a
    JOIN core.player_season_rel b
      ON b.player_id = a.player_id AND b.year_id = a.year_id + 1
    JOIN eras e ON b.year_id BETWEEN e.y0 AND e.y1
    WHERE a.pa >= 200 AND b.pa >= 200
      AND a.age BETWEEN 22 AND 38
),
by_age AS (
    SELECT era, from_age,
           SUM(delta * w) / SUM(w) AS avg_delta,
           COUNT(*)                AS pairs
    FROM pairs
    GROUP BY era, from_age
),
chained AS (
    SELECT era,
           from_age + 1 AS age,
           pairs,
           SUM(avg_delta) OVER (PARTITION BY era ORDER BY from_age) AS cum
    FROM by_age
    UNION ALL
    SELECT era, 22, NULL, 0.0 FROM eras            -- every curve starts at 0 at age 22
)
SELECT era, age, pairs,
       ROUND(cum - MAX(cum) OVER (PARTITION BY era), 1) AS hr_plus_vs_peak,
       ROUND(cum, 1)                                     AS hr_plus_vs_age22
FROM chained
ORDER BY era, age;

CREATE OR REPLACE VIEW out.aging_summary AS
SELECT era,
       ARG_MAX(age, hr_plus_vs_peak)                           AS peak_age,
       MAX(hr_plus_vs_peak) FILTER (WHERE age = 35)            AS at_35_vs_peak,
       ROUND(MAX(hr_plus_vs_age22) FILTER (WHERE age = 35)
           - MAX(hr_plus_vs_age22) FILTER (WHERE age = 30), 1) AS change_30_to_35
FROM out.aging_curves
GROUP BY era
ORDER BY era;
