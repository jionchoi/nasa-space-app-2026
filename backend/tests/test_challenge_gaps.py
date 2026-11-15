"""Nov 14: blood pressure in the daily check, guidance.json, measurements.json and the surface rover."""
from app import db, store
from app.models import Environment, Guidance, Measurements
from app.rules.escalation import advice_text

NOT_METRICS = ("red_flags", "daily_targets", "cv", "dose_estimates", "pvt", "plausible")


def frames(pid, start, count):
    return store.persona(pid)["stream"][start: start + count]


def check(client, pid="A", **extra):
    body = {"persona": pid, "seated_frames": frames(pid, 0, 120), "stand_frames": [], "answers": {}, **extra}
    return client.post("/api/check", json=body)


def threshold_metrics() -> list[str]:
    return [k for k, v in store.thresholds().items() if isinstance(v, dict) and k not in NOT_METRICS]


# ---------- 1) blood pressure ----------

def test_bp_saved_with_the_daily_check(client):
    result = check(client, bp_sys=124, bp_dia=79).json()
    assert result["summary"]["bp_sys"] == 124 and result["summary"]["bp_dia"] == 79
    rows = {c["metric"]: c for c in result["comparison"]}
    assert rows["bp_sys"]["unit"] == "mmHg" and rows["bp_sys"]["baseline"] is not None
    saved = db.query("SELECT entry, answers FROM daily_checks WHERE persona = 'A'")[0]
    assert saved["entry"]["bp_sys"] == 124 and saved["entry"]["bp_dia"] == 79
    assert saved["answers"]["bp_sys"] == 124
    last = client.get("/api/persona/A/daily").json()[-1]
    assert last["today"] and last["bp_sys"] == 124 and last["bp_dia"] == 79


def test_bp_judged_from_thresholds_file(client, temp_data):
    heart = lambda r: next(x for x in r["after"] if x["region"] == "heart")  # noqa: E731
    high = check(client, bp_sys=165, bp_dia=95).json()
    rows = {c["metric"]: c for c in high["comparison"]}
    assert rows["bp_sys"]["status"] == "orange" and rows["bp_dia"]["status"] == "orange"
    assert heart(high)["status"] == "orange"
    # Move the red limit in the file: the same reading is judged differently, no code change.
    temp_data("thresholds.json", lambda t: t["bp_sys"].update(red=[80, 160]))
    store.reset()
    again = {c["metric"]: c for c in check(client, bp_sys=165, bp_dia=95).json()["comparison"]}
    assert again["bp_sys"]["status"] == "red"


def test_bp_skip_and_typing_mistakes(client):
    assert check(client).status_code == 200  # skipped: both empty
    assert check(client, bp_sys=120).status_code == 422  # only one number
    assert check(client, bp_sys=300, bp_dia=80).status_code == 422  # outside 60-250
    assert check(client, bp_sys=120, bp_dia=20).status_code == 422  # outside 30-150
    assert check(client, bp_sys=80, bp_dia=90).status_code == 422  # bottom above top


def test_bp_in_heart_region_and_personas():
    heart = next(r for r in store.regions()["regions"] if r["id"] == "heart")
    assert {"bp_sys", "bp_dia"} <= set(heart["metrics"])
    for pid in ("A", "B", "C"):
        assert all(isinstance(d.get("bp_sys"), int) and isinstance(d.get("bp_dia"), int) for d in store.persona(pid)["daily"])
    b = store.persona("B")["daily"]
    assert b[-1]["bp_sys"] > b[0]["bp_sys"] and b[-1]["bp_dia"] > b[0]["bp_dia"]  # slight upward drift
    limits = store.questionnaire()["entry_limits"]
    assert (limits["bp_sys"]["min"], limits["bp_sys"]["max"], limits["bp_dia"]["min"], limits["bp_dia"]["max"]) == (60, 250, 30, 150)


def test_biomarker_form_has_no_bp(client):
    r = client.post("/api/forms", json={"persona": "A", "kind": "biomarkers", "data": {"body_mass_kg": 70, "bp_sys": 120, "bp_dia": 80}})
    assert r.status_code == 200
    saved = db.query("SELECT data FROM forms WHERE kind = 'biomarkers'")[0]["data"]
    assert "bp_sys" not in saved and saved["body_mass_kg"] == 70


# ---------- 2) guidance.json ----------

def test_guidance_for_every_region_and_status(client):
    data = Guidance.model_validate(store.guidance())
    assert set(data.status_keys) == {"green", "yellow", "orange", "red"}
    for region in store.regions()["regions"]:
        by_status = data.regions[region["id"]]
        for key in data.status_keys.values():
            item = by_status[key]
            assert item.summary and item.self_care and item.tell_crew and item.contact_surgeon and item.prevention, (region["id"], key)
    assert client.get("/api/guidance").json()["regions"]["heart"]["watch"]["self_care"]


def test_self_care_ticks_are_a_validated_form(client):
    ok = client.post("/api/forms", json={"persona": "A", "kind": "self_care",
                                         "data": {"region": "heart", "status": "yellow", "ticked": ["Drink water"]}})
    assert ok.status_code == 200
    bad = client.post("/api/forms", json={"persona": "A", "kind": "self_care", "data": {"region": "heart", "status": "purple"}})
    assert bad.status_code == 422
    rows = client.get("/api/forms?persona=A&kind=self_care").json()
    assert rows[0]["data"]["ticked"] == ["Drink water"]


# ---------- 3) measurements.json and region functions ----------

def test_measurements_cover_every_threshold_metric(client):
    covered = Measurements.model_validate(store.measurements()).metrics
    missing = [m for m in threshold_metrics() if m not in covered]
    assert not missing, f"measurements.json is missing: {missing}"
    for key, info in covered.items():
        assert info.how_to_measure and info.why_check and info.can_do_in_space.note, key
    bp = covered["bp_sys"].how_to_measure
    assert any("upper arm" in s for s in bp) and any("heart level" in s or "level of your heart" in s for s in bp)
    assert client.get("/api/measurements").json()["metrics"]["spo2"]["why_check"]


def test_every_region_says_what_it_does():
    for region in store.regions()["regions"]:
        assert region.get("function"), region["id"]


# ---------- 4) surface rover ----------

def test_rover_loads_with_both_planets(client):
    served = {e["id"]: e for e in client.get("/api/environments").json()}
    assert list(served) == ["iss", "moon", "mars", "rover"]
    rover = Environment.model_validate(served["rover"])
    assert set(rover.planets) == {"moon", "mars"} and rover.medical_kit == "limited" and rover.distance_to_base
    # Dose follows the planet (app/radiation_feed.py); cabin is the real ISS replay everywhere (Nov 14).
    assert rover.planets["moon"].radiation_feed["estimate"] == "moon_surface"
    assert rover.planets["mars"].radiation_feed["file"].endswith("dose_mars_surface.json")

    moon, mars = store.environment("rover:moon"), store.environment("rover:mars")
    assert moon["delay_s"] == store.environment("moon")["delay_s"]
    assert mars["delay_s"] == store.environment("mars")["delay_s"]
    assert store.environment("rover")["planet"] == rover.planet  # no planet given: the default
    assert client.get("/api/environments/rover:mars").json()["planet"] == "mars"
    assert client.get("/api/environments/nowhere").status_code == 404


def test_rover_delay_and_advice_follow_the_planet(client):
    esc = store.escalation()
    assert client.get("/api/delivery/rover:moon").json()["delay_s"] == client.get("/api/delivery/moon").json()["delay_s"]
    mars = client.get("/api/delivery/rover:mars").json()
    assert mars["delay_s"] > 60 and mars["status_text"] == client.get("/api/delivery/mars").json()["status_text"]
    # Advice text per environment stays as it is: the rover uses its planet's text.
    assert advice_text("surgeon_now", "rover:mars", esc) == advice_text("surgeon_now", "mars", esc)
    assert advice_text("surgeon_now", "rover:moon", esc) == advice_text("surgeon_now", "moon", esc)
    step = esc["extra_steps"]["rover"][0]
    assert step["label"] == "Return to base" and step["after"] == "crew"


def test_rover_message_and_radiation(client):
    sent = client.post("/api/messages", json={"persona": "A", "env": "rover:mars", "text": "Test", "status": "sent"}).json()
    assert sent["delay_s"] > 60
    assert client.get("/api/radiation?persona=A&env=rover:moon").status_code == 200


def test_protocol_equipment_has_rover_kit_notes(client):
    notes = store.environment("rover")["kit_notes"]
    for pid in ("chest_pain", "unresponsive"):
        steps = client.get(f"/api/protocols/{pid}").json()["steps"]
        used = {e for s in steps for e in s.get("equipment", [])}
        assert used, pid
        assert used <= set(notes), f"{pid}: no kit note for {used - set(notes)}"
