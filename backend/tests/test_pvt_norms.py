"""Nov 14: reaction-test norms from the CSA PRET ground study and the DRAFT status rules built on them."""
from app import store
from app.rules.pvt import personal_status


def norms():
    return store.load("pvt_norms.json")


def test_norms_file_documents_source_and_rules(client):
    n = client.get("/api/pvt-norms").json()
    assert n["source"] == "CSA PRET dataset, version 4.0, ground study"
    assert n["licence"] == "Open Government Licence - Canada" and n["url"].startswith("https://donnees-data.asc-csa.gc.ca/")
    assert n["lapse_ms"] == 355 and "355" in n["lapse_rule"]
    assert n["n"] == len(n["distribution"]["median_rt_ms"]) == n["n_sessions"] - len(n["excluded"])
    assert 8034 in {e["subject"] for e in n["excluded"]}
    p = n["percentiles"]["median_rt_ms"]
    assert p["p50"] < p["p90"] < p["p97_5"]


def test_thresholds_use_the_percentiles_and_have_no_act_now():
    t, p = store.thresholds(), norms()["percentiles"]
    for metric, key in (("pvt_median_ms", "median_rt_ms"), ("pvt_lapse_rate_pct", "lapse_rate_pct")):
        assert t[metric]["yellow"][1] == p[key]["p90"] and t[metric]["orange"][1] == p[key]["p97_5"]
        assert not t[metric].get("red") and t[metric]["source"].startswith("DRAFT, from PRET, Yenna reviews")
    assert t["pvt"]["act_now"] is None and t["pvt"]["baseline_slower_pct"] == 15 and t["pvt"]["min_baseline_days"] == 7
    assert store.questionnaire()["pvt"]["lapse_ms"] == 355


def days(values):
    return [{"day": i + 1, "pvt_median_ms": v} for i, v in enumerate(values)]


def test_personal_baseline_needs_seven_days():
    t = store.thresholds()
    assert personal_status(days([250] * 7 + [300]), t)[0] == "yellow"  # 20 % slower than usual
    assert personal_status(days([250] * 7 + [280]), t) is None  # 12 % slower: within 15 %
    assert personal_status(days([250] * 6 + [300]), t) is None  # 6 days: population percentiles only


def test_warning_above_975th_percentile_never_act_now(client):
    p = norms()["percentiles"]["median_rt_ms"]
    client.post("/api/forms", json={"persona": "A", "kind": "pvt", "data": {
        "median_ms": p["p97_5"] + 100, "lapses": 1, "false_starts": 0, "n": 30, "duration_s": 180}})
    brain = next(r for r in client.get("/api/status?persona=A").json() if r["region"] == "brain_mood")
    assert brain["status"] == "orange"


def test_inside_bands_but_20pct_slower_is_watch_in_list_and_region(client):
    """The "All metrics" list reads metric_status; it must agree with the region (personal 15 % rule)."""
    from statistics import median
    p90 = norms()["percentiles"]["median_rt_ms"]["p90"]
    usual = median(d["pvt_median_ms"] for d in store.persona("A")["daily"][-30:])
    value = round(usual * 1.2)
    assert value < p90  # inside the population bands
    client.post("/api/forms", json={"persona": "A", "kind": "pvt", "data": {
        "median_ms": value, "lapses": 1, "false_starts": 0, "n": 30, "duration_s": 180}})
    brain = next(r for r in client.get("/api/status?persona=A").json() if r["region"] == "brain_mood")
    assert brain["metric_status"]["pvt_median_ms"] == "yellow"
    assert brain["status"] == "yellow" and "slower than your usual" in brain["reason"]
