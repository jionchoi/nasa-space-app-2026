"""Nov 15: the medical lead's threshold sheet (RULE-01..17) plus team defaults, in thresholds.json.

Every band edge is checked on both sides, so no value falls in a gap or in two levels. The sheet's day rules, the
baseline rules, "no Act now from X alone", requires_symptoms and "poor signal never escalates" are checked too.
"""
import json

import pytest

from app import alerts, store
from app.rules.daily_rules import daily_level, usual
from app.rules.judge import judge
from app.rules.status import region_statuses

T = store.thresholds

# (metric, value, expected status) on both sides of every edge. Single reading, no symptom logged.
EDGES = [
    # RULE-01 resting heart rate: nominal 60-90, Watch 50-59 / 91-100, Warning 41-49 / 101-120, Act <40 / >120
    ("hr_rest", 39.9, "red"), ("hr_rest", 40, "orange"), ("hr_rest", 49.9, "orange"), ("hr_rest", 50, "yellow"),
    ("hr_rest", 59.9, "yellow"), ("hr_rest", 60, "green"), ("hr_rest", 90, "green"), ("hr_rest", 90.1, "yellow"),
    ("hr_rest", 100, "yellow"), ("hr_rest", 100.1, "orange"), ("hr_rest", 120, "orange"), ("hr_rest", 120.1, "red"),
    # live heart rate (50-59 nominal, team default)
    ("hr", 39.9, "red"), ("hr", 40, "orange"), ("hr", 49.9, "orange"), ("hr", 50, "green"), ("hr", 90, "green"),
    ("hr", 90.1, "yellow"), ("hr", 100, "yellow"), ("hr", 100.1, "orange"), ("hr", 120, "orange"), ("hr", 120.1, "red"),
    # RULE-03 SpO2: 95-100 nominal, 92-94 Watch, 90-91 Warning, <90 Act
    ("spo2", 100, "green"), ("spo2", 95, "green"), ("spo2", 94.9, "yellow"), ("spo2", 92, "yellow"),
    ("spo2", 91.9, "orange"), ("spo2", 90, "orange"), ("spo2", 89.9, "red"),
    # RULE-04 BP (cuff): Watch >= 130/85, Warning >= 160/100, Act > 180/120 only WITH symptoms
    ("bp_sys", 129.9, "green"), ("bp_sys", 130, "yellow"), ("bp_sys", 159.9, "yellow"), ("bp_sys", 160, "orange"),
    ("bp_sys", 180, "orange"), ("bp_sys", 181, "orange"),
    ("bp_dia", 84.9, "green"), ("bp_dia", 85, "yellow"), ("bp_dia", 99.9, "yellow"), ("bp_dia", 100, "orange"),
    ("bp_dia", 120, "orange"), ("bp_dia", 121, "orange"),
    # RULE-05 rhythm: irregular flag = Watch; Act only with symptoms
    ("irregular", 0, "green"), ("irregular", 0.5, "green"), ("irregular", 1, "yellow"),
    # RULE-07 temperature: 36.5-37.4 nominal, 37.5-37.9 Watch, 38.0-38.4 / 35.0-36.0 Warning, >=38.5 / <35.0 Act
    ("temp_c", 34.99, "red"), ("temp_c", 35.0, "orange"), ("temp_c", 36.0, "orange"), ("temp_c", 36.01, "yellow"),
    ("temp_c", 36.49, "yellow"), ("temp_c", 36.5, "green"), ("temp_c", 37.4, "green"), ("temp_c", 37.41, "yellow"),
    ("temp_c", 37.9, "yellow"), ("temp_c", 37.91, "orange"), ("temp_c", 38.49, "orange"), ("temp_c", 38.5, "red"),
    # RULE-08 glucose (mmol/L = mg/dL / 18): <70 Watch, <54 Act, >140 Watch, >180 Warning
    ("glucose_mmol", 2.99, "red"), ("glucose_mmol", 3.0, "yellow"), ("glucose_mmol", 3.89, "yellow"),
    ("glucose_mmol", 3.9, "green"), ("glucose_mmol", 7.8, "green"), ("glucose_mmol", 7.81, "yellow"),
    ("glucose_mmol", 10.0, "yellow"), ("glucose_mmol", 10.01, "orange"),
    # RULE-10 sleep (per night; the day rule is tested below)
    ("sleep_h", 6.0, "green"), ("sleep_h", 5.99, "yellow"), ("sleep_h", 5.0, "yellow"), ("sleep_h", 4.99, "orange"),
    ("sleep_h", 4.0, "orange"), ("sleep_h", 3.99, "red"),
    # RULE-11 mood on the sheet's 1-10 scale: 7-10 nominal, 6 Watch, 4-5 Warning, <=3 Act
    ("mood", 7, "green"), ("mood", 6.9, "yellow"), ("mood", 6, "yellow"), ("mood", 5.9, "orange"),
    ("mood", 3.01, "orange"), ("mood", 3, "red"),
    # RULE-09 water and calories
    ("hydration_l", 2.0, "green"), ("hydration_l", 1.99, "yellow"), ("hydration_l", 1.5, "yellow"),
    ("hydration_l", 1.49, "orange"), ("hydration_l", 0, "orange"),
    ("calories_pct", 80, "green"), ("calories_pct", 79.9, "yellow"), ("calories_pct", 65, "yellow"),
    ("calories_pct", 64.9, "orange"), ("calories_pct", 50, "orange"), ("calories_pct", 49.9, "red"),
    # RULE-13 exercise: 85 % of the 30-min plan
    ("exercise_min_7d", 25.5, "green"), ("exercise_min_7d", 25.4, "yellow"), ("exercise_min_7d", 0, "yellow"),
    # RULE-17 CO2 in mmHg: Watch >= 2.0, Warning > 3.0, never Act from a number
    ("co2_mmhg", 1.99, "green"), ("co2_mmhg", 2.0, "yellow"), ("co2_mmhg", 3.0, "yellow"), ("co2_mmhg", 3.01, "orange"),
    ("co2_mmhg", 20, "orange"),
    # RULE-16 radiation: 1 mSv/day DEMO limit = Watch, never Act from a dose
    ("radiation_msv", 1.0, "green"), ("radiation_msv", 1.01, "yellow"), ("radiation_msv", 100, "yellow"),
    # breathing rate (team default): Watch >20, Warning >24, Act >30 or <8
    ("rr", 7.9, "red"), ("rr", 8, "green"), ("rr", 20, "green"), ("rr", 20.1, "yellow"), ("rr", 24, "yellow"),
    ("rr", 24.1, "orange"), ("rr", 30, "orange"), ("rr", 30.1, "red"),
]


@pytest.mark.parametrize("metric,value,expected", EDGES)
def test_band_edges_both_sides(metric, value, expected):
    assert judge(value, T()[metric]) == expected


def test_every_judged_band_edge_is_covered_by_the_table():
    covered = {(m, v) for m, v, _ in EDGES}
    for metric in {m for m, _, _ in EDGES}:
        for level in ("yellow", "orange", "red"):
            for edge in T()[metric].get(level) or []:
                if edge is not None:
                    assert any(m == metric and abs(v - edge) < 0.02 for m, v in covered), (metric, level, edge)


def test_co2_ppm_is_derived_from_mmhg():
    mm, ppm = T()["co2_mmhg"], T()["co2_ppm"]
    assert ppm["derived_from"] == "co2_mmhg" and ppm["yellow"][1] == round(2.0 / 760 * 1e6) == 2632
    assert ppm["orange"][1] == 3947 and ppm["inclusive"] == mm["inclusive"] and not ppm.get("red")


# ---------- requires_symptoms ----------

@pytest.mark.parametrize("metric,value", [("bp_sys", 181), ("bp_dia", 121), ("irregular", 1)])
def test_requires_symptoms_rules_fire_only_with_a_symptom(metric, value):
    assert T()[metric]["requires_symptoms"]
    assert judge(value, T()[metric]) != "red"
    assert judge(value, T()[metric], symptoms=True) == "red"


def test_symptom_logged_is_act_now_and_unlocks_irregular(client):
    frame = {"hr": 80, "hrv_rmssd": 40, "spo2": 97, "rr": 14, "signal_quality": 0.95, "irregular": True}
    assert alerts.check_frame("C", frame, now=0) == []
    client.post("/api/forms", json={"persona": "C", "kind": "symptoms", "data": {"symptoms": ["headache"]}})
    assert alerts.check_frame("C", frame, now=1) == []  # not a red-flag symptom
    client.post("/api/forms", json={"persona": "C", "kind": "mood", "data": {"mood": 5, "symptoms": ["chest_pain"]}})
    symptom = [a for a in client.get("/api/alerts?persona=C").json() if a["metric"] == "symptom:chest_pain"]
    assert symptom and symptom[0]["level"] == "red" and symptom[0]["region"] == "heart"
    assert {a["metric"] for a in alerts.check_frame("C", frame, now=2)} == {"irregular"}


def test_daily_bp_above_180_is_act_now_only_with_a_symptom():
    a = store.persona("A")
    high = {**a, "daily": a["daily"][:-1] + [{**a["daily"][-1], "bp_sys": 190, "bp_dia": 125}]}
    cfg = (T(), store.regions(), store.escalation())
    heart = lambda rows: next(r for r in rows if r["region"] == "heart")["status"]  # noqa: E731
    assert heart(region_statuses(high, *cfg)) == "orange"
    assert heart(region_statuses(high, *cfg, active_symptoms=["chest_pain"])) == "red"


# ---------- no Act now from HRV, reaction test, exercise or a dose number alone ----------

def days(metric, values, **extra):
    return [{"day": i + 1, metric: v, **extra} for i, v in enumerate(values)]


@pytest.mark.parametrize("metric", ["hrv_rmssd", "pvt_median_ms", "pvt_lapse_rate_pct", "exercise_min_7d",
                                    "radiation_msv", "radiation_total_msv", "co2_mmhg"])
def test_never_act_now_alone(metric):
    entry = T()[metric]
    assert not entry.get("red")
    for value in (0, 0.001, 1e6):
        assert judge(value, entry, symptoms=True) != "red"
        assert daily_level(days(metric, [value] * 10), metric, entry, base=50, symptoms=True)[0] != "red"


def test_hrv_is_a_trend_rule_watch_then_warning():
    entry = T()["hrv_rmssd"]
    base = 50.0
    assert daily_level(days("hrv_rmssd", [50] * 10 + [41]), "hrv_rmssd", entry, base)[0] == "green"  # 18 % below
    assert daily_level(days("hrv_rmssd", [50] * 10 + [39]), "hrv_rmssd", entry, base)[0] == "yellow"  # 22 % below
    assert daily_level(days("hrv_rmssd", [50] * 10 + [39, 39, 39]), "hrv_rmssd", entry, base)[0] == "orange"


def test_exercise_missed_two_days_is_plan_review_not_act_now():
    entry = T()["exercise_min_7d"]
    d = [{"day": i, "exercise_min": 40, "exercise_min_7d": 40} for i in range(1, 9)]
    d += [{"day": 9, "exercise_min": 0, "exercise_min_7d": 34}, {"day": 10, "exercise_min": 0, "exercise_min_7d": 29}]
    status, note = daily_level(d, "exercise_min_7d", entry)
    assert status == "orange" and "review the plan" in note


# ---------- day rules ----------

@pytest.mark.parametrize("metric,low", [("sleep_h", 5.5), ("hydration_l", 1.8)])
def test_one_bad_day_is_not_enough(metric, low):
    entry = T()[metric]
    assert daily_level(days(metric, [8] * 5 + [low]), metric, entry)[0] == "green"
    assert daily_level(days(metric, [8] * 5 + [low, low]), metric, entry)[0] == "yellow"


def test_sleep_act_now_needs_two_nights_under_4_h():
    entry = T()["sleep_h"]
    assert daily_level(days("sleep_h", [7, 7, 3.5]), "sleep_h", entry)[0] == "green"  # one night only
    assert daily_level(days("sleep_h", [7, 3.5, 3.5]), "sleep_h", entry)[0] == "red"


def test_resting_hr_baseline_rise_and_three_day_warning():
    entry = T()["hr_rest"]
    assert daily_level(days("hr_rest", [62.5] * 5 + [72.5]), "hr_rest", entry, 62.5)[0] == "green"  # +10.0
    assert daily_level(days("hr_rest", [62.5] * 5 + [72.6]), "hr_rest", entry, 62.5)[0] == "yellow"  # +10.1
    assert daily_level(days("hr_rest", [62.5] * 5 + [46]), "hr_rest", entry, 62.5)[0] == "orange"  # absolute <50
    assert daily_level(days("hr_rest", [62.5] * 2 + [73, 73, 73]), "hr_rest", entry, 62.5)[0] == "orange"  # 3 days


def test_mood_daily_check_is_doubled_onto_the_sheets_scale():
    entry = T()["mood"]
    first = days("mood", [4] * 14)
    base = usual(first, entry)
    assert base == 8
    assert daily_level(first + days("mood", [3, 3]), "mood", entry, base)[0] == "green"  # 6/10 for 2 days
    assert daily_level(first + days("mood", [3, 3, 3]), "mood", entry, base)[0] == "yellow"
    assert daily_level(first + days("mood", [2, 2, 2]), "mood", entry, base)[0] == "orange"
    assert daily_level(first + days("mood", [1]), "mood", entry, base)[0] == "red"  # 2/10 <= 3


# ---------- poor signal ----------

def test_poor_signal_never_escalates():
    poor = T()["signal_quality"]["red"][0] - 0.01
    frame = {"hr": 200, "hrv_rmssd": 5, "spo2": 70, "rr": 40, "signal_quality": poor, "irregular": True}
    assert alerts.red_vitals(frame, T(), symptoms=True) == []
    for now in (0, 30, 60):
        assert alerts.check_frame("C", frame, now=now) == []


# ---------- personas (demo scenarios) ----------

def test_scenarios_normal_day_slow_drift_acute():
    cfg = (T(), store.regions(), store.escalation())
    assert all(r["status"] == "green" for r in region_statuses(store.persona("A"), *cfg))  # normal day: all nominal
    b = {r["region"]: r for r in region_statuses(store.persona("B"), *cfg)}
    assert b["heart"]["metric_status"]["hr_rest"] == "yellow"  # 73.1 vs usual 62.5 (+10.6): Watch
    assert b["heart"]["status"] in ("yellow", "orange") and b["brain_mood"]["status"] in ("yellow", "orange")
    c = store.persona("C")["stream"]
    act = [i for i, f in enumerate(c) if alerts.red_vitals(f, T()) and "hr" in alerts.red_vitals(f, T())]
    assert act and c[act[0]]["hr"] > 120 and c[act[0]]["signal_quality"] >= 0.6  # RULE-01 in the acute event


def test_rule_fields_come_from_the_sheet():
    th = T()
    for metric, rule in (("hr_rest", "RULE-01"), ("spo2", "RULE-03"), ("glucose_mmol", "RULE-08"), ("co2_mmhg", "RULE-17")):
        entry = th[metric]
        assert entry["rule_id"] == rule and entry["ref_ids"] and entry["actions"]["watch"] and entry["actions"]["act"]
        assert entry["evidence_status"] == "Mixed / proposed" and entry["validation_status"] == "Not clinically validated"
    assert th["glucose_mmol"]["sheet"]["rationale"].startswith("Differentiates Level 1 hypoglycemia")  # RULE-08 fix
    assert th["hr_rest"]["demo_only"] and th["radiation_msv"]["demo_only"] and not th["spo2"]["demo_only"]
    assert th["red_flags"]["pulse_lost"]["source"] == "team-default"
    refs = {r["id"] for r in json.loads((store.DATA_DIR / "references.json").read_text())["references"]}
    for entry in th.values():
        if isinstance(entry, dict) and entry.get("ref_ids"):
            assert set(entry["ref_ids"]) <= refs
