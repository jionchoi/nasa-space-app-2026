from app import store


def frames(pid, start, count, hr_add=0):
    out = []
    for f in store.persona(pid)["stream"][start: start + count]:
        out.append({**f, "hr": f["hr"] + hr_add})
    return out


ANSWERS = {"sleep_h": 5.5, "sleep_quality": 2, "mood": 2, "stress": 4, "headache": 1,
           "nausea_appetite": 1, "cough_sore_throat_fever": 4, "muscle_back_pain": 1}


def post(client, pid, **extra):
    body = {"persona": pid, "seated_frames": frames(pid, 0, 120),
            "stand_frames": frames(pid, 120, 60, hr_add=28), "answers": ANSWERS, **extra}
    res = client.post("/api/check?env=mars", json=body)
    assert res.status_code == 200, res.text
    return res.json()


def test_check_b_heart_not_green(client):
    result = post(client, "B")
    heart = next(r for r in result["after"] if r["region"] == "heart")
    assert heart["status"] != "green"
    assert result["day"] == 31
    assert 70 <= result["summary"]["hr_rest"] <= 78
    assert 24 <= result["summary"]["stand_hr_rise"] <= 34
    hr = next(c for c in result["comparison"] if c["metric"] == "hr_rest")
    assert "above your usual" in hr["text"] and hr["text"].startswith("Resting heart rate")
    assert result["advice"]["level"] in ("surgeon_next", "surgeon_now") and result["advice"]["text"]


def test_check_appends_in_memory_only(client):
    post(client, "B")
    post(client, "B")  # a second check replaces today's entry
    assert len(client.get("/api/persona/B/daily").json()) == 31
    assert len(store.load("personas/B.json")["daily"]) == 30
    client.post("/api/persona/B/reset")
    assert len(client.get("/api/persona/B/daily").json()) == 30


def test_check_answers_change_regions(client):
    result = post(client, "A")
    changed = {c["region"]: c for c in result["changed"]}
    assert changed["immune"]["from"] == "green" and changed["immune"]["to"] != "green"
    assert changed["brain_mood"]["to"] != "green"
    heart = next(r for r in result["after"] if r["region"] == "heart")
    assert heart["status"] != "green"  # +28 bpm on standing is above A's usual


def test_check_without_stand_frames_carries_forward(client):
    result = post(client, "A", stand_frames=[], answers={})
    assert result["summary"]["stand_hr_rise"] is None
    assert any("stand_hr_rise" in n for n in result["notes"])
    assert all(r["status"] == "green" for r in result["after"])


def test_check_needs_frames(client):
    assert client.post("/api/check", json={"persona": "A", "seated_frames": []}).status_code == 422
