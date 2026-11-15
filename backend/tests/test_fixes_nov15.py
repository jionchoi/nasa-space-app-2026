"""Nov 15 fixes after the PPG review: frozen pre-flight baseline, plausibility limits, 4 s pulse-lost setting."""
import asyncio
from statistics import median

import pytest

from app import alerts, store
from app.rules import check as check_rules
from app.rules.judge import implausible
from app.signals.models import SessionRequest
from app.signals.runtime import Session


def frames(pid, start, count):
    return store.persona(pid)["stream"][start: start + count]


# ---------- baseline ("your usual") ----------

def test_baseline_is_the_first_14_days_and_frozen():
    daily, cfg = store.persona("B", original=True)["daily"], store.regions()
    assert cfg["baseline"]["first_days"] == 14
    first = check_rules.baseline_days(daily, cfg)
    assert [d["day"] for d in first] == list(range(1, 15))
    more = daily + [{**daily[-1], "day": 31 + i, "hr_rest": 99} for i in range(5)]
    assert check_rules.baseline_days(more, cfg) == first  # later days never move it


def test_daily_check_compares_with_the_pre_flight_baseline(client):
    body = {"persona": "B", "seated_frames": frames("B", 0, 120), "stand_frames": [], "answers": {}}
    rows = {r["metric"]: r for r in client.post("/api/check", json=body).json()["comparison"]}
    expected = round(median(d["hr_rest"] for d in store.persona("B", original=True)["daily"][:14]), 1)
    assert rows["hr_rest"]["baseline"] == expected
    assert 61 <= rows["hr_rest"]["baseline"] <= 63  # not the drifting 30-day median (~66.6)


# ---------- plausibility limits ----------

def test_plausible_limits_from_thresholds():
    th = store.thresholds()
    assert th["plausible"]["hr"] == [25, 220] and th["plausible"]["spo2"] == [None, 100]
    assert implausible("hr", 24, th) and implausible("hr", 221, th) and implausible("spo2", 101, th)
    assert not implausible("hr", 25, th) and not implausible("hr", 220, th) and not implausible("spo2", 100, th)


def test_implausible_live_vitals_never_raise_an_alert():
    th = store.thresholds()
    frame = {"hr": 300, "hrv_rmssd": 40, "spo2": 104, "rr": 14, "signal_quality": 0.95, "irregular": False}
    assert alerts.red_vitals(frame, th) == []
    assert "hr" in alerts.red_vitals({**frame, "hr": 150, "spo2": 98}, th)  # a plausible red value still alerts


def test_daily_check_leaves_implausible_frames_out(client):
    good = frames("A", 0, 120)
    bad = [{**f, "hr": 300} for f in good[:60]]
    body = {"persona": "A", "seated_frames": bad + good[60:], "stand_frames": [], "answers": {}}
    result = client.post("/api/check", json=body).json()
    assert result["summary"]["hr_rest"] < 100  # the 300 bpm frames were ignored
    all_bad = {"persona": "A", "seated_frames": bad, "stand_frames": [], "answers": {}}
    assert client.post("/api/check", json=all_bad).status_code == 422  # nothing usable: repeat the measurement


def test_signal_sessions_use_the_plausible_heart_rate_limits():
    async def scenario():
        s = Session(SessionRequest(subject_id="c", device_id="d", mode="measurement", input="ingest", source="live"))
        assert s.pipeline.pulse_range_bpm == (25.0, 220.0)
    asyncio.run(scenario())


# ---------- Demo pulse lost ----------

def test_pulse_lost_waits_four_seconds():
    assert store.thresholds()["cv"]["ppg"]["no_pulse_s"] == 4


@pytest.mark.parametrize("protocol", ["unresponsive"])
def test_pulse_lost_route_to_cpr_keeps_its_countdown(client, protocol):
    routes = client.get(f"/api/protocols/{protocol}").json()["red_flag_routes"]
    route = next(r for r in routes if r["flag"] == "pulse_lost")
    assert route["goto"] == "cpr" and route.get("countdown_s", 5) == 5
