from app import store
from app.models import Persona, RegionStatus
from app.ppg import adapter
from app.rules.live import frame_status
from app.rules.status import region_statuses


def by_region(rows):
    return {r["region"]: r for r in rows}


def test_persona_files_match_models():
    for pid in ("A", "B", "C"):
        persona = Persona.model_validate(store.persona(pid))
        assert persona.simulated is True
        assert len(persona.daily) == 30
        assert len(persona.stream) == 600
    c = store.persona("C")
    assert c["event_start_s"] == 180 and c["unresponsive_s"] == 480


def test_a_is_all_green(cfg):
    rows = region_statuses(store.persona("A"), *cfg)
    assert len(rows) == 7
    for row in rows:
        RegionStatus.model_validate(row)
        assert row["status"] == "green", row
        assert row["advice_level"] == "self"


def test_b_drifts_to_orange_with_warning_before(cfg):
    b = store.persona("B")
    day30 = by_region(region_statuses(b, *cfg))
    assert day30["heart"]["status"] == "orange"
    assert day30["brain_mood"]["status"] == "orange"
    assert day30["heart"]["advice_level"] == "surgeon_next"

    day10 = by_region(region_statuses(b, *cfg, as_of_day=10))
    assert day10["heart"]["status"] == "green"

    day21 = by_region(region_statuses(b, *cfg, as_of_day=21))
    assert day21["heart"]["status"] == "yellow"


def test_b_crossing_days(cfg):
    b = store.persona("B")
    heart = [by_region(region_statuses(b, *cfg, as_of_day=d))["heart"]["status"] for d in range(1, 31)]
    first_yellow = heart.index("yellow") + 1
    first_orange = heart.index("orange") + 1
    # Sheet rules (Nov 15): Watch from the standing rise / HRV 20 % below usual, Warning after 3 days of HRV Watch.
    assert 17 <= first_yellow <= 21
    assert 22 <= first_orange <= 26


def test_c_stream_goes_red_only_after_event(cfg):
    thresholds, regions_cfg, _ = cfg
    c = store.persona("C")
    live = [frame_status(f, thresholds, regions_cfg)["regions"] for f in c["stream"]]
    before, after = live[: c["event_start_s"]], live[c["event_start_s"]:]
    assert all(s["heart"] != "red" and s["lungs"] != "red" for s in before)
    assert any(s["heart"] == "red" for s in after)
    assert any(s["lungs"] == "red" for s in after)
    assert all(f["signal_quality"] >= 0.8 for f in c["stream"])
    # daily data for C looks healthy
    assert all(r["status"] == "green" for r in region_statuses(c, *cfg))


def test_thresholds_are_not_hard_coded(cfg):
    thresholds, regions_cfg, escalation_cfg = cfg
    a = store.persona("A")
    changed = {**thresholds, "hr_rest": {**thresholds["hr_rest"], "red": [40, 50]}}
    rows = by_region(region_statuses(a, changed, regions_cfg, escalation_cfg))
    assert rows["heart"]["status"] == "red"
    assert rows["heart"]["advice_level"] == "surgeon_now"


def test_adapter_calls_compute_vitals_on_windows():
    calls = []

    def fake(signal, fs):
        calls.append(len(signal))
        return {"t": "", "hr": 60, "hrv_rmssd": 40, "spo2": 98, "rr": 14, "signal_quality": 0.9,
                "irregular": False, "source": "sensor"}

    frames = adapter.recording_to_stream([0.0] * (25 * 30), fs=25, compute=fake)
    assert len(frames) == 21 and set(calls) == {250}
    assert frames[0]["source"] == "replay"
