"""'Time to act' (straight-line fit) and 'unusual for you' (Isolation Forest)."""
from __future__ import annotations

import math

import numpy as np
from sklearn.ensemble import IsolationForest

from .judge import bounds


def time_to_act(values: list[float], entry: dict | None, window_days: int = 14,
                horizon_days: int = 30, min_signal_to_noise: float = 2, level: str = "orange") -> int | None:
    """Days until the trend line crosses the `level` limit (orange = Warning, red = Act now), or None if it is not
    heading there. Values must be on the thresholds' scale (see daily_rules.scaled)."""
    y = np.asarray(values[-window_days:], dtype=float)
    if len(y) < 5 or not isinstance(entry, dict):
        return None
    x = np.arange(len(y))
    slope, intercept = np.polyfit(x, y, 1)
    lo, hi = bounds(entry, level)
    target = hi if slope > 0 else lo
    if target is None or abs(slope) < 1e-9:
        return None
    # Ignore trends that are no bigger than the day-to-day noise.
    noise = float(np.std(y - (slope * x + intercept)))
    if abs(slope) * (len(y) - 1) < min_signal_to_noise * noise:
        return None
    last = slope * x[-1] + intercept
    days = (target - last) / slope
    if days <= 0:
        return 0
    if days > horizon_days:
        return None
    return int(math.ceil(days))


def unusual_fields(daily: list[dict], regions_cfg: dict) -> set[str]:
    """Daily fields that make the latest day 'unusual for you', or an empty set."""
    cfg = regions_cfg.get("anomaly", {})
    fields = sorted({f for r in regions_cfg["regions"] for f in r.get("daily_fields", [])})
    fields = [f for f in fields if all(isinstance(d.get(f), (int, float)) for d in daily)]
    if len(daily) < cfg.get("min_days", 10) or not fields:
        return set()
    X = np.array([[float(d[f]) for f in fields] for d in daily])
    forest = IsolationForest(n_estimators=50, random_state=0).fit(X)
    if forest.predict(X[-1:])[0] != -1:
        return set()
    history = X[:-1]
    z = (X[-1] - history.mean(axis=0)) / (history.std(axis=0) + 1e-9)
    return {f for f, zv in zip(fields, z) if abs(zv) > cfg.get("z_score", 1.5)}
