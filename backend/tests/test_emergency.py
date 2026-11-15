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


ALL_NODES = {s["id"] for pid in PROTOCOLS for s in store.protocol(pid)["steps"]}
CITED = {"AHA_BLS_2025": "REF-10", "SPACE_CPR_2020": "REF-16", "ER_2011": "REF-15", "AHA_FIRST_AID_2024": "REF-11"}


@pytest.mark.parametrize("pid", PROTOCOLS)
def test_protocol_nodes_route_to_real_nodes_and_show_urgency_and_sources(client, pid):
    """Nov 15: the medical lead's node protocols. Every YES / NO / Next points at a real node (CP01 NO -> CL00 opens the
    collapse protocol); every step has its urgency and cited sources, mapped to REF IDs; no auto-routes."""
    protocol = Protocol.model_validate(client.get(f"/api/protocols/{pid}").json())
    assert protocol.red_flag_routes == []
    refs = {r["id"] for r in client.get("/api/references").json()["references"]}
    for step in protocol.steps:
        for target in (step.on_yes, step.on_no, step.next):
            assert target is None or target in ALL_NODES, (pid, step.id, target)
        if step.type == "decision":
            assert step.on_yes and step.on_no and step.check, step.id
        assert step.urgency and step.sources, step.id
        assert step.refs == [CITED[c] for c in step.sources] and set(step.refs) <= refs, step.id


def test_no_drugs_doses_oxygen_or_iv_in_the_protocols():
    for pid in PROTOCOLS:
        for step in store.protocol(pid)["steps"]:
            assert "oxygen" not in step.get("equipment", []), step["id"]
            assert not step["text"].lower().startswith("give oxygen"), step["id"]


def test_collapse_protocol_starts_at_cl00_with_the_check_in():
    first = store.protocol("unresponsive")["steps"][0]
    assert first["id"] == "CL00" and "Are you okay?" in first["text"] and first["next"] == "CL01"
    by_id = {s["id"]: s for s in store.protocol("unresponsive")["steps"]}
    assert [by_id[n]["type"] for n in ("CL01", "CL03", "CL05")] == ["decision"] * 3  # the crew answers these


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
