"""Download per-capita food supply (FAO Food Balances, republished by Our World in Data)
and write one tidy CSV: data/food/food_supply.csv  (entity, year, food, kg_per_capita).

    python3 -I scripts/fetch_food.py

Source: FAO Food Balances (FBS 2010+, FBSH 1961-2013) via Our World in Data, CC BY 4.0.
"Food supply" is food available for consumption per person per year (kg), which is the
closest free, verified stand-in for sales. Only World and United States rows are kept.
"""
import csv, io, pathlib, sys, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "food" / "food_supply.csv"
BASE = "https://ourworldindata.org/grapher/{}.csv?v=1&csvType=full&useColumnShortNames=true"
KEEP = {"World", "United States"}

# chart slug -> {column prefix: food name}
CHARTS = {
    "per-capita-milk-consumption": {"milk__": "milk"},
    "per-capita-meat-type": {"meat__poultry": "chicken", "meat__beef": "beef", "meat__pig": "pork",
                             "meat__sheep": "lamb", "fish_and_seafood": "fish"},
    "per-capita-egg-consumption-kilograms-per-year": {"eggs__": "eggs"},
}


def main():
    rows = []
    for slug, cols in CHARTS.items():
        req = urllib.request.Request(BASE.format(slug), headers={"User-Agent": "juiced-sql-project"})
        text = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
        reader = csv.DictReader(io.StringIO(text))
        picks = {}
        for prefix, food in cols.items():
            match = [c for c in reader.fieldnames if c.startswith(prefix)]
            if len(match) != 1:
                sys.exit(f"{slug}: expected one column starting {prefix!r}, found {match}")
            picks[match[0]] = food
        for r in reader:
            if r["entity"] not in KEEP:
                continue
            for col, food in picks.items():
                if r[col] not in ("", None):
                    rows.append((r["entity"], int(r["year"]), food, round(float(r[col]), 4)))
        print(f"  {slug}: {len(picks)} food(s)")
    rows.sort()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["entity", "year", "food", "kg_per_capita"])
        w.writerows(rows)
    print(f"wrote {len(rows)} rows -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
