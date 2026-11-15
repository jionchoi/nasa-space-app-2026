"""PPG signal processing. Owner: Jian.

compute_vitals() is the only function the rest of the app calls. It must return a dict
shaped like the VitalsFrame contract (docs/contracts.md).
"""
from __future__ import annotations

from typing import Sequence


def compute_vitals(signal: Sequence[float], fs: float) -> dict:
    """Turn a window of raw PPG samples (sampling rate `fs` in Hz) into one VitalsFrame dict:

    {"t": ISO8601, "hr": .., "hrv_rmssd": .., "spo2": .., "rr": .., "signal_quality": 0-1,
     "irregular": bool, "source": "sensor"}
    """
    raise NotImplementedError("Jian owns compute_vitals(); see backend/app/ppg/adapter.py for how it is used.")
