# JUICED

A SQL investigation of baseball's steroid era. I took every MLB batting line since 1901 and a sourced list of every player tied to steroids, and tried to answer one question: can you actually see the juice in the numbers?

Kind of. Just not where everybody looks.

The site has a chart and the real SQL for each case, plus a live DuckDB console that runs the same files in your browser.

## What the data says

| # | Case | Finding |
|---|------|---------|
| 01 | The home run explosion | A brute-force change-point search (18,424 splits) finds breaks at **1994 and 2016**, not 2005 when testing started. **2019 had 3.63 HR per 100 PA**, more than any steroid-era year (2000 peak: 2.99). |
| 02 | Ball or juice | In 1996–2001 the top 1% hit at the highest rate ever (7.53 per 100 PA). In 2016–19 the median jumped to 3.43 but the top-to-middle gap was the smallest ever (tail ratio 2.12, Gini 0.307). A ball lifts everybody. Something else stretched the top in the late 90s. |
| 03 | Aging curves | From 30 to 35, untested-era hitters lost 22 points of HR+, vs 33.5 before and 29.8 under testing. The peak didn't change. The decline did. |
| 04 | Who broke the model | A Marcel-style projection's biggest misses ever (Puckett '86, Bautista '10, Davey Johnson '73, Brady Anderson '96) mostly have no documented link. |
| 05 | The unmasking | The 50 biggest surprise hitters of 1993–2004 hold 6 documented players vs 4.42 by chance. 10,000-shuffle permutation test, in SQL: **p = 0.27**. Rank by peak power instead and it's 14, p = 0.0002. The list tracks great sluggers, not sudden jumps. |
| 06 | The 73 question | Against his league, Ruth 1920 has an HR+ of 1,318. Bonds 2001 is 377, Maris 1961 is 351. Judge 2022 (313) beats every Sosa 60-homer season. |
| 07 | Late bloomers | Caminiti (admitted) is #1 for power gained after 33, but Hank Aaron and Willie Mays are top 10 too. |
| 08 | Six degrees of Canseco | Recursive-CTE BFS over the teammate graph: 99.7% of 1990s regulars are within 2 hops. Documented players were direct teammates 20.8% vs 15.1%. On n=48, that's noise. |

**HR+** is the yardstick everywhere: a player's HR per PA divided by the league's that season, × 100. It cancels out the ball, parks and expansion.

## Run it

Needs Python 3.11+.

```sh
python3 -m venv .venv
.venv/bin/pip install duckdb
.venv/bin/python scripts/build.py      # builds juiced.duckdb, runs checks + all 8 analyses, publishes site/
cd site && python3 -m http.server 8000 # open http://localhost:8000
```

The build fails if any data-quality check in `sql/03_checks.sql` returns rows. Case 05's permutation test is the slow part.

## Layout

```
data/lahman/        SABR Lahman 2025 CSVs (People, Batting, Teams)
data/seed/          the hand-built PED table (see data/seed/README.md)
sql/00_schema.sql   raw tables, typed, with keys
sql/01_load.sql     CSV → raw
sql/02_model.sql    core.player_season, core.league_season, HR+
sql/03_checks.sql   data-quality checks (each returns rows only on failure)
sql/analysis/       one file per case, each creates out.* views
scripts/build.py    runs it all, exports out.* to JSON, copies SQL + Parquet into site/
site/               static site: vanilla JS, hand-rolled SVG, DuckDB-WASM console
```

## The PED table

Hand-built and sourced, **never inferred from stats**. Three tiers:

- `confirmed`: an official MLB PED suspension, or the player's own public admission
- `named`: named in the Mitchell Report, BALCO, or the 2003 survey-test leaks, with no suspension or admission
- `stimulant`: amphetamine or Adderall suspension only, left out of the power analysis

Every row keeps its source. Details in [data/seed/README.md](data/seed/README.md).

## Limits

- The list is who got caught or named, not who used. Mitchell leaned on two sources tied to the Mets and Yankees clubhouses.
- Aging curves use the delta method, which carries survivor bias.
- Lahman has no park factor for home runs, so Coors Field moves are flagged, not adjusted.
- The projection is deliberately simple. Its calibration table is in `out.model_calibration`.
- AL and NL only, 1901 through 2025.

## Sources

- [SABR Lahman Baseball Database](https://sabr.org/lahman-database/), 2025 release, CC BY-SA 3.0
- Wikipedia: [List of MLB players suspended for PEDs](https://en.wikipedia.org/wiki/List_of_Major_League_Baseball_players_suspended_for_performance-enhancing_drugs), [players named in the Mitchell Report](https://en.wikipedia.org/wiki/List_of_Major_League_Baseball_players_named_in_the_Mitchell_Report)
- FanGraphs aging-curve work (Jeff Zimmerman and others), for comparing case 03's direction

Built by Aaron Montano.
