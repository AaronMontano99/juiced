-- JUICED · Case 6: The 73 question
-- Raw home run totals vs. league-adjusted HR+. How big were the steroid-era records
-- once you account for how many homers everyone else was hitting?

CREATE OR REPLACE VIEW out.big_seasons AS
SELECT n.name, r.year_id, r.hr, r.pa,
       ROUND(r.hr_plus)                          AS hr_plus,
       ROUND(100 * r.lg_hr_per_pa, 2)            AS league_hr_per_100_pa,
       RANK() OVER (ORDER BY r.hr DESC)          AS rank_raw,
       COALESCE(pp.tier, 'none')                 AS ped_tier
FROM core.player_season_rel r
JOIN core.player_name n USING (player_id)
LEFT JOIN core.ped_player pp USING (player_id)
WHERE r.hr >= 54
ORDER BY r.hr DESC, r.year_id;

-- The all-time leaderboard by HR+ (450+ PA). Spoiler: the 1920s win.
CREATE OR REPLACE VIEW out.hr_plus_leaders AS
SELECT RANK() OVER (ORDER BY r.hr_plus DESC) AS rank,
       n.name, r.year_id, r.hr, ROUND(r.hr_plus) AS hr_plus,
       COALESCE(pp.tier, 'none') AS ped_tier
FROM core.player_season_rel r
JOIN core.player_name n USING (player_id)
LEFT JOIN core.ped_player pp USING (player_id)
WHERE r.pa >= 450
QUALIFY rank <= 25
ORDER BY rank;

-- Same board, integrated era only (1947+), so the comparison is like-for-like.
CREATE OR REPLACE VIEW out.hr_plus_leaders_modern AS
SELECT RANK() OVER (ORDER BY r.hr_plus DESC) AS rank,
       n.name, r.year_id, r.hr, ROUND(r.hr_plus) AS hr_plus,
       COALESCE(pp.tier, 'none') AS ped_tier
FROM core.player_season_rel r
JOIN core.player_name n USING (player_id)
LEFT JOIN core.ped_player pp USING (player_id)
WHERE r.pa >= 450 AND r.year_id >= 1947
QUALIFY rank <= 25
ORDER BY rank;
