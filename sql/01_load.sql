-- JUICED · 01_load.sql   (run from repo root)
INSERT INTO raw.people
SELECT playerID, birthYear, birthMonth, birthDay, birthCountry, nameFirst, nameLast,
       bats, throws, TRY_CAST(weight AS INTEGER), TRY_CAST(height AS INTEGER),
       TRY_CAST(debut AS DATE), TRY_CAST(finalGame AS DATE), bbrefID
FROM read_csv('data/lahman/People.csv', header = true, all_varchar = false);

INSERT INTO raw.batting
SELECT playerID, yearID, stint, teamID, lgID, G, AB, R, H, "2B", "3B", HR, RBI,
       SB, CS, BB, SO, IBB, HBP, SH, SF, GIDP
FROM read_csv('data/lahman/Batting.csv', header = true);

INSERT INTO raw.teams
SELECT yearID, lgID, teamID, franchID, G, W, L, R, AB, H, HR, BB, SO, HRA,
       name, park, BPF, PPF
FROM read_csv('data/lahman/Teams.csv', header = true);

INSERT INTO raw.ped_events
SELECT player_id, name, event_type, CAST(event_date AS DATE), tier,
       NULLIF(substance, ''), detail, source
FROM read_csv('data/seed/ped_events.csv', header = true, all_varchar = true);

INSERT INTO raw.policy_events
SELECT CAST(event_date AS DATE), date_precision, kind, event, quote, source, NULLIF(note, '')
FROM read_csv('data/seed/policy_events.psv', delim = '|', header = true, all_varchar = true);

INSERT INTO raw.food_supply
SELECT entity, year, food, kg_per_capita
FROM read_csv('data/food/food_supply.csv', header = true);
