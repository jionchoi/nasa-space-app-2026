"""Red-flag symptoms the crew logs (thresholds.json "symptoms", team default pending Yenna).

A red-flag symptom (chest pain, fainting, severe breathlessness, confusion) is Act now on its own, and it fulfils the
Act-now rules marked `requires_symptoms` (RULE-04 extreme BP, RULE-05 irregular pulse). Logged with the "Mood and
symptoms" form (kind "mood") or the short "symptoms" form; it counts for `active_minutes`. Demo mode only: Measurement
and Research mode never post here (clinical_auto_alert_enabled = false).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from . import db, store


def config(thresholds: dict | None = None) -> dict:
    return (thresholds or store.thresholds()).get("symptoms") or {}


def red_flag_ids(thresholds: dict | None = None) -> list[str]:
    return list((config(thresholds).get("red_flag") or {}).keys())


def active(persona: str, thresholds: dict | None = None, now: datetime | None = None) -> list[str]:
    """Red-flag symptoms logged in the last `active_minutes`, oldest first, no repeats."""
    cfg = config(thresholds)
    flags = set(red_flag_ids(thresholds))
    if not flags:
        return []
    now = now or datetime.now(timezone.utc)
    since = now - timedelta(minutes=float(cfg.get("active_minutes", 60)))
    out: list[str] = []
    for row in db.query("SELECT * FROM forms WHERE persona = ? AND kind IN ('mood', 'symptoms') ORDER BY id", (persona,)):
        t = datetime.fromisoformat(row["t"].replace("Z", "+00:00"))
        if t < since:
            continue
        for s in row["data"].get("symptoms") or []:
            if s in flags and s not in out:
                out.append(s)
    return out


def label(symptom: str, thresholds: dict | None = None) -> str:
    return (config(thresholds).get("red_flag") or {}).get(symptom, symptom)


def region(symptom: str, thresholds: dict | None = None) -> str | None:
    return (config(thresholds).get("region") or {}).get(symptom)
