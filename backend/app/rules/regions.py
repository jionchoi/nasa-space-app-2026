"""Region mapping (data/regions.json) and the derived daily metrics the regions use."""
from __future__ import annotations

from statistics import mean


def region_list(regions_cfg: dict) -> list[dict]:
    return regions_cfg["regions"]


def immune_symptoms(regions_cfg: dict) -> set[str]:
    out: set[str] = set()
    for region in region_list(regions_cfg):
        out.update(region.get("immune_symptoms", []))
    return out


def derive_daily(persona: dict, regions_cfg: dict) -> list[dict]:
    """Daily entries plus derived metrics: exercise_min_7d, radiation_total_msv, symptoms_immune."""
    daily = persona["daily"]
    immune = immune_symptoms(regions_cfg)
    total = float(persona.get("radiation_prior_msv", 0))
    out = []
    for i, day in enumerate(daily):
        entry = dict(day)
        window = [d["exercise_min"] for d in daily[max(0, i - 6): i + 1] if d.get("exercise_min") is not None]
        if window:
            entry["exercise_min_7d"] = round(mean(window), 1)
        total += float(day.get("radiation_msv") or 0)
        entry["radiation_total_msv"] = round(total, 2)
        entry["symptoms_immune"] = sum(1 for s in day.get("symptoms", []) if s in immune)
        out.append(entry)
    return out


def series(daily: list[dict], metric: str) -> list[float]:
    return [float(d[metric]) for d in daily if d.get(metric) is not None]
