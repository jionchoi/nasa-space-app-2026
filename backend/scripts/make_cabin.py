"""Generate backend/data/cabin_simulated.json: the SIMULATED fallback 24 h cabin profile (CO2, temperature, noise). Re-runnable.

Run from backend/:  python scripts/make_cabin.py

Values are placeholders in the range NASA describes for the ISS (CO2 usually 2,000-4,000 ppm, about 22-24 C).
Yenna/Jion: replace with a real cabin feed if the challenge Resources tab provides one.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parents[1] / "data" / "cabin_simulated.json"
STEP_MIN = 15
SEED = 2026


def bump(hour: float, centre: float, width: float) -> float:
    """Smooth 0-1 bump around `centre` (hours), wrapping at midnight."""
    d = min(abs(hour - centre), 24 - abs(hour - centre))
    return math.exp(-(d / width) ** 2)


def main() -> None:
    rng = np.random.default_rng(SEED)
    points = []
    for i in range(24 * 60 // STEP_MIN):
        hour = i * STEP_MIN / 60
        activity = bump(hour, 11, 3.5) * 0.6 + bump(hour, 16.5, 2.2)  # morning work, afternoon peak (all crew in one module)
        co2 = 2200 + 2100 * activity + rng.normal(0, 70)
        temp = 22.0 + 1.8 * activity + rng.normal(0, 0.1)
        noise = 52 + 9 * min(1.0, activity * 1.3) + rng.normal(0, 0.8)
        points.append({"minute": i * STEP_MIN, "co2_ppm": int(round(co2, -1)), "temp_c": round(temp, 1),
                       "noise_dba": round(noise, 1)})
    data = {
        "_status": "SIMULATED cabin environment for the demo. Not measured. Typical-range placeholder values.",
        "simulated": True,
        "source": "SIMULATED (shape and range only; see docs/resources.md)",
        "step_min": STEP_MIN,
        "points": points,
    }
    OUT.write_text(json.dumps(data, indent=1), encoding="utf-8")
    peak = max(points, key=lambda p: p["co2_ppm"])
    print(f"wrote {OUT}: {len(points)} points, CO2 peak {peak['co2_ppm']} ppm at minute {peak['minute']}")


if __name__ == "__main__":
    main()
