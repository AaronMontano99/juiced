-- JUICED · Case 10 (bonus): Got milk?
-- Does America drink more milk when baseball is more juiced? Obviously not. But the raw numbers
-- say yes, and that's the point: two things that both trend over time will "correlate" whether or
-- not they have anything to do with each other. Then we do it properly and watch it fall apart.
--
-- Food data: kg per person per year available for consumption (FAO Food Balances, via Our World
-- in Data). Free sales data doesn't exist; food supply is the closest verified stand-in.
-- Window: 1985 (when the juice index starts) to 2023 (the last FAO year). n = 39 seasons.

-- One row per region, food and year, with the juice index beside it (feeds the charts).
CREATE OR REPLACE VIEW out.food_juice AS
SELECT f.entity, f.food, f.year AS year_id, ROUND(f.kg_per_capita, 2) AS kg, j.juice_share
FROM raw.food_supply f
JOIN out.juice_index j ON j.year_id = f.year
WHERE f.year BETWEEN 1985 AND 2023
ORDER BY f.entity, f.food, f.year;

-- The leaderboard. r_levels is the naive correlation everyone screenshots.
-- r_changes correlates year-over-year CHANGES instead (first differences), which strips out the
-- shared trend. If the link were real, it would survive. It doesn't.
CREATE OR REPLACE VIEW out.food_correlation AS
WITH d AS (
    SELECT entity, food, year_id, kg, juice_share,
           kg - LAG(kg) OVER w                   AS d_kg,
           juice_share - LAG(juice_share) OVER w AS d_juice
    FROM out.food_juice
    WINDOW w AS (PARTITION BY entity, food ORDER BY year_id)
)
SELECT entity, food,
       ROUND(CORR(kg, juice_share), 3)        AS r_levels,
       ROUND(CORR(d_kg, d_juice), 3)          AS r_changes,
       -- FAO changed its food-balance method in 2010 (Our World in Data joins the old and new series
       -- that year), so US milk drops 30 kg overnight. This is the correlation using old-method years only.
       ROUND(CORR(kg, juice_share) FILTER (WHERE year_id <= 2009), 3) AS r_levels_pre2010,
       ROUND(REGR_R2(kg, juice_share), 3)     AS r2_levels,
       ROUND(REGR_SLOPE(kg, juice_share), 3)  AS kg_per_juice_point,   -- "each extra point of juice = this many kg"
       ROUND(MIN(kg), 1) AS kg_min, ROUND(MAX(kg), 1) AS kg_max,
       COUNT(*) AS seasons,
       RANK() OVER (PARTITION BY entity ORDER BY ABS(CORR(kg, juice_share)) DESC) AS rank_naive
FROM d
GROUP BY entity, food
ORDER BY entity, rank_naive;

-- Did the milk cause the juice, or the juice cause the milk? Slide US milk k years ahead of or
-- behind the juice index and re-correlate. A real cause should peak at one sensible lag.
-- A trend artifact just smears across all of them.
CREATE OR REPLACE VIEW out.milk_lag AS
SELECT k AS lag_years,
       ROUND(CORR(f.kg_per_capita, j.juice_share), 3) AS r,
       COUNT(*) AS seasons
FROM generate_series(-5, 5) g(k)
JOIN out.juice_index j ON TRUE
JOIN raw.food_supply f
  ON f.entity = 'United States' AND f.food = 'milk' AND f.year = j.year_id + k
WHERE j.year_id BETWEEN 1985 AND 2023
GROUP BY k
ORDER BY k;
