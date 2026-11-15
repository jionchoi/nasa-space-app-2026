"""Today's logs (meals, water, exercise, weekly biomarkers, standalone reaction tests) and the daily missions.

Logs live in the SQLite `forms` table. `overlay()` puts today's logged values into the persona's latest daily entry
so they feed the regions (water -> hydration, exercise -> exercise, body mass -> body-mass change, reaction test ->
brain and mood). Missions reward behaviour only, never health results; targets come from thresholds.json.
"""
from __future__ import annotations

import copy
from datetime import date, datetime
from statistics import median

from . import db, store


def _local_date(t: str) -> date:
    return datetime.fromisoformat(t.replace("Z", "+00:00")).astimezone().date()


def _forms(persona: str, kind: str, today_only: bool = True) -> list[dict]:
    rows = db.query("SELECT * FROM forms WHERE persona = ? AND kind = ? ORDER BY id", (persona, kind))
    return [r for r in rows if _local_date(r["t"]) == date.today()] if today_only else rows


def targets() -> dict:
    return store.thresholds().get("daily_targets", {})


def today_summary(persona: str) -> dict:
    meals = _forms(persona, "meal")
    exercise = _forms(persona, "exercise")
    pvt = _forms(persona, "pvt")
    biomarkers = _forms(persona, "biomarkers", today_only=False)
    checks = [r for r in db.query("SELECT id, t FROM daily_checks WHERE persona = ? ORDER BY id DESC", (persona,))
              if _local_date(r["t"]) == date.today()]
    return {
        "meals": len(meals),
        "water_l": round(sum(float(m["data"].get("water_l") or 0) for m in meals), 2),
        "exercise_min": sum(int(e["data"].get("minutes") or 0) for e in exercise),
        "pvt": pvt[-1]["data"] if pvt else None,
        "biomarkers": biomarkers[-1] if biomarkers else None,
        "check_done_at": checks[0]["t"] if checks else None,
    }


def overlay(data: dict) -> dict:
    """A copy of the persona with today's logged values in its latest daily entry (a today entry is created,
    carrying the last 7 days forward, if logs exist but no daily check was done today)."""
    pid = data["id"]
    s = today_summary(pid)
    today_values: dict = {}
    if s["water_l"] > 0:
        today_values["hydration_l"] = s["water_l"]
    if s["exercise_min"] > 0:
        today_values["exercise_min"] = s["exercise_min"]
    if s["pvt"]:
        today_values["pvt_median_ms"] = s["pvt"]["median_ms"]
        today_values["pvt_lapses"] = s["pvt"]["lapses"]
    mass_change = None
    start = data.get("body_mass_start_kg")
    if s["biomarkers"] and start:
        mass_change = round((float(s["biomarkers"]["data"]["body_mass_kg"]) - start) / start * 100, 1)
    if not today_values and mass_change is None:
        return data

    out = copy.copy(data)
    daily = list(data["daily"])
    last = daily[-1]
    if today_values:
        if last.get("today"):
            daily[-1] = {**last, **today_values}
        else:
            recent = daily[-7:]
            carried = {k: median(d[k] for d in recent if isinstance(d.get(k), (int, float)))
                       for k, v in last.items() if isinstance(v, (int, float)) and not isinstance(v, bool) and k != "day"}
            daily.append({**carried, "day": last["day"] + 1, "today": True, "symptoms": [], "logged_only": True, **today_values})
    if mass_change is not None:
        daily[-1] = {**daily[-1], "body_mass_change_pct": mass_change}
    out["daily"] = daily
    return out


def missions(persona: str) -> list[dict]:
    """Today's behaviour missions with done / not done. Never about health results."""
    s, t = today_summary(persona), targets()
    water_target, meals_target, ex_target = t.get("water_l", 2.0), t.get("meals", 2), t.get("exercise_min", 30)
    done_at = s["check_done_at"]
    return [
        {"id": "daily_check", "label": "Complete the daily check", "done": bool(done_at),
         "detail": f"Done at {datetime.fromisoformat(done_at.replace('Z', '+00:00')).astimezone():%H:%M}" if done_at else "Not done yet",
         "action": "/check"},
        {"id": "meals", "label": "Log your meals", "done": s["meals"] >= meals_target,
         "detail": f"{s['meals']} of {meals_target} meals logged", "action": "log:meal"},
        {"id": "water", "label": "Log your water", "done": s["water_l"] >= water_target,
         "detail": f"{s['water_l']:g} of {water_target:g} L", "action": "log:meal"},
        {"id": "exercise", "label": "Log your exercise", "done": s["exercise_min"] > 0,
         "detail": f"{s['exercise_min']} min logged (target {ex_target} min)", "action": "log:exercise"},
    ]
