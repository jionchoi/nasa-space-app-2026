"""Compare one value with one thresholds.json entry. No medical numbers live here."""
from __future__ import annotations

ORDER = ["green", "yellow", "orange", "red"]
LEVELS = ORDER[1:]


def bounds(entry: dict | None, level: str) -> tuple[float | None, float | None]:
    band = (entry or {}).get(level)
    if not band:
        return (None, None)
    return (band[0], band[1])


def judge(value: float, entry: dict | None) -> str:
    """A value below `low` or above `high` of a band is at least that status. Worst wins."""
    status = "green"
    for level in LEVELS:
        lo, hi = bounds(entry, level)
        if (lo is not None and value < lo) or (hi is not None and value > hi):
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
