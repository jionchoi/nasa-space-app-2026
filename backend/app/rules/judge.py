"""Compare one value with one thresholds.json entry. No medical numbers live here."""
from __future__ import annotations

ORDER = ["green", "yellow", "orange", "red"]
LEVELS = ORDER[1:]


def bounds(entry: dict | None, level: str) -> tuple[float | None, float | None]:
    band = (entry or {}).get(level)
    if not band:
        return (None, None)
    return (band[0], band[1])


def beyond(value: float, entry: dict | None, level: str) -> bool:
    """Outside this level's band: below `low` / above `high`. An edge listed in `inclusive` (e.g. {"red": ["high"]}
    for ">= 38.5") counts too, so each sheet edge sits on exactly one side."""
    lo, hi = bounds(entry, level)
    incl = ((entry or {}).get("inclusive") or {}).get(level) or []
    below = lo is not None and (value < lo or ("low" in incl and value == lo))
    above = hi is not None and (value > hi or ("high" in incl and value == hi))
    return below or above


def judge(value: float, entry: dict | None, symptoms: bool = False) -> str:
    """A value below `low` or above `high` of a band is at least that status. Worst wins.
    An entry with `requires_symptoms` reaches red (Act now) only with a red-flag symptom logged (`symptoms`);
    without one it stays at the level below (e.g. RULE-04 BP > 180/120 without symptoms = Warning)."""
    status = "green"
    for level in LEVELS:
        if level == "red" and (entry or {}).get("requires_symptoms") and not symptoms:
            continue
        if beyond(value, entry, level):
            status = level
    return status


def worst(statuses: list[str]) -> str:
    return max(statuses, key=ORDER.index) if statuses else "green"


def _side_score(value: float, limits: list[float | None], sign: int) -> float:
    """100 = well inside green, 75 at the yellow limit, 50 at orange, 25 at red, 0 far beyond."""
    y, o, r = limits
    if y is None:
        return 100.0
    unit = abs(o - y) if o is not None and o != y else max(abs(y) * 0.1, 1e-6)
    past_y = (value - y) * sign
    if past_y <= 0:
        return 75 + 25 * min(1.0, -past_y / (unit * 0.5))
    if o is None or (value - o) * sign <= 0:
        return 75 - 25 * min(1.0, past_y / unit)
    past_o = (value - o) * sign
    if r is None:
        return 50 - 25 * min(1.0, past_o / unit)
    span = max(abs(r - o), 1e-6)
    if (value - r) * sign <= 0:
        return 50 - 25 * min(1.0, past_o / span)
    return max(0.0, 25 - 25 * min(1.0, (value - r) * sign / span))


def score(value: float, entry: dict | None) -> int:
    lows = [bounds(entry, lv)[0] for lv in LEVELS]
    highs = [bounds(entry, lv)[1] for lv in LEVELS]
    return int(round(min(_side_score(value, lows, -1), _side_score(value, highs, +1))))


def implausible(metric: str, value, thresholds: dict) -> bool:
    """True when `value` is outside thresholds.json "plausible" for this metric: a measuring error, never judged."""
    band = (thresholds.get("plausible") or {}).get(metric)
    if value is None or not isinstance(band, list):
        return False
    lo, hi = band
    return (lo is not None and value < lo) or (hi is not None and value > hi)
