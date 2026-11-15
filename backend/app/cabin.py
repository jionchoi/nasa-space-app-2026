"""Cabin environment, served at GET /api/cabin (VitalsFrame is not changed). High CO2 adds context to headache /
poor-sleep reasons.

Two file shapes (store.cabin() picks the first that exists):
- cabin.json: REAL ISS cabin telemetry (NASA OSDR EDA, RR-23 / SpaceX-21) from scripts/import_nasa_env.py.
  Points carry a real timestamp "t" (CO2, temperature, humidity; no noise). Replayed in a loop by the clock.
- cabin_simulated.json: the old SIMULATED 24 h profile (points carry "minute"; CO2, temperature, noise). Fallback.
The same ISS readings are shown at every location (a base, rover or ship keeps its cabin air at similar levels).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from . import store
from .rules.judge import bounds, judge

# cabin field -> thresholds key (None: shown, not colored)
METRICS = {"co2_ppm": "co2_ppm", "temp_c": "cabin_temp_c", "noise_dba": "cabin_noise_dba", "rh_pct": None}


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="minutes").replace("+00:00", "Z")


def _is_real(cfg: dict) -> bool:
    return bool(cfg.get("points")) and "t" in cfg["points"][0]


def _points_until(cfg: dict, at: datetime, hours: int = 24) -> list[dict]:
    """The feed as a time series ending at `at` (one point per step), oldest first, each stamped on today's clock."""
    step = cfg["step_min"]
    points = cfg["points"]
    n = len(points)
    if _is_real(cfg):
        first = int(datetime.fromisoformat(points[0]["t"].replace("Z", "+00:00")).timestamp()) // (step * 60)
        index = int(at.timestamp()) // (step * 60) - first
    else:  # simulated 24 h profile, played by time of day
        index = (at.hour * 60 + at.minute) // step
    count = min(n, hours * 60 // step)
    out = []
    for back in range(count - 1, -1, -1):
        src = points[(index - back) % n]
        p = {k: v for k, v in src.items() if k != "t"}
        t = at - timedelta(minutes=back * step)
        p["t"] = _iso(t)
        p.setdefault("minute", t.astimezone(timezone.utc).hour * 60 + t.astimezone(timezone.utc).minute)
        if "t" in src:
            p["measured_at"] = src["t"]
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
        if field not in now:
            continue
        entry = thresholds.get(key) if key and isinstance(thresholds.get(key), dict) else None
        status[field] = judge(float(now[field]), entry) if entry else "green"
    co2_limit = bounds(thresholds.get("co2_ppm"), "yellow")[1]
    high = sum(1 for p in series if co2_limit is not None and p["co2_ppm"] > co2_limit)
    real = _is_real(cfg)
    return {
        "simulated": not real,
        "kind": "real" if real else "simulated",
        "source": cfg.get("source", "SIMULATED"),
        "badge": cfg.get("badge") or ("Simulated" if not real else cfg.get("source")),
        "mission": cfg.get("mission"),
        "source_urls": cfg.get("source_urls", []),
        "units": cfg.get("units"),
        "replay_note": cfg.get("replay_note"),
        "location_note": cfg.get("location_note"),
        "fields": [f for f in METRICS if f in now],
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
