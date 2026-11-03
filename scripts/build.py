"""Build juiced.duckdb from raw CSVs, run data-quality checks, run every analysis,
and export each analysis's out.* views to exports/*.json for the site.

    .venv/bin/python scripts/build.py
"""
import json, pathlib, shutil, sys, time
import duckdb

ROOT = pathlib.Path(__file__).resolve().parent.parent
DB = ROOT / "juiced.duckdb"


def statements(sql: str):
    # Split on semicolons at line ends; our SQL never puts ';' mid-line.
    buf = []
    for line in sql.splitlines():
        buf.append(line)
        if line.rstrip().endswith(";"):
            stmt = "\n".join(buf).strip()
            buf = []
            if any(l.strip() and not l.strip().startswith("--") for l in stmt.splitlines()):
                yield stmt


def main():
    DB.unlink(missing_ok=True)
    con = duckdb.connect(str(DB))
    import os; os.chdir(ROOT)
    t0 = time.time()
    for f in ["00_schema.sql", "01_load.sql", "02_model.sql"]:
        con.execute((ROOT / "sql" / f).read_text())
        print(f"  ran {f}")

    failures = 0
    for stmt in statements((ROOT / "sql" / "03_checks.sql").read_text()):
        rows = con.execute(stmt).fetchall()
        for r in rows:
            failures += 1
            print("  CHECK FAILED:", r)
    if failures:
        sys.exit(f"{failures} data-quality check(s) failed")
    print("  all data-quality checks passed")

    con.execute("CREATE SCHEMA IF NOT EXISTS out")
    for f in sorted((ROOT / "sql" / "analysis").glob("*.sql")):
        con.execute(f.read_text())
        print(f"  ran analysis/{f.name}")

    exp = ROOT / "exports"; exp.mkdir(exist_ok=True)
    views = con.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'out' ORDER BY 1"
    ).fetchall()
    for (v,) in views:
        cur = con.execute(f"SELECT * FROM out.{v}")
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        (exp / f"{v}.json").write_text(json.dumps(rows, default=str, separators=(",", ":")))
        print(f"  exported out.{v} ({len(rows)} rows)")
    publish_site(con)
    print(f"done in {time.time() - t0:.1f}s -> {DB.name}")


def publish_site(con):
    """Copy everything the static site needs into site/: result JSON, the SQL itself,
    and Parquet copies of the raw tables so the in-browser console can rebuild the model."""
    site = ROOT / "site"
    data = site / "data"; data.mkdir(parents=True, exist_ok=True)
    for f in (ROOT / "exports").glob("*.json"):
        shutil.copy(f, data / f.name)
    sqldir = site / "sql"
    shutil.rmtree(sqldir, ignore_errors=True)
    shutil.copytree(ROOT / "sql", sqldir)
    exports = {
        "people": "SELECT * FROM raw.people WHERE player_id IN (SELECT player_id FROM core.player_season)",
        "batting": "SELECT * FROM raw.batting WHERE lg_id IN ('AL','NL') AND year_id >= 1901",
        "teams": "SELECT * FROM raw.teams WHERE lg_id IN ('AL','NL') AND year_id >= 1901",
        "ped_events": "SELECT * FROM raw.ped_events",
    }
    for name, q in exports.items():
        con.execute(f"COPY ({q}) TO '{data / (name + '.parquet')}' (FORMAT parquet, COMPRESSION zstd)")
    print("  published site/data + site/sql")


if __name__ == "__main__":
    main()
