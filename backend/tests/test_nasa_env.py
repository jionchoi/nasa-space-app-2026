"""Nov 14: real NASA OSDR data. RadLab dose rate per location, EDA ISS cabin telemetry, converter safety checks."""
import importlib.util
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app import radiation_feed, store

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "import_nasa_env.py"
spec = importlib.util.spec_from_file_location("import_nasa_env", SCRIPT)
conv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(conv)


def feed(client, env):
    return client.get(f"/api/radiation?persona=A&env={env}").json()["feed"]


# ---------- radiation by location ----------

def test_iss_replays_real_dostel1_with_saa_spikes(client):
    f = feed(client, "iss")
    assert f["kind"] == "real" and f["badge"] == "NASA OSDR RadLab: ISS module (DOSTEL1)"
    assert f["unit"] == "µGy/h" and f["replay_label"].endswith("days of real data, repeated")
    assert len(f["last_24h"]) == 288 and len(f["daily_mgy"]) == 30
    rates = [p["dose_rate"] for p in f["last_24h"]]
    assert max(rates) > 20 * sorted(rates)[len(rates) // 2]  # South Atlantic Anomaly passes stand out


def test_each_location_only_reads_its_own_feed(client):
    """Never show ISS readings under another location's label."""
    assert feed(client, "rover:mars")["badge"] == "NASA OSDR RadLab: Mars surface (Curiosity RAD)"
    for env in ("moon", "rover:moon", "mars"):
        f = feed(client, env)
        assert f["kind"] == "estimated" and f["badge"] == "Estimated from published data" and f["draft"], env
        assert "ISS" not in f["badge"] and not f["last_24h"], env
    for env in ("moon", "mars", "rover:moon", "rover:mars"):
        assert "dose_iss" not in (radiation_feed.feed_config(env) or {}).get("file", ""), env


def test_donki_replay_still_on_top_of_every_feed(client):
    client.post("/api/radiation/replay", json={"action": "start", "minutes": 5})
    try:
        for env in ("iss", "moon", "rover:mars"):
            data = client.get(f"/api/radiation?persona=A&env={env}").json()
            assert data["event"] and data["feed"], env
    finally:
        client.post("/api/radiation/replay", json={"action": "stop"})


def test_missing_files_fall_back(client, temp_data):
    temp_data("labels.json", lambda d: None)  # make the private copy
    (store.DATA_DIR / "space_weather" / "dose_iss.json").unlink()
    (store.DATA_DIR / "space_weather" / "dose_mars_surface.json").unlink()
    assert feed(client, "iss") is None  # the card shows the old simulated persona dose only
    mars = feed(client, "rover:mars")
    assert mars["kind"] == "estimated" and mars["dose_rate_now"] == store.thresholds()["dose_estimates"]["mars_surface"]["dose_rate"]


def test_cabin_falls_back_to_simulated(client, temp_data):
    temp_data("labels.json", lambda d: None)
    (store.DATA_DIR / "cabin.json").unlink()
    cabin = client.get("/api/cabin").json()
    assert cabin["simulated"] and cabin["kind"] == "simulated" and "noise_dba" in cabin["now"]


def test_cabin_badge_and_location_note(client):
    cabin = client.get("/api/cabin").json()
    assert cabin["badge"] == "NASA OSDR: ISS cabin telemetry (RR-23 / SpaceX-21)"
    assert "every location" in cabin["location_note"] and cabin["units"]["co2_ppm"] == "ppm"


def test_replay_follows_the_clock():
    a = radiation_feed.summary("iss", datetime(2026, 11, 14, 10, 0, tzinfo=timezone.utc))
    b = radiation_feed.summary("iss", datetime(2026, 11, 14, 10, 0, 59, tzinfo=timezone.utc))
    assert a["measured_at"] == b["measured_at"] and a["measured_at"][11:16] == "10:00"


# ---------- converter ----------

def write_csv(path, rows, header="timestamp,instrument_id,absorbed_dose_rate,instrument,module,spacecraft"):
    path.write_text(header + "\n" + "\n".join(rows) + "\n", encoding="utf-8")
    return path


def day_rows(instrument_id, spacecraft, rate=2.0):
    return [f'"2024-03-01T{h:02d}:{m:02d}:00","{instrument_id}",{rate},"{instrument_id}",,"{spacecraft}"'
            for h in range(24) for m in range(0, 60, 5)]


def test_converter_routes_by_content_not_file_name(tmp_path):
    data = conv.import_radlab(write_csv(tmp_path / "radlab_moon.csv", day_rows("MSL-RAD-Surface", "Curiosity")), 30)
    assert data["location"] == "mars_surface" and data["window"]["days"] == 1
    assert data["daily_mgy"] == [pytest.approx(0.048)]  # 2 µGy/h * 24 h
    assert data["points"][-1]["accumulated_dose"] == pytest.approx(48.0)


def test_converter_stops_on_unknown_instrument_or_unit(tmp_path):
    with pytest.raises(conv.Stop, match="not mapped"):
        conv.import_radlab(write_csv(tmp_path / "a.csv", day_rows("Mystery", "Probe")), 30)
    header = "timestamp,instrument_id,absorbed_dose_rate_mGy_per_day,instrument,module,spacecraft"
    with pytest.raises(conv.Stop, match="unit other than"):
        conv.import_radlab(write_csv(tmp_path / "b.csv", day_rows("DosTel1", "ISS"), header), 30)


def test_sources_page_lists_both_nasa_sources(client):
    sources = {s["id"]: s for s in client.get("/api/sources").json()["sources"]}
    assert {"radlab_dostel1", "radlab_msl_rad", "eda_cabin"} <= set(sources)
    assert sources["eda_cabin"]["badge"] == client.get("/api/cabin").json()["badge"]
    assert sources["radlab_dostel1"]["badge"] == feed(client, "iss")["badge"]


# ---------- DONKI solar event per location ----------

def test_solar_event_is_real_donki_with_simulated_dose():
    cfg = store.space_event()
    assert cfg["event"]["sep_id"] == "2024-05-10T13:35:00-SEP-001"
    assert cfg["event"]["link"].startswith("https://ccmc.gsfc.nasa.gov/DONKI/")
    assert cfg["dose_note"] == "dose simulated; timing from real DONKI event" and cfg["simulated_dose"]
    saved = {s["sepID"] for s in store.load("space_weather/" + cfg["source"]["file"])["sep"]}
    assert cfg["event"]["sep_id"] in saved  # built from the saved DONKI file


def test_solar_event_replay_hits_every_location_harder_than_iss(client):
    client.post("/api/radiation/replay", json={"action": "start", "minutes": 5})
    try:
        events = {env: client.get(f"/api/radiation?persona=A&env={env}").json()["event"]
                  for env in ("iss", "moon", "mars", "rover:moon", "rover:mars")}
        assert all(events.values())
        iss = events["iss"]
        assert iss["location_scale"] == 1 and iss["dose_note"].startswith("dose simulated")
        for env in ("moon", "mars", "rover:moon", "rover:mars"):
            assert events[env]["location_scale"] > 1 and events[env]["location_reason"], env
        assert events["mars"]["location_scale"] == max(e["location_scale"] for e in events.values())
        for env in ("iss", "mars", "rover:mars"):
            row = next(r for r in client.get(f"/api/status?persona=A&env={env}").json() if r["region"] == "radiation")
            assert row["status"] == "red" and ("times the ISS" in row["reason"]) == (env != "iss"), env
    finally:
        client.post("/api/radiation/replay", json={"action": "stop"})


def test_every_source_has_agency_use_locations_and_status(client):
    data = client.get("/api/sources").json()
    allowed = set(data["uses"])
    assert allowed == {"replay", "test", "thresholds", "reference"}
    ids = {s["id"] for s in data["sources"]}
    assert {"radlab_dostel1", "eda_cabin", "donki", "osd575", "pret_pvt", "physionet_bidmc", "physionet_challenge_2015",
            "nasa_hrp", "nasa_standard_measures", "csa_deep_space_healthcare"} <= ids
    for s in data["sources"]:
        assert s["name"] and s["agency"] and s["locations"], s["id"]
        assert s["use"] and set(s["use"]) <= allowed, s["id"]
        assert s["status"] in ("real", "simulated", "estimated"), s["id"]
    jian = [s for s in data["sources"] if s["id"].startswith("physionet")]
    assert all(s["validation"]["value"] == "TO FILL IN" for s in jian)  # placeholders until Jian adds his numbers
