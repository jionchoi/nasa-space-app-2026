"""RegionStatus for each of the 7 regions, from the latest daily values and thresholds.json."""
from __future__ import annotations

from statistics import mean

from .escalation import advice_level
from .forecast import time_to_act, unusual_fields
from .judge import ORDER, judge, score
from .pvt import METRIC as PVT_METRIC, personal_status as pvt_personal_status
from .regions import derive_daily, region_list, series


def fmt(x: float) -> str:
    x = round(float(x), 1)
    return str(int(x)) if x == int(x) else f"{x:.1f}"


def describe(values: list[float], entry: dict, metric: str) -> str:
    """One plain sentence: the metric and how it changed over the last 7 days."""
    label = entry.get("label", metric)
    unit = f" {entry['unit']}" if entry.get("unit") else ""
    now = values[-1]
    if len(values) < 10:
        return f"{label} is {fmt(now)}{unit} today."
    change = mean(values[-3:]) - mean(values[-10:-7])
    if abs(change) < max(0.03 * abs(now), 0.05):
        return f"{label} steady at {fmt(now)}{unit} over the last 7 days."
    word = "up" if change > 0 else "down"
    return f"{label} {word} {fmt(abs(change))}{unit} over 7 days (now {fmt(now)}{unit})."


def region_statuses(persona: dict, thresholds: dict, regions_cfg: dict, escalation_cfg: dict,
                    as_of_day: int | None = None) -> list[dict]:
    daily = derive_daily(persona, regions_cfg)
    if as_of_day is not None:
        daily = [d for d in daily if d["day"] <= as_of_day]
    if not daily:
        raise ValueError("persona has no daily data")
    latest = daily[-1]
    unusual = unusual_fields(daily, regions_cfg)
    forecast_cfg = regions_cfg.get("forecast", {})

    rows = []
    for region in region_list(regions_cfg):
        judged, notes = [], {}
        for metric in region["metrics"]:
            entry, value = thresholds.get(metric), latest.get(metric)
            if isinstance(entry, dict) and value is not None:
                level = judge(float(value), entry)
                if metric == PVT_METRIC and level == "green":  # more than 15 % slower than the personal baseline
                    personal = pvt_personal_status(daily, thresholds)
                    if personal:
                        level = personal[0]
                        notes[metric] = personal[1]
                judged.append((metric, level, min(score(float(value), entry), 74 if level != "green" else 100)))
        status = max((j[1] for j in judged), key=ORDER.index, default="green")
        region_score = min((j[2] for j in judged), default=100)

        key = region["key_metric"]
        key_series = series(daily, key)
        focus = key
        causes = [j for j in judged if j[1] == status]
        if status != "green" and key not in [j[0] for j in causes]:  # name the metric that causes the status
            focus = min(causes, key=lambda j: j[2])[0]
        focus_series = series(daily, focus)
        entry = thresholds.get(focus) if isinstance(thresholds.get(focus), dict) else {}
        reason = describe(focus_series, entry, focus) if focus_series else "No data yet for this region."
        if focus in notes:
            reason = f"{reason} {notes[focus]}"
        if unusual & set(region.get("daily_fields", [])):
            reason += " Unusual for you today."

        if status in ("orange", "red"):
            days = 0
        else:
            days = time_to_act(key_series, thresholds.get(key), **forecast_cfg)

        rows.append({
            "region": region["id"],
            "status": status,
            "score": region_score,
            "trend": [round(v, 2) for v in key_series[-14:]],
            "time_to_act_days": days,
            "reason": reason,
            "metric_status": {m: level for m, level, _ in judged},
        })

    not_green = sum(1 for r in rows if r["status"] != "green")
    for row in rows:
        row["advice_level"] = advice_level(row["status"], not_green, escalation_cfg)
    return rows
