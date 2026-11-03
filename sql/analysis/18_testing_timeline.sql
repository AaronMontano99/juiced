-- JUICED · Case 9: The testing timeline
-- MLB went from "steroids are banned, nobody checks" (1991) to blood tests for HGH (2012).
-- Two questions: how much of the league's power came from players later linked to PEDs, year by year?
-- And did the league-wide home run rate actually drop after each policy milestone?

-- The juice index: share of all home runs hit by players with a confirmed or named link.
-- A player counts for his whole career, not just the years he used, because nobody knows those
-- years. So read it as "how much of the power came from guys who were later caught or named."
CREATE OR REPLACE VIEW out.juice_index AS
WITH tagged AS (
    SELECT ps.year_id, ps.hr, pp.tier
    FROM core.player_season ps
    LEFT JOIN core.ped_player pp USING (player_id)
)
SELECT t.year_id,
       ROUND(100.0 * SUM(t.hr) FILTER (WHERE t.tier IN ('confirmed', 'named')) / SUM(t.hr), 2) AS juice_share,
       SUM(t.hr) FILTER (WHERE t.tier IN ('confirmed', 'named'))                              AS linked_hr,
       SUM(t.hr)                                                                              AS league_hr,
       ROUND(100 * l.hr_per_pa, 3)                                                            AS hr_per_100_pa
FROM tagged t
JOIN core.league_season l USING (year_id)
WHERE t.year_id BETWEEN 1985 AND 2025
GROUP BY t.year_id, l.hr_per_pa
ORDER BY t.year_id;

-- Before and after each milestone: league HR rate and juice share in the three seasons before
-- the event's season vs the three seasons after it (the event's own season is left out).
CREATE OR REPLACE VIEW out.policy_timeline AS
WITH ev AS (
    SELECT *, EXTRACT(year FROM event_date)::INTEGER AS yr,
           ROW_NUMBER() OVER (ORDER BY event_date) AS n
    FROM raw.policy_events
),
yearly AS (
    SELECT year_id, 100 * hr_per_pa AS hr100 FROM core.league_season
)
SELECT ev.n, ev.event_date, ev.yr AS year_id, ev.date_precision, ev.kind, ev.event, ev.quote, ev.source, ev.note,
       ROUND(AVG(y.hr100) FILTER (WHERE y.year_id BETWEEN ev.yr - 3 AND ev.yr - 1), 2) AS hr100_before,
       ROUND(AVG(y.hr100) FILTER (WHERE y.year_id BETWEEN ev.yr + 1 AND ev.yr + 3), 2) AS hr100_after,
       ROUND(AVG(j.juice_share) FILTER (WHERE j.year_id BETWEEN ev.yr - 3 AND ev.yr - 1), 1) AS juice_before,
       ROUND(AVG(j.juice_share) FILTER (WHERE j.year_id BETWEEN ev.yr + 1 AND ev.yr + 3), 1) AS juice_after,
       COUNT(*) FILTER (WHERE y.year_id BETWEEN ev.yr + 1 AND ev.yr + 3)                  AS seasons_after
FROM ev
JOIN yearly y ON y.year_id BETWEEN ev.yr - 3 AND ev.yr + 3
LEFT JOIN out.juice_index j ON j.year_id = y.year_id
GROUP BY ALL
ORDER BY ev.event_date;
