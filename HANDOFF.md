# JUICED: handoff (updated Nov 2, 2026, evening)

A SQL investigation into baseball's steroid era, built as a GitHub and portfolio project.
The SQL pipeline, the website, both READMEs and the first git commit are done. Not yet pushed to GitHub or deployed.

## Where things are

```
~/juiced/
  data/lahman/            official SABR Lahman 2025 CSVs (1871-2025), downloaded from SABR's Box folder
  data/seed/
    ped_events_raw.psv    hand-curated PED table (106 rows): name|event_type|date|tier|substance|detail|source
    ped_events.csv        same, with Lahman playerIDs resolved (generated, don't hand-edit)
  scripts/
    resolve_ped_ids.py    names -> playerIDs (run: python3 -I scripts/resolve_ped_ids.py ~/juiced)
    build.py              builds juiced.duckdb, runs checks, runs analyses, exports JSON + publishes site/
  sql/
    00_schema.sql 01_load.sql 02_model.sql 03_checks.sql
    analysis/10..17_*.sql one file per "case", each creates out.* views
  exports/*.json          one file per out.* view
  site/data/              JSON copies + Parquet (people, batting, teams, ped_events) for the browser console
  site/sql/               copy of sql/ so the site can show and run the real queries
  .venv/                  python 3.11 venv with duckdb 2.0.0
```

Rebuild everything with `cd ~/juiced && .venv/bin/python scripts/build.py`. It took about 4 minutes on Nov 2 evening (most of it the permutation test; an earlier run took ~5s, cause unknown). It fails if a data-quality check fails. The same case 14 SQL runs in ~10s in the browser.

## Decisions made

- **Engine: DuckDB, not Postgres.** Homebrew postgresql@16 compiles from source on this macOS (it was building cmake), so I stopped it. The auto-mode safety check blocked running prebuilt Postgres binaries from the npm package `@embedded-postgres`. DuckDB uses Postgres-style SQL, and it opens the big feature: DuckDB-WASM runs the same SQL files live in the browser.
- **PED table tiers** (never inferred from stats):
  - `confirmed` means an official MLB suspension or the player's own public admission.
  - `named` means named in the Mitchell Report, BALCO, or the 2003 survey-test leaks, without a suspension or admission.
  - `stimulant` means an amphetamine/Adderall suspension only. These are excluded from the power analysis.
  - Sources were Wikipedia's suspension list and its Mitchell Report list. Some Mitchell names came from a summary, not verbatim text, and are worth spot-checking before publishing.
- **HR+** (player HR/PA ÷ league HR/PA × 100) is the yardstick everywhere, so changes to the ball, parks and expansion cancel out.
- Ambiguous names were resolved correctly: Braun the hitter, Tatis Jr. (tatisfe02), Hairston Jr., Matthews Jr., Matt Williams (willima04), and Dee Gordon, who is "Dee Strange-Gordon" in Lahman.

## The eight cases and what the data says

1. **Home run explosion** (`10_`). A brute-force change-point search over 18,424 splits finds breaks at **1994 and 2016**, not 2005. **2019 (3.63 HR per 100 PA) beats every steroid-era year** (the 2000 peak was 2.99).
2. **Ball or juice** (`11_`). Compares the shape of the HR distribution: median vs p99, plus a Gini coefficient.
   - In 1996-2001 the top end was the highest ever (p99 7.53).
   - In 2016-19 everyone rose (median 3.43) but the tail ratio was the lowest (2.12, Gini 0.307).
   - That fits "the ball lifts everyone, while something else stretched the top in the late 90s."
3. **Aging curves** (`12_`, delta method). From age 30 to 35, untested-era hitters lost only 22 HR+ points, against 33.5 before and 29.8 under testing. The direction matches FanGraphs/Zimmerman, so cite it with caveats.
4. **Who broke the model** (`13_`). A Marcel-style projection (5/4/3 weights, 1,200 PA regression, age factor) plus a binomial z-score. The top surprises are Kirby Puckett 1986, Bautista 2010, Davey Johnson 1973 and Brady Anderson 1996, mostly with no documented link. The calibration table is in `out.model_calibration`.
5. **The unmasking** (`14_`). This is the headline finding. A 10,000-draw permutation test in SQL:
   - **Surprise** top 50 (1993-2004): 6 documented vs 4.42 expected by chance. Lift 1.36, **p = 0.27**, not significant.
   - **Talent** top 50 (max HR+): 14 vs 4.42. Lift 3.17, **p = 0.0002**.
   - The documented list tracks *great sluggers*, not *sudden jumps*. A statistical outlier isn't evidence.
   - The shuffle uses `md5(player_id || ':' || it)` because `HASH(it, player_id)` gave a lumpy null distribution.
6. **The 73 question** (`15_`). Bonds 2001 has HR+ 377 vs Ruth 1927 at 900 and Maris 1961 at 351. Judge 2022 (313) beats all of Sosa's 60+ seasons. Cal Raleigh hit 60 in 2025.
7. **Late bloomers** (`16_`). Caminiti (an admitted user) is #1, but Hank Aaron and Willie Mays are in the top 10 too.
8. **Six degrees of Canseco** (`17_`). A recursive CTE breadth-first search over the teammate graph, using `USING KEY`. 99.7% of 1990s regulars are within 2 hops. Documented players were direct teammates 20.8% of the time vs 15.1% for everyone else; on n=48 that's noise.

## Site (built Nov 2)

- `site/index.html`, `style.css`, `app.js` (charts, unmask board, SQL panels), `console.js` (DuckDB-WASM 1.32.0, lazy-loaded on "Boot the database").
- Preview: `cd site && python3 -m http.server 8765`, open http://localhost:8765.
- Tested in headless Chrome (puppeteer-core) at 1280 light and 390 dark: no console errors, no horizontal overflow. In-browser console booted DuckDB v1.4.3 and ran all 8 case files; case 14's null distribution matched the Python build exactly.
- Copy is plain first person in Aaron's voice. All copy numbers were checked against exports/.
- Mitchell names (all 55) verified against Wikipedia's list Nov 2.
- `vercel.json` serves `site/` as a static output with no build step.

## Next steps

1. Aaron reviews the site locally and the copy.
2. **Ask Aaron before** creating the public GitHub repo (AaronMontano99/juiced?) and deploying to Vercel.
3. Optional: an OG image, and putting the GitHub link in the footer once the repo exists.

## Gotchas

- The shell is zsh: `set -- $var` doesn't word-split, so use `bash -c` for loops over pairs.
- `pip install pyarrow` tries to build from source and fails on this Mac. DuckDB writes Parquet natively, so pyarrow isn't needed.
- SABR Box direct download: `https://sabr.box.com/index.php?rm=box_download_shared_file&shared_name=y1prhc795jk8zvmelfd3jq7tl389y6cd&file_id=f_<id>`. The file ids are in the folder page's JSON.
- The 2020 season has no hitters with 300+ PA, so it drops out of `hr_distribution`. That's expected.
- The browser console's DuckDB version may differ slightly from DuckDB 2.0, so permutation p-values could shift a hair there.
