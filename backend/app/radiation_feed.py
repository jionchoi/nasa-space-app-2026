"""Dose rate by location: real NASA OSDR RadLab readings replayed in a loop, or a DRAFT estimate.

Each location in environments.json names its own `radiation_feed` ({"file", "estimate"}); a rover planet has its own.
A location only ever reads its own file, so readings are never shown under another location's label.
    1. file exists        -> replay it (kind "real"), badge from the file (written by scripts/import_nasa_env.py)
    2. else `estimate`    -> constant rate from thresholds.json "dose_estimates" (kind "estimated")
    3. else               -> None: the radiation card shows only the old simulated persona dose
The replay follows the clock: the window starts at UTC midnight and is whole days long, so the time of day matches.
The DONKI solar-event replay (radiation.py) stays on top for every location.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from . import store

_cache: dict[str, tuple[float, dict]] = {}


def _load(rel: str) -> dict | None:
    path = store.DATA_DIR / rel
    if not path.exists():
        return None
    mtime = path.stat().st_mtime
    key = str(path)
    if key not in _cache or _cache[key][0] != mtime:
        _cache[key] = (mtime, json.loads(path.read_text(encoding="utf-8")))
    return _cache[key][1]


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="minutes").replace("+00:00", "Z")


def feed_config(env: str | None) -> dict | None:
    """The `radiation_feed` of this location (the planet's for the surface rover)."""
    resolved = store.environment(env)
    if not resolved:
        return None
    planet = (resolved.get("planets") or {}).get(resolved.get("planet") or "")
    return (planet or {}).get("radiation_feed") or resolved.get("radiation_feed")


def _real(data: dict, now: datetime) -> dict:
    points, step = data["points"], data["step_s"]
    n, days = len(points), data["window"]["days"]
    start = datetime.fromisoformat(data["window"]["start"].replace("Z", "+00:00"))
    first = int(start.timestamp()) // step
    per_day = 86400 // step
    idx = (int(now.timestamp()) // step - first) % n
    rate_at = lambda i: points[i % n]["dose_rate"]  # noqa: E731
    # Last 24 h, at most 288 points (5 min), each mapped onto today's clock.
    stride = max(1, per_day // 288)
    last_24h = [{"t": _iso(now - timedelta(seconds=back * step)), "dose_rate": rate_at(idx - back)}
                for back in range(per_day - 1, -1, -stride)]
    day_index, into_day = divmod(idx, per_day)
    today = sum(rate_at(day_index * per_day + i) for i in range(into_day + 1)) * step / 3600 / 1000
    # 30 daily values ending today (yesterday and before are whole replay days, looping if needed).
    daily = [data["daily_mgy"][(day_index - back) % days] for back in range(30, 0, -1)]
    return {
        "kind": "real",
        "badge": data["badge"],
        "place": data.get("place"),
        "note": data.get("note"),
        "instrument": f"{data['instrument']} ({data['spacecraft']}{', ' + data['module'] if data.get('module') else ''})",
        "source": data.get("source"),
        "source_url": data.get("source_url"),
        "unit": data["units"]["dose_rate"],
        "unit_source": data.get("unit_source"),
        "quantity": data.get("quantity"),
        "replay_label": f"{days} days of real data, repeated",
        "window": data["window"],
        "measured_at": points[idx]["t"],
        "dose_rate_now": rate_at(idx),
        "today_mgy": round(today, 4),
        "daily_mgy": daily,
        "total_30d_mgy": round(sum(daily), 3),
        "last_24h": last_24h,
    }


def _estimated(key: str) -> dict | None:
    table = store.thresholds().get("dose_estimates") or {}
    entry = table.get(key)
    if not isinstance(entry, dict):
        return None
    rate = float(entry["dose_rate"])
    per_day = rate * 24 / 1000
    return {
        "kind": "estimated",
        "badge": "Estimated from published data",
        "place": entry.get("label"),
        "note": "No dosimeter readings for this location yet. A steady published average is shown; real readings go up "
                "and down.",
        "instrument": None,
        "source": entry.get("source"),
        "source_url": None,
        "unit": table.get("unit", "µGy/h"),
        "draft": str(table.get("_status", "")).upper().startswith("DRAFT") or "DRAFT" in str(entry.get("source", "")),
        "replay_label": None,
        "dose_rate_now": rate,
        "today_mgy": None,
        "daily_mgy": [round(per_day, 4)] * 30,
        "total_30d_mgy": round(per_day * 30, 3),
        "last_24h": [],
    }


def summary(env: str | None, now: datetime | None = None) -> dict | None:
    cfg = feed_config(env)
    if not cfg:
        return None
    now = now or datetime.now(timezone.utc)
    data = _load(cfg["file"]) if cfg.get("file") else None
    if data and data.get("points"):
        return _real(data, now)
    return _estimated(cfg["estimate"]) if cfg.get("estimate") else None
