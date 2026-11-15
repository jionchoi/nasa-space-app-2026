"""Loads everything from backend/data/. Config files are re-read on every call so edits apply live.

Personas are kept as an in-memory working copy built from the read-only JSON file plus the latest saved daily
check from the database (app/db.py), so a check survives a restart. JSON files are never overwritten.
"""
from __future__ import annotations

import copy
import json
import logging
import os
import re
from pathlib import Path
from typing import Any

log = logging.getLogger("copilot")

DATA_DIR = Path(os.environ.get("COPILOT_DATA_DIR", Path(__file__).resolve().parents[1] / "data"))

_original: dict[str, dict] = {}
_live: dict[str, dict] = {}


def load(rel: str) -> Any:
    return json.loads((DATA_DIR / rel).read_text(encoding="utf-8"))


def thresholds() -> dict:
    return load("thresholds.json")


def regions() -> dict:
    return load("regions.json")


def escalation() -> dict:
    return load("escalation.json")


def environments() -> list:
    return load("environments.json")


def environment(env: str | None) -> dict | None:
    """One location, resolved. A location with `planets` (the surface rover) takes the planet from the key
    ("rover:mars"), else its default `planet`; the planet sets delay_s, advice_note and `advice_as` (the location whose
    advice texts apply). Unknown ids give None."""
    base, _, planet = (env or "").partition(":")
    found = next((e for e in environments() if e["id"] == base), None)
    if found is None or not found.get("planets"):
        return found
    planets = found["planets"]
    planet = planet if planet in planets else found.get("planet") or next(iter(planets))
    p = planets[planet]
    return {**found, "key": f"{base}:{planet}", "planet": planet, "delay_s": p["delay_s"],
            "advice_note": p.get("advice_note") or found["advice_note"], "advice_as": p["advice_as"],
            "planet_label": p["label"]}


def env_keys(env: str | None) -> list[str]:
    """Keys to look up a per-location text, most specific first: "rover:mars", "rover", then the planet's location ("mars")."""
    keys = [env or ""]
    base = keys[0].partition(":")[0]
    if base != keys[0]:
        keys.append(base)
    resolved = environment(env)
    if resolved and resolved.get("advice_as"):
        keys.append(resolved["advice_as"])
    return keys


def pick_for_env(table: dict, env: str | None, default_key: str = "default"):
    """The first entry of `table` for env_keys(env), else table[default_key] (or None)."""
    for key in env_keys(env):
        if table.get(key):
            return table[key]
    return table.get(default_key)


def guidance() -> dict:
    return load("guidance.json")


def measurements() -> dict:
    return load("measurements.json")


def questionnaire() -> dict:
    return load("questionnaire.json")


def labels() -> dict:
    return load("labels.json")


def space_event() -> dict | None:
    """The real DONKI event prepared by scripts/fetch_donki.py, or None if it was never built."""
    path = DATA_DIR / "space_weather" / "event.json"
    return load("space_weather/event.json") if path.exists() else None


def cabin() -> dict | None:
    path = DATA_DIR / "cabin.json"
    return load("cabin.json") if path.exists() else None


# Old protocol ids that still work (links saved before a rename).
PROTOCOL_ALIASES = {"collapse": "unresponsive"}


def protocol(pid: str) -> dict | None:
    pid = PROTOCOL_ALIASES.get(pid, pid)
    if not re.fullmatch(r"[a-z0-9_]+", pid or ""):
        return None
    path = DATA_DIR / "protocols" / f"{pid}.json"
    return load(f"protocols/{pid}.json") if path.exists() else None


def persona_ids() -> list[str]:
    return sorted(p.stem for p in (DATA_DIR / "personas").glob("*.json"))


def persona(pid: str | None, original: bool = False) -> dict:
    """Working copy of a persona (or the untouched file copy). Unknown ids fall back to A."""
    pid = (pid or "A").strip()
    if pid not in _live:
        path = DATA_DIR / "personas" / f"{pid}.json"
        if not pid.isalnum() or not path.exists():
            if pid == "A":
                raise FileNotFoundError("No persona files. Run: python scripts/make_personas.py")
            log.warning("Persona %r not found, falling back to A", pid)
            return persona("A", original)
        _original[pid] = load(f"personas/{pid}.json")
        _apply_fallback_spike(_original[pid])
        _live[pid] = copy.deepcopy(_original[pid])
        _apply_saved_check(_live[pid])
    return (_original if original else _live)[pid]


def _apply_fallback_spike(data: dict) -> None:
    """Without the real DONKI event, fall back to the old single simulated solar-spike day."""
    spike = data.get("solar_spike_fallback")
    if spike and space_event() is None:
        for day in data["daily"]:
            if day["day"] == spike["day"]:
                day["radiation_msv"] = spike["msv"]


def _apply_saved_check(data: dict) -> None:
    """Re-attach the latest daily check saved in the database as today's entry."""
    from . import db  # local import: db imports store

    rows = db.query("SELECT entry FROM daily_checks WHERE persona = ? ORDER BY id DESC LIMIT 1", (data["id"],))
    if rows:
        data["daily"] = [d for d in data["daily"] if not d.get("today")] + [rows[0]["entry"]]


def reset_persona(pid: str) -> None:
    _original.pop(pid, None)
    _live.pop(pid, None)


def reset() -> None:
    """Forget in-memory working copies (as after a restart). Does not touch the database."""
    _original.clear()
    _live.clear()
