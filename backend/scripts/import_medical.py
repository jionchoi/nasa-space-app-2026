"""Import the medical lead's workbook (CSV exports in data/medical/) into the app's JSON files.

  python backend/scripts/import_medical.py

Reads:
  thresholds_recommended.csv                    RULE-01..17 -> rule fields on thresholds.json entries
  ...(Scientific References).csv                REF-01..17  -> backend/data/references.json
  ...(Master Health Indicator Catalog).csv      indicators  -> backend/data/indicators.json (Learn pop-up)
  ...(Collapse Protocol).csv / (Chest Pain ...)  CL00-CL13 / CP00-CP07 -> backend/data/protocols/*.json steps
  ...(Integration & Safety).csv                 safety switches -> backend/data/indicators.json "safety"

Numbers (bands) in thresholds.json are NOT written here: they were set once from the sheet plus team defaults (each band
says where it comes from in `band_sources`). This script only copies the sheet's text so a new export is a re-run.
Text is copied as written, except the repairs listed in REPAIRS (reported in docs/medsci-integration-report.md).
"""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "medical"
DATA = ROOT / "backend" / "data"

SHEET = "Medical lead's sheet (proposed, not clinically validated)"

# RULE-08's rationale is a copy of the HRV text in the sheet (known error, reported).
REPAIRS = {
    ("RULE-08", "Physiological Rationale"):
        "Differentiates Level 1 hypoglycemia (<70 mg/dL) from clinically significant hypoglycemia (<54 mg/dL).",
}

# Sheet rule -> thresholds.json entries it governs. RULE-06 (stand test), RULE-14 and RULE-15 (biomarkers) are skipped.
RULE_METRICS = {
    "RULE-01": ["hr_rest", "hr"], "RULE-02": ["hrv_rmssd"], "RULE-03": ["spo2"], "RULE-04": ["bp_sys", "bp_dia"],
    "RULE-05": ["irregular"], "RULE-07": ["temp_c"], "RULE-08": ["glucose_mmol"],
    "RULE-09": ["hydration_l", "calories_pct"], "RULE-10": ["sleep_h"], "RULE-11": ["mood"],
    "RULE-12": ["pvt_median_ms", "pvt_lapse_rate_pct"], "RULE-13": ["exercise_min_7d"],
    "RULE-16": ["radiation_msv", "radiation_total_msv"], "RULE-17": ["co2_mmhg", "co2_ppm"],
}
SKIPPED_RULES = {"RULE-06": "stand test", "RULE-14": "bone biomarkers", "RULE-15": "immune biomarkers"}

# Catalog indicator -> app metrics (for the Learn pop-up), and how the app gets the value (Integration & Safety:
# "tag each indicator": Live / Manual / Simulation / Mission device). In Demo mode every crew value is a simulation.
INDICATOR_METRICS = {
    "01": ["hr_rest", "hr"], "02": ["hrv_rmssd"], "03": ["spo2"], "04": ["bp_sys", "bp_dia"], "05": ["irregular"],
    "06": ["stand_hr_rise"], "07": ["temp_c"], "08": ["glucose_mmol"], "09": ["hydration_l", "calories_pct"],
    "10": ["sleep_h"], "11": ["mood"], "12": ["pvt_median_ms", "pvt_lapse_rate_pct"], "13": ["exercise_min_7d"],
    "14": [], "15": [], "16": ["radiation_msv", "radiation_total_msv"], "17": ["co2_mmhg", "co2_ppm"],
}
DATA_SOURCE = {
    "01": "Live", "02": "Live", "03": "Live", "04": "Manual", "05": "Live", "06": "Live", "07": "Manual",
    "08": "Manual", "09": "Manual", "10": "Manual", "11": "Manual", "12": "Live", "13": "Manual",
    "14": "Mission device", "15": "Mission device", "16": "Mission device", "17": "Mission device",
}
DATA_SOURCE_NOTE = {
    "Live": "Measured by the app (finger PPG clip or the on-screen reaction test).",
    "Manual": "Typed in or answered by the crew (log, daily check).",
    "Simulation": "Simulated crew member (Demo mode).",
    "Mission device": "Read from a mission instrument or data feed (dosimeter, cabin air analyser, lab analyser).",
}

# Protocol cited-source codes -> Scientific References IDs (given by the team).
CITED = {"AHA_BLS_2025": "REF-10", "SPACE_CPR_2020": "REF-16", "ER_2011": "REF-15", "AHA_FIRST_AID_2024": "REF-11"}

# App-only extras per protocol step (never medical text): equipment for the rover kit notes, the CPR guide
# (metronome and cycle timers) on CL07 and CL13, a timer where the step names one, and the protocol hand-off on CL10.
STEP_EXTRAS = {
    "CL04": {"equipment": ["restraint"]},
    "CL05": {"timer_s": 10},
    "CL07": {"cpr": True, "equipment": ["restraint"]},
    "CL08": {"equipment": ["aed"]},
    "CL10": {"links": [{"to": "CP00", "label": "Open the chest-pain protocol (CP00)"}]},
    "CL13": {"cpr": True, "equipment": ["aed"]},
    "CP04": {"equipment": ["medical_kit"]},
    "CP05": {"equipment": ["sensor"]},
}
PROTOCOLS = {
    "unresponsive": {"file": "Collapse Protocol", "title": "Crew member not responding (possible collapse)",
                     "red_flags": ["Not responding", "Not breathing normally or gasping", "No pulse",
                                   "Blood oxygen (SpO2) in the danger range",
                                   "Heart rate in the danger range (very fast or very slow)", "Irregular heart rhythm"]},
    "chest_pain": {"file": "Chest Pain Protocol", "title": "Chest pain or pressure",
                   "red_flags": ["Not awake or not answering", "Not breathing normally",
                                 "Blood oxygen (SpO2) in the danger range",
                                 "Heart rate in the danger range (very fast or very slow)", "Irregular heart rhythm"]},
}


def find(part: str) -> Path | None:
    hits = sorted(p for p in SRC.glob("*.csv") if part in p.name)
    return hits[0] if hits else None


def rows(path: Path, key: str) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return [{k.strip(): (v or "").strip() for k, v in r.items() if k} for r in csv.DictReader(f) if (r.get(key) or "").strip()]


def split_ids(text: str) -> list[str]:
    return [x.strip() for x in re.split(r"[,;]", text) if x.strip()]


def qa_split(note: str) -> dict:
    """'QA 2026-11-14: finding | recommendation' -> {finding, recommendation}."""
    finding, _, rec = note.partition("|")
    return {"finding": finding.strip(), "recommendation": rec.strip()}


def import_rules() -> list[str]:
    path = SRC / "thresholds_recommended.csv"
    th = json.loads((DATA / "thresholds.json").read_text())
    done = []
    for r in rows(path, "Rule ID"):
        rule = r["Rule ID"]
        for (rid, col), text in REPAIRS.items():
            if rid == rule:
                r[col] = text
        for metric in RULE_METRICS.get(rule, []):
            entry = th.get(metric)
            if not isinstance(entry, dict):
                continue
            notes = r["Notes"]
            entry.update({
                "rule_id": rule,
                "indicator_id": r["Indicator ID"],
                "ref_ids": split_ids(r["Supporting Reference ID"]),
                "evidence_status": r["Evidence Status"],
                "validation_status": r["Validation Status"],
                "demo_only": "DEMO" in (r["Watch Condition"] + r["Act-Now Condition"] + notes).upper(),
                "qa_note": notes,
                "qa": qa_split(notes),
                "actions": {"watch": r["Watch Action"], "act": r["Act-Now Action"]},
                "sheet": {"baseline": r["Measurement / Baseline Condition"], "nominal": r["Nominal Condition"],
                          "watch": r["Watch Condition"], "act": r["Act-Now Condition"],
                          "rationale": r["Physiological Rationale"], "escalation": r["Escalation Level"]},
            })
            # The reaction-test bands come from CSA PRET (kept: conflict with the sheet's 200-250 ms reported to Yenna).
            if not str(entry.get("source", "")).startswith("DRAFT, from PRET"):
                entry["source"] = f"{SHEET}, {rule}"
            if "WITH" in r["Act-Now Condition"] or rule == "RULE-05":
                entry["requires_symptoms"] = True
            done.append(metric)
    # CO2: the sheet's unit is mmHg (co2_mmhg). The cabin feeds are ppm: co2_ppm bands are derived, never edited by hand.
    mm = th["co2_mmhg"]
    pressure = float(mm.get("cabin_pressure_mmhg", 760))
    to_ppm = lambda b: None if not b else [None if v is None else round(v / pressure * 1e6) for v in b]  # noqa: E731
    th["co2_ppm"].update({"yellow": to_ppm(mm.get("yellow")), "orange": to_ppm(mm.get("orange")), "red": None,
                          "inclusive": mm.get("inclusive"), "derived_from": "co2_mmhg",
                          "band_sources": mm.get("band_sources"),
                          "derived_note": f"ppm = mmHg / {pressure:g} mmHg x 1,000,000 (ISS cabin pressure)."})
    (DATA / "thresholds.json").write_text(json.dumps(th, indent=2) + "\n")
    return done


def import_references() -> dict:
    path = find("Scientific References")
    refs = []
    for r in rows(path, "Reference ID"):
        url = r["DOI / URL"]
        refs.append({
            "id": r["Reference ID"], "indicators": split_ids(r["Related Indicator ID(s)"]),
            "authors": r["Author(s) / Organization"], "year": r["Publication Year"],
            "title": r["Study / Document Title"], "type": r["Source Type"], "findings": r["Relevant Findings"],
            "values": r["Exact Values / Thresholds Reported"], "population": r["Population Studied"],
            "url": url if url.startswith("http") else None,
            "url_note": None if url.startswith("http") else url,
            "verification": r["Evidence Verification Status"],
        })
    out = {
        "_status": "From the medical lead's workbook (Scientific References sheet). Do not edit by hand: re-run "
                   "backend/scripts/import_medical.py. A reference without a URL keeps the sheet's note.",
        "source_file": f"data/medical/{path.name}",
        "references": refs,
        "cited_source_codes": CITED,
    }
    (DATA / "references.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    return out


def import_catalog() -> dict:
    path = find("Master Health Indicator Catalog")
    indicators = {}
    for r in rows(path, "Indicator ID"):
        iid = r["Indicator ID"]
        indicators[iid] = {
            "id": iid, "name": r["Health Indicator"], "category": r["Medical Category"],
            "system": r["Body Region / System"], "unit": r["Measurement Unit"], "method": r["On-Board Measurement Method"],
            "how_to_measure": [r[f"How to Measure – Step {i}"] for i in (1, 2, 3) if r.get(f"How to Measure – Step {i}")],
            "what": r["What Does It Measure?"], "why_space": r["Why Does It Matter in Space?"],
            "normal_range": r["Normal / Reference Range"], "space_effect": r["How Spaceflight Affects It"],
            "abnormal": r["Meaning of Abnormal Results"], "baseline": r["Personal Baseline Definition"],
            "limitations": r["Measurement Limitations"], "evidence": r["Evidence Classification"],
            "citation": r["Scientific Source / Citation"], "url": r["DOI / Source URL"] or None,
            "research_status": r["Research Status"],
            "metrics": INDICATOR_METRICS.get(iid, []), "data_source": DATA_SOURCE.get(iid, "Manual"),
        }
    safety = {}
    spath = find("Integration & Safety")
    if spath:
        for r in rows(spath, "Topic"):
            safety[r["Topic"]] = {"decision": r["Current decision"], "handoff": r["Developer handoff / verification"]}
    out = {
        "_status": "From the medical lead's workbook (Master Health Indicator Catalog). Shown in the Learn pop-up; it wins "
                   "over regions.json / measurements.json text where they disagree (those files are kept unchanged). "
                   "Re-run backend/scripts/import_medical.py after a new export.",
        "source_file": f"data/medical/{path.name}",
        "disclaimer": "Research prototype · not clinically validated",
        "indicators": indicators,
        "metric_index": {m: iid for iid, ind in indicators.items() for m in ind["metrics"]},
        "data_source_types": DATA_SOURCE_NOTE,
        "safety": safety,
        "switches": {"simulation_enabled": True, "clinical_auto_alert_enabled": False,
                     "_note": "clinical_auto_alert_enabled = false: no automatic alerts from real sensor data "
                              "(Measurement / Research mode). Demo mode alerts on simulated data only."},
    }
    (DATA / "indicators.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    return out


def import_protocols() -> None:
    for pid, cfg in PROTOCOLS.items():
        path = find(cfg["file"])
        target = DATA / "protocols" / f"{pid}.json"
        old = json.loads(target.read_text())
        steps = []
        for n, r in enumerate(rows(path, "Node ID"), start=1):
            node = r["Node ID"]
            kind = r["Step Type"]
            prompt = r["On-screen prompt / action"]
            codes = split_ids(r["Cited sources"])
            step = {
                "n": n, "id": node, "type": kind, "text": prompt,
                "check": prompt if kind == "decision" else None,
                "on_yes": r["If YES ->"] or None, "on_no": r["If NO ->"] or None, "next": r["Next ->"] or None,
                "urgency": r["Urgency"], "sources": codes, "refs": [CITED.get(c, c) for c in codes],
                "note": r["Engineer / clinical note"],
                "red_flag": r["Urgency"].lower().startswith("immediate"), "timer_s": None,
            }
            step.update(STEP_EXTRAS.get(node, {}))
            steps.append(step)
        out = {
            "id": pid, "title": cfg["title"],
            "draft": "From the medical lead's workbook: educational flow adapted from terrestrial guidance; protocol "
                     "validation pending crew medical authority. The app prescribes no drugs, doses, oxygen or IV.",
            "source_file": f"data/medical/{path.name}",
            "start": steps[0]["id"],
            "steps": steps,
            "red_flags": cfg["red_flags"],
            "red_flag_routes": [],
            "_note": "Sensors never answer a step or move the crew on: red flags only light up (Integration & Safety: human "
                     "assessment > sensors). Old red_flag_routes (5 s auto-route to CPR) removed Nov 15.",
        }
        if old.get("_note_old"):
            out["_note_old"] = old["_note_old"]
        target.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    print("rules ->", import_rules())
    print("references ->", len(import_references()["references"]))
    print("indicators ->", len(import_catalog()["indicators"]))
    import_protocols()
    print("protocols -> unresponsive, chest_pain")
