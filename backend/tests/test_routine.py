"""Daily routine: temperature / glucose / reaction test in the check, forms, missions, schedule."""
from app import db, store


def frames(pid, start, count):
    return store.persona(pid)["stream"][start: start + count]


def region(client, pid, rid):
    return next(r for r in client.get(f"/api/status?persona={pid}").json() if r["region"] == rid)


def form(client, pid, kind, data):
    return client.post("/api/forms", json={"persona": pid, "kind": kind, "data": data})


PVT_OK = {"median_ms": 262, "lapses": 1, "false_starts": 0, "n": 22, "duration_s": 180, "version": "full"}


def test_personas_have_reaction_test_values():
    a, b = store.persona("A")["daily"], store.persona("B")["daily"]
    assert all("pvt_median_ms" in d and "pvt_lapses" in d for d in a + b)
    assert b[-1]["pvt_median_ms"] > b[0]["pvt_median_ms"] + 60  # B gets slower over time
    assert store.persona("B")["body_mass_start_kg"] > 0


def test_check_with_temperature_glucose_and_reaction_test(client):
    body = {"persona": "A", "seated_frames": frames("A", 0, 120), "stand_frames": [], "answers": {"vision": 1},
            "temp_c": 38.6, "glucose_mmol": 11.2, "pvt": PVT_OK}
    result = client.post("/api/check", json=body).json()
    assert result["summary"]["temp_c"] == 38.6 and result["summary"]["pvt"]["median_ms"] == 262
    after = {r["region"]: r["status"] for r in result["after"]}
    assert after["immune"] != "green"  # fever feeds immune
    assert after["metabolism"] != "green"  # high glucose feeds metabolism
    rows = {c["metric"]: c for c in result["comparison"]}
    assert rows["temp_c"]["baseline"] is None and "no baseline yet" in rows["temp_c"]["text"]
    assert rows["pvt_median_ms"]["baseline"] is not None
    saved = db.query("SELECT answers FROM daily_checks WHERE persona = 'A'")[0]["answers"]
    assert saved["temp_c"] == 38.6 and saved["questions"]["vision"] == 1 and saved["pvt"]["n"] == 22
    assert client.post("/api/check", json={**body, "temp_c": 50}).status_code == 422  # typing-mistake limit


def test_sans_question_is_optional_and_in_brain_mood():
    q = next(x for x in store.questionnaire()["questions"] if x["id"] == "vision")
    assert q["optional"] and q["region"] == "brain_mood" and "eyesight" in q["text"]


def test_water_from_meals_feeds_hydration_and_missions(client):
    assert region(client, "A", "metabolism")["status"] == "green"
    form(client, "A", "meal", {"meal_type": "breakfast", "size": "normal", "water_l": 0.4})
    daily = client.get("/api/persona/A/daily").json()
    assert daily[-1]["hydration_l"] == 0.4 and daily[-1].get("today")
    assert region(client, "A", "metabolism")["status"] != "green"  # 0.4 L is below the watch level
    missions = {m["id"]: m for m in client.get("/api/missions?persona=A").json()["missions"]}
    assert not missions["water"]["done"] and missions["water"]["detail"] == "0.4 of 2 L"
    form(client, "A", "meal", {"meal_type": "lunch", "water_l": 1.7})
    missions = {m["id"]: m for m in client.get("/api/missions?persona=A").json()["missions"]}
    assert missions["water"]["done"] and missions["meals"]["done"] and not missions["daily_check"]["done"]


def test_exercise_and_body_mass_feed_regions(client):
    form(client, "A", "exercise", {"minutes": 45, "type": "treadmill"})
    assert client.get("/api/persona/A/daily").json()[-1]["exercise_min"] == 45
    start = store.persona("A")["body_mass_start_kg"]
    form(client, "A", "biomarkers", {"body_mass_kg": round(start * 0.95, 1)})
    last = client.get("/api/persona/A/daily").json()[-1]
    assert -5.1 < last["body_mass_change_pct"] < -4.9
    assert region(client, "A", "metabolism")["status"] != "green"  # 5 % loss


def test_known_forms_are_validated(client):
    assert form(client, "A", "meal", {"meal_type": "brunch"}).status_code == 422
    assert form(client, "A", "biomarkers", {"body_mass_kg": 5}).status_code == 422
    assert form(client, "A", "anything", {"free": "text"}).status_code == 200  # unknown kinds stay generic


def test_standalone_reaction_test_feeds_brain(client):
    form(client, "A", "pvt", {**PVT_OK, "median_ms": 420, "lapses": 7, "version": "demo", "duration_s": 60})
    brain = region(client, "A", "brain_mood")
    assert brain["status"] != "green"


def test_daily_check_mission_and_streak(client):
    client.post("/api/check", json={"persona": "B", "seated_frames": frames("B", 0, 120), "stand_frames": [], "answers": {}})
    data = client.get("/api/missions?persona=B").json()
    check = next(m for m in data["missions"] if m["id"] == "daily_check")
    assert check["done"] and check["detail"].startswith("Done at")
    assert data["streak"]["current"] == 1 and data["targets"]["water_l"] > 0


def test_reminder_schedule_in_environments(client):
    served = client.get("/api/environments").json()  # the API must not drop the schedule
    assert all(e["schedule"] and e["sleep"] for e in served)
    for env in store.environments():
        times = [s["time"] for s in env["schedule"]]
        assert "07:30" in times and times == sorted(times)
        assert {s["mission"] for s in env["schedule"]} <= {"daily_check", "meals", "water", "exercise"}
