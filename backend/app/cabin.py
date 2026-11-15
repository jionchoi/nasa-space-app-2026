"""Simulated cabin environment (data/cabin.json): CO2, temperature and noise over 24 h, played by time of day.

Served at GET /api/cabin (VitalsFrame is not changed). High CO2 adds context to headache / poor-sleep reasons.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from . import store
from .rules.judge import bounds, judge

METRICS = {"co2_ppm": "co2_ppm", "temp_c": "cabin_temp_c", "noise_dba": "cabin_noise_dba"}  # cabin field -> thresholds key


def _points_until(cfg: dict, at: datetime, hours: int = 24) -> list[dict]:
    """The profile as a time series ending at `at` (one point per step), oldest first."""
    step = cfg["step_min"]
    points = cfg["points"]
    per_day = len(points)
    minute_of_day = at.hour * 60 + at.minute
    index = minute_of_day // step
    count = min(per_day, hours * 60 // step)
    out = []
    for back in range(count - 1, -1, -1):
        p = dict(points[(index - back) % per_day])
        p["t"] = (at - timedelta(minutes=back * step)).astimezone(timezone.utc).isoformat(timespec="minutes").replace("+00:00", "Z")
        out.append(p)
    return out


def summary(at: datetime | None = None) -> dict | None:
    cfg = store.cabin()
    if cfg is None:
        return None
    at = at or datetime.now().astimezone()
    thresholds = store.thresholds()
    series = _points_until(cfg, at)
    now = series[-1]
    status = {}
    for field, key in METRICS.items():
        entry = thresholds.get(key) if isinstance(thresholds.get(key), dict) else None
        status[field] = judge(float(now[field]), entry) if entry else "green"
    co2_limit = bounds(thresholds.get("co2_ppm"), "yellow")[1]
    high = sum(1 for p in series if co2_limit is not None and p["co2_ppm"] > co2_limit)
    return {
        "simulated": cfg.get("simulated", True),
        "source": cfg.get("source", "SIMULATED"),
        "now": now,
        "status": status,
        "last_24h": series,
        "co2_high_hours_24h": round(high * cfg["step_min"] / 60, 2),
        "co2_watch_ppm": co2_limit,
    }


def add_co2_context(rows: list[dict], persona: dict, at: datetime | None = None) -> None:
    """Append the CO2 note to the configured regions when CO2 was high long enough (regions.json co2_context)."""
    cfg = store.regions().get("co2_context")
    cabin = summary(at)
    if not cfg or not cabin or cabin["co2_high_hours_24h"] < cfg.get("min_hours_high", 2):
        return
    today = persona["daily"][-1] if persona.get("daily") else {}
    symptom = bool(set(cfg.get("symptoms", [])) & set(today.get("symptoms", [])))
    for row in rows:
        if row["region"] in cfg["regions"] and (row["status"] != "green" or symptom) and cfg["text"] not in row["reason"]:
            row["reason"] = f"{row['reason']} {cfg['text']}"
