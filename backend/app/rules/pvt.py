"""Reaction test (PVT) rule on top of the population bands (thresholds.json "pvt", DRAFT from PRET, Yenna reviews).

The bands on pvt_median_ms / pvt_lapse_rate_pct already give Watch above the PRET 90th percentile and Warning above the
97.5th. This adds the personal part: with at least `min_baseline_days` earlier results, a median reaction time more
than `baseline_slower_pct` slower than the personal baseline (median of the previous days, up to 30) is at least Watch.
With fewer days, only the population percentiles count. No Act now from the reaction test alone.
"""
from __future__ import annotations

from statistics import median

METRIC = "pvt_median_ms"


def baseline(daily: list[dict], cfg: dict) -> float | None:
    """Median of the earlier results (not today), or None with fewer than min_baseline_days."""
    earlier = [float(d[METRIC]) for d in daily[:-1][-30:] if d.get(METRIC) is not None]
    if len(earlier) < int(cfg.get("min_baseline_days", 7)):
        return None
    return median(earlier)


def personal_status(daily: list[dict], thresholds: dict) -> tuple[str, str] | None:
    """("yellow", reason) when today's median reaction time is too far above the personal baseline, else None."""
    cfg = thresholds.get("pvt")
    if not isinstance(cfg, dict) or not daily or daily[-1].get(METRIC) is None:
        return None
    base = baseline(daily, cfg)
    if base is None:
        return None
    limit = float(cfg.get("baseline_slower_pct", 15))
    now = float(daily[-1][METRIC])
    slower = (now - base) / base * 100
    if slower > limit:
        return "yellow", f"Reaction time {now:.0f} ms is {slower:.0f}% slower than your usual {base:.0f} ms."
    return None
