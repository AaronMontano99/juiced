# The PED table

`ped_events_raw.psv` is hand-built. It is the only file in this repo that isn't straight from Lahman. `ped_events.csv` is generated from it by `scripts/resolve_ped_ids.py`, which adds Lahman player IDs. Don't hand-edit the CSV.

## Columns

`name | event_type | event_date | tier | substance | detail | source`

One row per event, so a player can have several (Canseco has an admission and a Mitchell mention). `core.ped_player` collapses them to one row per player, keeping the strongest tier.

## Tiers

Tiers come from what was officially done or said. **Never from the stats.** Using stats to pick who's on the list would make every analysis circular.

| Tier | Rule | Rows |
|------|------|------|
| `confirmed` | Official MLB PED suspension, or the player's own public admission | 45 |
| `named` | Named in the Mitchell Report, the BALCO investigation, or the leaked 2003 survey-test results, with no suspension or admission | 55 |
| `stimulant` | Amphetamine or Adderall suspension only. Kept for completeness and left out of every power analysis | 6 |

## Event types

`suspension` (44), `mitchell` (46), `admission` (7), `investigation` (7, BALCO), `reported` (2, the 2003 survey leaks).

## Sources

- Wikipedia, [List of MLB players suspended for performance-enhancing drugs](https://en.wikipedia.org/wiki/List_of_Major_League_Baseball_players_suspended_for_performance-enhancing_drugs)
- Wikipedia, [List of MLB players named in the Mitchell Report](https://en.wikipedia.org/wiki/List_of_Major_League_Baseball_players_named_in_the_Mitchell_Report)
- MLB announcements, the Mitchell Report (2007), and the player's own statements for admissions, as noted per row

All 55 Mitchell position-player names were checked against the Wikipedia list on Nov 2, 2026. Pitchers named in the report aren't included because this is a hitting study.

## Name matching

`resolve_ped_ids.py` matches names to Lahman's `People` table. The ambiguous ones were resolved by hand: Ryan Braun the hitter, Fernando Tatis Jr. (`tatisfe02`), Jerry Hairston Jr., Gary Matthews Jr., Matt Williams (`willima04`), and Dee Gordon, who is "Dee Strange-Gordon" in Lahman.

## Known gaps

This is who got caught or named. It is not who used. Absence from this table means nothing about a player.
