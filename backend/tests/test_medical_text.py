"""Nov 14: Yenna's medical text (docs/medical/) merged by scripts/merge_medical.py, with fixes to match the app."""
import json
import re
from pathlib import Path

from app import store

MED = Path(__file__).resolve().parents[2] / "docs" / "medical"


def hers(name):
    return json.loads((MED / name).read_text(encoding="utf-8"))


def test_regions_take_only_function_and_space_effect():
    theirs = hers("regions.json")
    for region in store.regions()["regions"]:
        assert region["function"] == theirs[region["id"]]["function"]
        assert region["space_effect"] == theirs[region["id"]]["space_effect"]
        assert region["metrics"] and region["key_metric"]  # our keys kept


def test_every_cited_ref_has_a_status():
    for region in store.regions()["regions"]:
        cited = set(re.findall(r"\[(REF-\d+)\]", region["space_effect"]))
        assert cited == set(region["refs"]), region["id"]
        if not (MED / "references.csv").exists():
            assert all(r["status"] == "pending" for r in region["refs"].values())


def test_measurements_match_how_the_app_measures():
    m = store.measurements()["metrics"]
    for key in ("hr_rest", "hrv_rmssd", "rr"):
        assert m[key]["equipment"] == "Finger PPG sensor", key
        assert any("2 minutes" in s for s in m[key]["how_to_measure"]), key
    for key in ("mood", "stress"):
        steps = " ".join(m[key]["how_to_measure"])
        assert "1 to 5" in steps or "1 (very low) to 5" in steps
        assert "10" not in steps
    stand = m["stand_hr_rise"]
    assert stand["can_do_in_space"] == {"possible": False, "note": "gravity only (Moon, Mars surface, after landing)"}
    assert stand["how_to_measure"][:2] == ["Sit still for 2 minutes with the finger PPG clip on.", "Stand up and stay standing for 1 minute."]


def test_draft_kept_exactly_where_yenna_wrote_it():
    m = store.measurements()["metrics"]
    written = {k: v for k, v in m.items() if "draft" not in v}  # not placeholders
    assert [k for k, v in written.items() if "DRAFT" in json.dumps(v)] == ["stand_hr_rise"]
    assert "DRAFT: Perform only in gravity environments." in m["stand_hr_rise"]["how_to_measure"]
    g = store.guidance()["regions"]
    theirs = hers("guidance.json")
    for region, items in g.items():
        for status, item in items.items():
            assert item == theirs[region][status], (region, status)


def test_reaction_test_text_matches_the_app():
    m = store.measurements()["metrics"]
    assert "3-minute" in " ".join(m["pvt_median_ms"]["how_to_measure"])
    lapse = " ".join(m["pvt_lapse_rate_pct"]["how_to_measure"])
    assert "355 ms" in lapse and "%" in lapse
    assert m["pvt_lapse_rate_pct"]["app_fix"] and m["pvt_median_ms"]["app_fix"]
