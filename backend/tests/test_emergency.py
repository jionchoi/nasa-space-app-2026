"""Emergency mode: red-flag routes in protocols, unresponsive-detection pre-answer key, saved emergency logs."""
import pytest

from app import store
from app.models import Protocol, RedFlagDef

PROTOCOLS = ["chest_pain", "unresponsive"]


def red_flag_defs():
    return {k: v for k, v in store.thresholds()["red_flags"].items() if not k.startswith("_")}


def test_red_flags_are_defined_in_thresholds():
    defs = red_flag_defs()
    assert {"pulse_lost", "hr_very_low", "hr_very_high", "spo2_critical"} <= defs.keys()
    for name, d in defs.items():
        flag = RedFlagDef.model_validate(d)
        assert (flag.below is None) != (flag.above is None), name  # exactly one limit
        assert isinstance(store.thresholds().get(flag.metric), dict), name  # a known metric


@pytest.mark.parametrize("pid", PROTOCOLS)
def test_protocol_routes_point_to_real_flags_and_steps(client, pid):
    protocol = Protocol.model_validate(client.get(f"/api/protocols/{pid}").json())
    steps = {s.n for s in protocol.steps}
    assert protocol.red_flag_routes, "each protocol has placeholder routes"
    for route in protocol.red_flag_routes:
        assert route.flag in red_flag_defs()
        assert route.goto == "cpr" or route.goto in steps
    for step in protocol.steps:  # YES/NO routing stays valid after renumbering
        for target in (step.on_yes, step.on_no):
            assert target in (None, "next", "cpr") or target in steps, (pid, step.n, target)
    by_flag = {r.flag: r for r in protocol.red_flag_routes}
    assert by_flag["pulse_lost"].goto == "cpr"
    oxygen = next(s for s in protocol.steps if s.key == "oxygen")
    assert by_flag["spo2_critical"].goto == oxygen.n


def test_unresponsive_starts_with_the_responsive_question():
    first = store.protocol("unresponsive")["steps"][0]
    assert first["n"] == 1 and first["key"] == "responsive" and first["check"] and first["on_no"] == "next"


def test_emergency_log_saved_with_answers_and_messages(client):
    body = {
        "persona": "C", "protocol": "unresponsive", "title": "Crew member not responding", "trigger": "cv",
        "started": "2026-11-14T10:00:00Z", "ended": "2026-11-14T10:07:30Z", "duration_s": 450,
        "log": [{"t": "2026-11-14T10:00:00Z", "kind": "answer", "text": 'Step 1: "Does the crew member respond?" NO (answered by unresponsive detection)'}],
        "answers": {"1": {"question": "Does the crew member respond?", "answer": "no", "by": "unresponsive detection"}},
        "messages": [{"id": "m1", "text": "URGENT", "status": "sent", "sent_at": "2026-11-14T10:03:00Z"}],
    }
    saved = client.post("/api/emergency-logs", json=body).json()
    assert saved["link"] == f"/emergency/log/{saved['id']}"
    log = client.get(f"/api/emergency-logs/{saved['id']}").json()
    assert log["answers"]["1"]["by"] == "unresponsive detection" and log["messages"][0]["id"] == "m1"
    assert log["trigger"] == "cv" and log["duration_s"] == 450
    alert = next(a for a in client.get("/api/alerts?persona=C").json() if a["source"] == "emergency")
    assert alert["link"] == saved["link"] and alert["message"].startswith("Emergency handled at")
    assert client.get("/api/emergency-logs/9999").status_code == 404
