-- JUICED · 02_model.sql
-- Modeled layer. One row per player-season (stints collapsed), one row per league-season.

CREATE SCHEMA IF NOT EXISTS core;

-- Player-season: AL/NL only, 1901+. Traded players have several stints; we sum them
-- and keep the team list so we can flag "changed teams" later.
CREATE OR REPLACE TABLE core.player_season AS
WITH stints AS (
    SELECT *,
           COALESCE(ab,0) + COALESCE(bb,0) + COALESCE(hbp,0) + COALESCE(sh,0) + COALESCE(sf,0) AS pa
    FROM raw.batting
    WHERE lg_id IN ('AL', 'NL') AND year_id >= 1901
)
SELECT
    s.player_id,
    s.year_id,
    SUM(s.pa)  AS pa,
    SUM(s.ab)  AS ab,
    SUM(s.h)   AS h,
    SUM(s.hr)  AS hr,
    SUM(s.bb)  AS bb,
    SUM(s.so)  AS so,
    COUNT(*)   AS stints,
    STRING_AGG(s.team_id, '/' ORDER BY s.stint) AS teams,
    -- Baseball-Reference convention: season age = age on June 30.
    s.year_id - p.birth_year - CASE WHEN p.birth_month >= 7 THEN 1 ELSE 0 END AS age
FROM stints s
JOIN raw.people p USING (player_id)
GROUP BY s.player_id, s.year_id, p.birth_year, p.birth_month;

ALTER TABLE core.player_season ADD PRIMARY KEY (player_id, year_id);

-- League environment per season, both leagues combined (interleague play makes
-- the split less meaningful after 1997, and we want one yardstick per year).
CREATE OR REPLACE TABLE core.league_season AS
SELECT
    year_id,
    SUM(pa)                         AS pa,
    SUM(hr)                         AS hr,
    SUM(so)                         AS so,
    SUM(hr)::DOUBLE / SUM(pa)       AS hr_per_pa,
    SUM(so)::DOUBLE / SUM(pa)       AS so_per_pa,
    (SELECT SUM(g) / 2 FROM raw.teams t WHERE t.year_id = ps.year_id AND t.lg_id IN ('AL','NL')) AS games
FROM core.player_season ps
GROUP BY year_id;

-- The one number we use everywhere: HR+ = player HR/PA relative to that year's league.
-- 100 = league average, 300 = three times the league rate. It strips out the ball,
-- the parks, expansion and everything else that moved the whole league at once.
CREATE OR REPLACE VIEW core.player_season_rel AS
SELECT
    ps.*,
    ps.hr::DOUBLE / NULLIF(ps.pa, 0)                       AS hr_per_pa,
    100.0 * (ps.hr::DOUBLE / NULLIF(ps.pa, 0)) / l.hr_per_pa AS hr_plus,
    l.hr_per_pa                                             AS lg_hr_per_pa
FROM core.player_season ps
JOIN core.league_season l USING (year_id);

-- One row per player: their strongest documented link (confirmed beats named beats stimulant).
CREATE OR REPLACE VIEW core.ped_player AS
SELECT player_id,
       ARG_MIN(tier, CASE tier WHEN 'confirmed' THEN 1 WHEN 'named' THEN 2 ELSE 3 END) AS tier,
       MIN(event_date) AS first_event,
       STRING_AGG(DISTINCT event_type, ', ') AS event_types
FROM raw.ped_events
GROUP BY player_id;

CREATE OR REPLACE VIEW core.player_name AS
SELECT player_id, name_first || ' ' || name_last AS name FROM raw.people;
