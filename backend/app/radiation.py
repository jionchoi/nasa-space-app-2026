"""Radiation: daily dose, mission total and the replay of a real NASA DONKI solar particle event.

The event (data/space_weather/event.json, built once by scripts/fetch_donki.py) has real ids, times and links;
the dose-rate curve is SIMULATED. A demo control starts the replay; while it runs, the radiation region is "red"
(Act now), an alert says to go to the shielded area, and the advice depends on the environment.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone

from . import alerts, store
from .rules.judge import bounds, judge
from .rules.regions import derive_daily

_state: dict = {"started": None, "minutes": None}


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _curve_at(curve: list[dict], minute: float) -> float:
    for a, b in zip(curve, curve[1:]):
        if a["minute"] <= minute <= b["minute"]:
            u = (minute - a["minute"]) / max(b["minute"] - a["minute"], 1e-9)
            return a["msv_per_h"] + u * (b["msv_per_h"] - a["msv_per_h"])
    return curve[-1]["msv_per_h"] if curve else 0.0


def _dose_until(curve: list[dict], minute: float, step: float = 0.25) -> float:
    """mSv received from the start of the event until `minute` (trapezoid over the curve)."""
    total, m = 0.0, 0.0
    while m < minute:
        nxt = min(minute, m + step)
        total += (_curve_at(curve, m) + _curve_at(curve, nxt)) / 2 * (nxt - m) / 60
        m = nxt
    return total


def start(minutes: float | None = None) -> dict:
    """Start the replay (demo control). Creates the shelter alert for every crew member."""
    cfg = store.space_event()
    if cfg is None:
        raise FileNotFoundError("No data/space_weather/event.json. Run scripts/fetch_donki.py --build-event (needs internet once).")
    _state.update(started=time.time(), minutes=float(minutes or cfg["replay"]["duration_min"]))
    for pid in store.persona_ids():
        alerts.create(pid, "red", cfg["alert"], "rules", region="radiation", metric="radiation_total_msv")
    return active() or {}


def stop() -> None:
    _state.update(started=None, minutes=None)


def active(now: float | None = None) -> dict | None:
    """The running event, or None. Ends by itself when the replay time is over."""
    cfg = store.space_event()
    if cfg is None or _state["started"] is None:
        return None
    now = now or time.time()
    minutes = _state["minutes"]
    elapsed_min = (now - _state["started"]) / 60
    if elapsed_min >= minutes:
        stop()
        return None
    # The curve is defined over the event's own length; scale it if the demo uses a different length.
    curve_len = cfg["dose_curve"][-1]["minute"]
    curve_min = elapsed_min * curve_len / minutes
    ev = cfg["event"]
    return {
        "sep_id": ev["sep_id"], "sep_time": ev["sep_time"], "link": ev["link"], "instruments": ev.get("instruments", []),
        "flare": ev.get("flare"), "started_at": _iso(_state["started"]), "ends_at": _iso(_state["started"] + minutes * 60),
        "remaining_s": round((minutes - elapsed_min) * 60), "dose_rate_msv_h": round(_curve_at(cfg["dose_curve"], curve_min), 3),
        "event_dose_msv": round(_dose_until(cfg["dose_curve"], curve_min) * curve_len / minutes, 3),
        "alert": cfg["alert"], "simulated_dose": True, "note": cfg.get("_status", ""),
    }


def advice(env: str) -> str:
    cfg = store.space_event() or {}
    table = cfg.get("advice", {})
    return store.pick_for_env(table, env) or "Go to the most shielded area now."


def summary(persona: str, env: str) -> dict:
    """GET /api/radiation: daily dose, mission total, limit, and the active event (if any)."""
    data = store.persona(persona)
    daily = derive_daily(data, store.regions())
    thresholds = store.thresholds()
    event = active()
    extra = event["event_dose_msv"] if event else 0.0
    total = daily[-1]["radiation_total_msv"] + extra
    entry = thresholds.get("radiation_total_msv") if isinstance(thresholds.get("radiation_total_msv"), dict) else {}
    return {
        "persona": data["id"],
        "daily": [{"day": d["day"], "msv": d["radiation_msv"]} for d in daily],
        "today_msv": round(daily[-1]["radiation_msv"] + extra, 3),
        "mission_total_msv": round(total, 2),
        "limit_msv": bounds(entry, "red")[1],
        "status": "red" if event else judge(total, entry),
        "unit": entry.get("unit", "mSv"),
        "event": {**event, "advice": advice(env)} if event else None,
        "event_available": store.space_event() is not None,
        "fallback_spike_used": store.space_event() is None and bool(data.get("solar_spike_fallback")),
    }


def apply_to_status(rows: list[dict]) -> None:
    """While the replay runs, the radiation region is red (Act now) with the event in its reason."""
    event = active()
    if not event:
        return
    for row in rows:
        if row["region"] == "radiation":
            row.update(status="red", score=min(row["score"], 10), time_to_act_days=0, advice_level="surgeon_now",
                       reason=f"Solar particle event in progress (real NASA DONKI event {event['sep_id']}; dose simulated): "
                              f"{event['dose_rate_msv_h']:.2f} mSv/h now. Go to the shielded area.")
