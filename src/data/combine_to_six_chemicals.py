#!/usr/bin/env python3
"""Combine national production-volume (low/high) and reported-use (industry+consumer)
wide CSVs into one tidy/long CSV: year,volume,category,chemical.

Categories per chemical-year: reported, low, high.
Ordering: chemical -> category (reported, low, high) -> year ascending.
"""

import csv
from pathlib import Path

HERE = Path(__file__).parent
PROD = HERE / "nationally-aggregated-production-volume.csv"
USE = HERE / "chemical-reported-use_industry-plus-consumer.csv"
OUT = HERE / "four-chemicals-production-volumes.csv"

YEARS = [str(y) for y in range(2012, 2024)]
CATEGORY_ORDER = ["reported", "low", "high"]


def read_csv(path):
    # utf-8-sig strips the BOM both files carry.
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def main():
    prod = {r["Chemical name"]: r for r in read_csv(PROD)}
    use = {r["Chemical name"]: r for r in read_csv(USE)}

    # Preserve the chemical order from the production file.
    chemicals = list(prod.keys())

    missing = set(chemicals) ^ set(use.keys())
    if missing:
        raise SystemExit(f"Chemical name mismatch between files: {sorted(missing)}")

    rows = []
    for chem in chemicals:
        for cat in CATEGORY_ORDER:
            for year in YEARS:
                if cat == "reported":
                    vol = use[chem][year]
                else:  # low / high
                    vol = prod[chem][f"{year} {cat}"]
                rows.append((year, vol, cat, chem))

    with open(OUT, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["year", "volume", "category", "chemical"])
        w.writerows(rows)

    print(f"Wrote {len(rows)} rows for {len(chemicals)} chemicals -> {OUT.name}")


if __name__ == "__main__":
    main()
