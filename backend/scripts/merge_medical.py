"""Merge Yenna's medical text (docs/medical/) into the app's data files. Offline, stdlib only. Re-runnable.

Run from backend/:  python scripts/merge_medical.py

- regions.json: copies only "function" and "space_effect" per region; every other key (metrics, positions, key_metric,
  context_metrics, ...) stays. The REF-xx ids in space_effect are checked against docs/medical/references.csv; each
  region gets "refs" {"REF-01": {"status": "ok" | "pending", "citation"}}. The UI shows "(source pending)" for pending.
- measurements.json: her entries, under OUR metric keys (KEY_MAP), converted to our shape
  (can_do_in_space {possible, note}). Then the fixes in FIXES (how the app actually measures) are applied, and any of
  our metrics she has not written yet keep their current text with a DRAFT placeholder marker.
- guidance.json: her text per region and status (same keys as ours); missing items keep ours.
"DRAFT" is kept exactly where her text has it; nothing here adds or removes it in her sentences.
Prints a report for Yenna: key renames, fixes, placeholders, REF problems.
"""
from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MED = ROOT.parent / "docs" / "medical"

# Her metric key -> our key (thresholds.json / measurements.json). Keys not listed are the same in both.
KEY_MAP = {
    "temperature": "temp_c", "glucose": "glucose_mmol", "pvt_median": "pvt_median_ms", "hydration": "hydration_l",
    "exercise": "exercise_min_7d", "body_mass": "body_mass_change_pct", "co2": "co2_ppm",
    "radiation_dose": "radiation_total_msv", "pvt_lapses": "pvt_lapse_rate_pct",
}

PPG_STEPS = ["Put the finger PPG clip on your fingertip.",
             "Sit still and breathe normally for 2 minutes during the daily check."]
# How the app works (CLAUDE.md, questionnaire.json). Each fix replaces only the listed fields, with a reason for Yenna.
FIXES = {
    "hr_rest": {"how_to_measure": PPG_STEPS, "equipment": "Finger PPG sensor",
                "_why": "Measured with the finger PPG clip during the 2-minute seated check, not a wristband for 3 minutes."},
    "hrv_rmssd": {"how_to_measure": PPG_STEPS + ["The app works out your heart rate variability from the beats."],
                  "equipment": "Finger PPG sensor",
                  "_why": "Measured with the finger PPG clip during the 2-minute seated check, not a chest strap overnight."},
    "rr": {"how_to_measure": PPG_STEPS + ["The app counts your breaths from the pulse signal."],
           "equipment": "Finger PPG sensor",
           "_why": "Breathing rate is estimated from the finger PPG signal in the seated check, not a chest strap or wristband."},
    "mood": {"how_to_measure": ["Open the daily check questions.", "Rate your mood from 1 (very low) to 5 (very good)."],
             "_why": "The daily check uses a 1-5 scale, not a 1-10 slider."},
    "stress": {"how_to_measure": ["Open the daily check questions.", "Rate your stress from 1 to 5."],
               "_why": "The daily check uses a 1-5 scale, not a 1-10 slider."},
    "pvt_median_ms": {"how_to_measure": ["Start the 3-minute reaction test in the daily check.",
                                         "Press the space bar or tap as fast as you can when the target appears.",
                                         "The app takes the median of your reaction times."],
                      "equipment": "Tablet or laptop (the app)",
                      "_why": "The app's own reaction test is 3 minutes (not a separate PVT app); the result is the median "
                              "reaction time."},
    "pvt_lapse_rate_pct": {"how_to_measure": ["Counted automatically during the 3-minute reaction test.",
                                              "A lapse is a reaction of 355 ms or slower, or no reaction.",
                                              "The app shows lapses as a percentage of all targets (lapse rate, %)."],
                           "equipment": "Tablet or laptop (the app)",
                           "_why": "The app reports a lapse RATE in % (lapses / targets), with a lapse = 355 ms or slower "
                                   "(same rule as the CSA PRET reference group), not a lapse count."},
    "stand_hr_rise": {"how_to_measure_keep_draft": ["Sit still for 2 minutes with the finger PPG clip on.",
                                                    "Stand up and stay standing for 1 minute."],
                      "can_do_in_space": {"possible": False, "note": "gravity only (Moon, Mars surface, after landing)"},
                      "equipment": "Finger PPG sensor",
                      "_why": "The app's stand test is sit 2 minutes then stand 1 minute (not lie down 5 minutes), with "
                              "the finger PPG clip. It only means something in gravity, so can_do_in_space is false in orbit."},
}

REF_RE = re.compile(r"\[(REF-\d+)\]")


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT.parent)}")


def load_references() -> dict[str, dict] | None:
    """docs/medical/references.csv -> {REF-xx: row}, or None if the file does not exist."""
    path = MED / "references.csv"
    if not path.exists():
        return None
    with path.open(newline="", encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))
    out = {}
    for row in rows:
        rid = next((v.strip() for k, v in row.items() if k and k.strip().lower() in ("id", "ref", "ref_id")), "")
        if rid:
            out[rid] = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}
    return out


def merge_regions(report: list[str]) -> None:
    ours, hers = read(DATA / "regions.json"), read(MED / "regions.json")
    refs = load_references()
    if refs is None:
        report.append("REF: docs/medical/references.csv does not exist, so every REF id is shown as '(source pending)'.")
    seen: dict[str, str] = {}
    ids = {r["id"] for r in ours["regions"]}
    for region in ours["regions"]:
        mine = hers.get(region["id"])
        if not mine:
            report.append(f"regions: no text from Yenna for {region['id']}; kept ours.")
            continue
        for key in ("function", "space_effect"):
            if mine.get(key):
                region[key] = mine[key]
        region_refs = {}
        for rid in REF_RE.findall(region.get("space_effect", "")):
            if rid in seen and seen[rid] != region["id"]:
                report.append(f"REF mismatch: {rid} is used in both {seen[rid]} and {region['id']}.")
            seen[rid] = region["id"]
            row = (refs or {}).get(rid)
            citation = next((row[k] for k in ("citation", "reference", "title", "source") if row and row.get(k)), "") if row else ""
            region_refs[rid] = {"status": "ok", "citation": citation} if citation else {"status": "pending"}
            if refs is not None and not row:
                report.append(f"REF missing: {rid} ({region['id']}) is not in references.csv.")
            elif refs is not None and not citation:
                report.append(f"REF mismatch: {rid} is in references.csv but has no citation text.")
        region["refs"] = region_refs
    for extra in set(hers) - ids:
        report.append(f"regions: Yenna's region '{extra}' has no matching region in the app; not used.")
    if refs is not None:
        for rid in sorted(set(refs) - set(seen)):
            report.append(f"REF unused: {rid} is in references.csv but not cited in regions.json.")
    else:
        report.append("REF ids cited (all pending): " + ", ".join(sorted(seen, key=lambda r: int(r.split("-")[1]))))
    ours["_status"] = ("Region 'function' and 'space_effect' are Yenna's text (docs/medical/regions.json, merged by "
                       "scripts/merge_medical.py). Everything else (metrics, layout, forecast settings) is the app's.")
    write(DATA / "regions.json", ours)


def convert(entry: dict) -> dict:
    """Her shape -> ours: can_do_in_space bool + equipment -> {possible, note}; equipment kept as its own field."""
    out = {k: v for k, v in entry.items() if k != "can_do_in_space"}
    can = entry.get("can_do_in_space")
    if isinstance(can, dict):
        out["can_do_in_space"] = can
    else:
        out["can_do_in_space"] = {"possible": bool(can), "note": entry.get("equipment", "")}
    return out


def merge_measurements(report: list[str]) -> None:
    ours, hers = read(DATA / "measurements.json"), read(MED / "measurements.json")
    thresholds = read(DATA / "thresholds.json")
    our_keys = [k for k, v in thresholds.items()
                if isinstance(v, dict) and k not in ("red_flags", "daily_targets", "cv", "dose_estimates", "pvt")]
    metrics: dict[str, dict] = {}
    for key, entry in hers.items():
        target = KEY_MAP.get(key, key)
        if key != target:
            report.append(f"measurements: her key '{key}' saved as our key '{target}'.")
        if target not in our_keys:
            report.append(f"measurements: her metric '{key}' has no matching metric in thresholds.json; not used.")
            continue
        metrics[target] = convert(entry)
    for key, fix in FIXES.items():
        if key not in metrics:
            continue
        entry = metrics[key]
        if "how_to_measure_keep_draft" in fix:  # replace her steps but keep her DRAFT lines as they are
            kept = [s for s in entry["how_to_measure"] if s.startswith("DRAFT")]
            entry["how_to_measure"] = fix["how_to_measure_keep_draft"] + kept
        if "how_to_measure" in fix:
            entry["how_to_measure"] = fix["how_to_measure"]
        if "equipment" in fix:
            entry["equipment"] = fix["equipment"]
            if isinstance(entry.get("can_do_in_space"), dict) and "can_do_in_space" not in fix:
                entry["can_do_in_space"]["note"] = fix["equipment"]
        if "can_do_in_space" in fix:
            entry["can_do_in_space"] = dict(fix["can_do_in_space"])
        entry["app_fix"] = fix["_why"]
        report.append(f"fix {key}: {fix['_why']}")
    placeholders = []
    for key in our_keys:
        if key in metrics:
            continue
        old = dict(ours["metrics"].get(key) or {})
        old.setdefault("how_to_measure", ["DRAFT: Not written yet."])
        old.setdefault("why_check", "DRAFT: Not written yet.")
        old.setdefault("can_do_in_space", {"possible": True, "note": "DRAFT: Not written yet."})
        old["draft"] = "DRAFT - placeholder, Yenna has not written this metric yet"
        metrics[key] = old
        placeholders.append(key)
    if placeholders:
        report.append("placeholders (our metrics she has not written, kept as DRAFT): " + ", ".join(placeholders))
    ours["metrics"] = {k: metrics[k] for k in our_keys}
    ours["_status"] = ("Yenna's text (docs/medical/measurements.json, merged by scripts/merge_medical.py) under the app's "
                       "metric keys. Entries with 'app_fix' were changed to match how the app measures; entries with "
                       "'draft' are placeholders she has not written yet.")
    write(DATA / "measurements.json", ours)


def merge_guidance(report: list[str]) -> None:
    ours, hers = read(DATA / "guidance.json"), read(MED / "guidance.json")
    statuses = list(ours["status_keys"].values())
    for region, items in ours["regions"].items():
        for status in statuses:
            item = (hers.get(region) or {}).get(status)
            if item:
                items[status] = item
            else:
                report.append(f"guidance: no text from Yenna for {region}/{status}; kept ours (DRAFT).")
    for region in set(hers) - set(ours["regions"]):
        report.append(f"guidance: Yenna's region '{region}' has no matching region in the app; not used.")
    ours["_status"] = "Yenna's text (docs/medical/guidance.json, merged by scripts/merge_medical.py)."
    write(DATA / "guidance.json", ours)


def main() -> int:
    for name in ("regions.json", "measurements.json", "guidance.json"):
        if not (MED / name).exists():
            print(f"missing docs/medical/{name}")
            return 1
    report: list[str] = []
    merge_regions(report)
    merge_measurements(report)
    merge_guidance(report)
    print("\nReport for Yenna:")
    for line in report:
        print(" -", line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
