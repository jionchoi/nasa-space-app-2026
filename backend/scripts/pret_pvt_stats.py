"""PVT reference norms from the CSA PRET v4.0 raw files, with OUR rules. Offline.

Run from backend/:
    python scripts/pret_pvt_stats.py            # print per-session results, exclusions, percentiles, cross-check
    python scripts/pret_pvt_stats.py --write    # also write backend/data/pvt_norms.json
Needs: pip install -r scripts/requirements-data.txt (pyreadstat; openpyxl only for the cross-check)

Raw files: data/raw/pret/.../PRET version 4.0/Data Files/NC Tests/PVT/Raw Data/*.csv, one session each, no header.
Columns (same as n=160.sav without CB and ACC2): subject id, session start, session, trial, RT (ms), ACC.
ACC codes, checked against PRET's "n=160 table.xlsx": 1 = hit (RT < 500 ms), 0 = miss (RT >= 500 ms: the on-screen
counter stops at 500), -1 = false alarm (equals its "# False Alarms"). PRET's "RT (ms)" is the MEAN RT of hits.
Raw subject ids have typos (80008A, 8230B, ...), so sessions are matched to subjects by DATE_TIME via the .sav.
Test (Phase 3 Final Report): 10-minute PVT, random 2-10 s gaps, counter up to 500 ms, 1 s feedback after each press.

Our rules (decided Nov 14), whole session per person:
- median RT = median of hits (ACC 1, RT >= 100 ms), ms
- lapse rate = lapses (target RT >= 355 ms, misses included) / targets (hits + misses with RT >= 100 ms) x 100, %
- false starts = PRET false alarms (ACC -1) + responses under 100 ms
- excluded: false starts > 10 % of trials, misses > 20 % of trials, or task misunderstanding (subject 8034)
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
import statistics as st
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PVT = ROOT / "data" / "raw" / "pret" / "PRET Versions, Data, Analysis, Reports" / "PRET version 4.0"
RAW = PVT / "Data Files" / "NC Tests" / "PVT" / "Raw Data"
SAV = PVT / "Data Files" / "NC Tests" / "PVT" / "n=160.sav"
TABLE = PVT / "Analysis Files" / "NC Tests" / "PVT" / "n=160 table.xlsx"
OUT = ROOT / "backend" / "data" / "pvt_norms.json"

LAPSE_MS = 355
FALSE_START_MS = 100
MAX_FALSE_START_SHARE = 0.10
MAX_MISS_SHARE = 0.20
MISUNDERSTOOD = {8034: "task misunderstanding: about 1 s per reaction for the first 3 minutes, then normal speed"}
PERCENTILES = (50, 90, 97.5)


def load_sessions() -> list[dict]:
    out = []
    for path in sorted(RAW.glob("*.csv")):
        rows = [r for r in csv.reader(path.open(encoding="utf-8", errors="replace")) if r]
        trials = [{"trial": int(r[3]), "rt": float(r[4]), "acc": int(r[5])} for r in rows]
        out.append({"file": path.name, "raw_id": rows[0][0], "date_time": rows[0][1], "trials": trials})
    return out


def subject_ids(sessions: list[dict]) -> None:
    """Real subject id from the .sav (matched on DATE_TIME); falls back to the digits of the raw id."""
    try:
        import pyreadstat
        data, _ = pyreadstat.read_sav(str(SAV), output_format="dict")
        by_time = {t: int(s) for t, s in zip(data["DATE_TIME"], data["SUBJECT"])}
    except Exception as exc:  # noqa: BLE001
        print(f"(could not read the .sav: {exc}; using raw ids)")
        by_time = {}
    for s in sessions:
        s["subject"] = by_time.get(s["date_time"], int(re.sub(r"\D", "", s["raw_id"]) or 0))


def session_stats(trials: list[dict]) -> dict:
    early = [t for t in trials if t["acc"] != -1 and t["rt"] < FALSE_START_MS]
    targets = [t for t in trials if t["acc"] in (0, 1) and t["rt"] >= FALSE_START_MS]
    hits = [t["rt"] for t in targets if t["acc"] == 1]
    misses = sum(1 for t in trials if t["acc"] == 0)
    lapses = sum(1 for t in targets if t["rt"] >= LAPSE_MS)
    false_starts = sum(1 for t in trials if t["acc"] == -1) + len(early)
    n = len(trials)
    return {
        "trials": n, "targets": len(targets),
        "median_rt_ms": st.median(hits) if hits else None,
        "mean_hit_rt_ms": st.mean(hits) if hits else None,
        "lapses": lapses, "lapse_rate_pct": 100 * lapses / len(targets) if targets else None,
        "false_starts": false_starts, "false_start_share": false_starts / n, "misses": misses, "miss_share": misses / n,
    }


def exclusion(s: dict) -> str | None:
    f = s["stats"]
    if s["subject"] in MISUNDERSTOOD:
        return MISUNDERSTOOD[s["subject"]]
    if f["false_start_share"] > MAX_FALSE_START_SHARE:
        return f"false starts {f['false_starts']} of {f['trials']} trials ({100 * f['false_start_share']:.0f} %, over 10 %)"
    if f["miss_share"] > MAX_MISS_SHARE:
        return f"misses {f['misses']} of {f['trials']} trials ({100 * f['miss_share']:.0f} %, over 20 %)"
    return None


def percentile(values: list[float], p: float) -> float:
    """Linear interpolation between closest ranks (same as numpy's default)."""
    xs = sorted(values)
    k = (len(xs) - 1) * p / 100
    lo, hi = math.floor(k), math.ceil(k)
    return xs[lo] + (xs[hi] - xs[lo]) * (k - lo)


def cross_check(sessions: list[dict]) -> list[str]:
    """Our median RT of hits vs PRET's table (a MEAN of hits): report the big differences."""
    try:
        import openpyxl
    except ImportError:
        return ["(openpyxl not installed: skipped the n=160 table.xlsx cross-check)"]
    wb = openpyxl.load_workbook(TABLE, read_only=True, data_only=True)
    table = {int(r[0]): r for r in wb.worksheets[0].iter_rows(values_only=True) if isinstance(r[0], (int, float))}
    diffs, lines = [], []
    for s in sessions:
        row = table.get(s["subject"])
        if row and s["stats"]["median_rt_ms"] is not None:
            diffs.append((s["stats"]["median_rt_ms"] - row[1], s["subject"], row[1], s["stats"]["median_rt_ms"]))
    d = [x[0] for x in diffs]
    lines.append(f"{len(diffs)} sessions compared: our median minus PRET's mean, median {st.median(d):+.0f} ms, "
                 f"range {min(d):+.0f} to {max(d):+.0f} ms (a median of hits is expected to be a little lower)")
    big = [x for x in diffs if abs(x[0]) > 25]
    for diff, subject, table_rt, ours in sorted(big):
        lines.append(f"  big difference: subject {subject}: PRET mean {table_rt} ms, our median {ours:.0f} ms ({diff:+.0f} ms)")
    if not big:
        lines.append("  no difference over 25 ms")
    lines.append(f"table subjects with no raw file: {sorted(set(table) - {s['subject'] for s in sessions})}")
    return lines


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help=f"write {OUT.relative_to(ROOT)}")
    args = ap.parse_args()

    sessions = load_sessions()
    subject_ids(sessions)
    for s in sessions:
        s["stats"] = session_stats(s["trials"])
        s["excluded"] = exclusion(s)
    kept = [s for s in sessions if not s["excluded"]]
    n_trials = [s["stats"]["trials"] for s in sessions]

    print(f"{len(sessions)} sessions (one per person). Test: 10-minute PVT (PRET Phase 3 Final Report); "
          f"{st.median(n_trials)} trials per session (range {min(n_trials)}-{max(n_trials)}).")
    print("\nExcluded:")
    for s in sorted((s for s in sessions if s["excluded"]), key=lambda s: s["subject"]):
        print(f"  {s['subject']} ({s['file']}): {s['excluded']}")
    print(f"n = {len(kept)} sessions included")

    rt = [s["stats"]["median_rt_ms"] for s in kept]
    lr = [s["stats"]["lapse_rate_pct"] for s in kept]
    pct = {"median_rt_ms": {f"p{str(p).replace('.', '_')}": round(percentile(rt, p), 1) for p in PERCENTILES},
           "lapse_rate_pct": {f"p{str(p).replace('.', '_')}": round(percentile(lr, p), 2) for p in PERCENTILES}}
    print("\nPercentiles over the included sessions:")
    print(f"  median RT of hits (ms): {pct['median_rt_ms']}")
    print(f"  lapse rate, RT >= {LAPSE_MS} ms (%): {pct['lapse_rate_pct']}")
    print(f"  false starts per session: median {st.median(s['stats']['false_starts'] for s in kept)}")

    print("\nCross-check with n=160 table.xlsx:")
    for line in cross_check(sessions):
        print(" ", line)

    if args.write:
        data = {
            "_status": "Generated by backend/scripts/pret_pvt_stats.py --write from the CSA PRET raw PVT files. "
                       "Do not edit by hand; re-run the script.",
            "source": "CSA PRET dataset, version 4.0, ground study",
            "licence": "Open Government Licence - Canada",
            "licence_url": "https://open.canada.ca/en/open-government-licence-canada",
            "url": "https://donnees-data.asc-csa.gc.ca/users/OpenData_DonneesOuvertes/pub/PRET/",
            "test": "PRET 10-minute PVT (2-10 s random gaps, counter up to 500 ms), one session per person "
                    "(Phase 3 Final Report). Our app's test is 3 minutes.",
            "lapse_rule": f"lapse = reaction time >= {LAPSE_MS} ms (misses included)",
            "lapse_ms": LAPSE_MS,
            "metrics": {
                "median_rt_ms": "median reaction time of hits (responses 100-499 ms), whole session",
                "lapse_rate_pct": f"lapses (RT >= {LAPSE_MS} ms) / targets (hits + misses) x 100, whole session",
                "false_starts": f"PRET false alarms + responses under {FALSE_START_MS} ms",
            },
            "exclusion_rule": "false starts > 10 % of trials, misses (RT >= 500 ms) > 20 % of trials, "
                              "or obvious task misunderstanding (subject 8034)",
            "excluded": [{"subject": s["subject"], "reason": s["excluded"]}
                         for s in sorted(sessions, key=lambda s: s["subject"]) if s["excluded"]],
            "n": len(kept),
            "n_sessions": len(sessions),
            "percentiles": pct,
            # Sorted per-person values (anonymous), so the app can say "faster than Y % of the reference group".
            "distribution": {"median_rt_ms": sorted(round(x, 1) for x in rt),
                             "lapse_rate_pct": sorted(round(x, 2) for x in lr)},
        }
        OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"\nwrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
