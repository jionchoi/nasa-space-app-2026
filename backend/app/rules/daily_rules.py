"""Daily rules from the medical lead's sheet (RULE-01..17) on top of the plain bands. No numbers here: everything
comes from the thresholds.json entry.

Per level (yellow = Watch, orange = Warning, red = Act now) a day meets the level when its value is outside the band
(judge.beyond) or, for yellow, when it is too far from the frozen pre-flight usual (`baseline`). Extras:
- sustained_days {level: n}: the level needs n days in a row (e.g. sleep under 6 h for 2 nights).
- escalate_after_days {from, to, days}: Watch held that many days in a row becomes Warning.
- missed_days {orange: n}: no exercise logged n days in a row (exercise).
- requires_symptoms: Act now only with a red-flag symptom logged.
- no_act_now / red null: never Act now (HRV, reaction test, exercise, radiation dose).
- scale_factor: value multiplied first (mood: daily check 1-5 x 2 = the sheet's 1-10).
"""
from __future__ import annotations

from statistics import median

from .judge import ORDER, beyond


def scaled(entry: dict, value) -> float | None:
    if value is None or isinstance(value, bool):
        return None if value is None else float(value)
    return float(value) * float(entry.get("scale_factor") or 1)


def usual(daily_first: list[dict], entry: dict) -> float | None:
    """Frozen pre-flight usual: median of the first days (check.baseline_days) for the entry's baseline metric."""
    cfg = entry.get("baseline") or {}
    metric = cfg.get("metric")
    values = [scaled(entry, d.get(metric)) for d in daily_first if d.get(metric) is not None] if metric else []
    return median(values) if values else None


def baseline_hit(value: float, base: float | None, entry: dict) -> str | None:
    """Plain words when the value is too far from the usual for Watch, else None."""
    cfg = entry.get("baseline") or {}
    if base is None or not cfg:
        return None
    unit = entry.get("unit", "")
    rise, fall, drop_pct, drop = (cfg.get(k, {}).get("yellow") for k in ("rise", "fall", "drop_pct", "drop"))
    if rise is not None and value - base > rise:
        return f"{value - base:.1f} {unit} above your usual {base:.1f}".replace("  ", " ")
    if fall is not None and base - value > fall:
        return f"{base - value:.1f} {unit} below your usual {base:.1f}".replace("  ", " ")
    if drop_pct is not None and base > 0 and (base - value) / base * 100 > drop_pct:
        return f"{(base - value) / base * 100:.0f}% below your usual {base:.0f} {unit}".strip()
    if drop is not None and base - value >= drop:
        return f"{base - value:g} points below your usual {base:g}"
    return None


def _meets(day: dict, metric: str, entry: dict, level: str, base: float | None) -> bool:
    value = scaled(entry, day.get(metric))
    if value is None:
        return False
    if beyond(value, entry, level):
        return True
    return level == "yellow" and baseline_hit(value, base, entry) is not None


def _run(daily: list[dict], test) -> int:
    """How many days in a row, ending today, pass `test`."""
    n = 0
    for day in reversed(daily):
        if not test(day):
            break
        n += 1
    return n


def daily_level(daily: list[dict], metric: str, entry: dict, base: float | None = None,
                symptoms: bool = False) -> tuple[str, str | None]:
    """(status, note) for today's value of `metric` (daily[-1]), with the sheet's day rules."""
    if not daily or scaled(entry, daily[-1].get(metric)) is None:
        return "green", None
    sustained = entry.get("sustained_days") or {}
    status, note = "green", None
    for level in ("yellow", "orange", "red"):
        if level == "red" and (entry.get("no_act_now") or (entry.get("requires_symptoms") and not symptoms)):
            continue
        need = int(sustained.get(level, 1))
        if _run(daily, lambda d, lv=level: _meets(d, metric, entry, lv, base)) >= need:
            status = level
            if need > 1:
                note = f"{need} days in a row."
    esc = entry.get("escalate_after_days")
    if esc and ORDER.index(status) < ORDER.index(esc["to"]):
        days = _run(daily, lambda d: _meets(d, metric, entry, esc["from"], base))
        if days >= int(esc["days"]):
            status, note = esc["to"], f"Watch for {days} days in a row."
    missed = entry.get("missed_days") or {}
    if missed.get("orange") and ORDER.index(status) < ORDER.index("orange"):
        field = metric.removesuffix("_7d")
        if _run(daily, lambda d: d.get(field) is not None and float(d[field]) <= 0) >= int(missed["orange"]):
            status, note = "orange", f"No exercise logged {missed['orange']} days in a row: review the plan."
    k = float(entry.get("scale_factor") or 1)
    raw_base = None if base is None else base / k
    hit = baseline_hit(float(daily[-1][metric]), raw_base, {**entry, "baseline": _raw_limits(entry, k)}) if k != 1 \
        else baseline_hit(scaled(entry, daily[-1].get(metric)), base, entry)
    if hit and status != "green":
        note = f"{hit}." + (f" {note}" if note else "")
    return status, note


def _raw_limits(entry: dict, k: float) -> dict:
    """The baseline limits on the stored scale (mood 1-5), for the note shown to the crew."""
    cfg = dict(entry.get("baseline") or {})
    for key in ("rise", "fall", "drop"):
        if isinstance(cfg.get(key), dict):
            cfg[key] = {lv: v / k for lv, v in cfg[key].items()}
    return cfg
