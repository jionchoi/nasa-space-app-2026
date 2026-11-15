"""Turns a raw PPG recording into a persona "stream" (list of VitalsFrames at about 1 Hz).

Jian's compute_vitals() plugs in here; the replay in app/ws.py only ever reads persona["stream"].
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Callable, Sequence

from . import compute_vitals


def recording_to_stream(signal: Sequence[float], fs: float, window_s: float = 10, step_s: float = 1,
                        compute: Callable[[Sequence[float], float], dict] = compute_vitals,
                        start: datetime | None = None) -> list[dict]:
    """Slide a `window_s` window over the recording every `step_s` seconds and call compute_vitals."""
    start = start or datetime(2026, 11, 14, 8, 0, 0, tzinfo=timezone.utc)
    size, step = int(window_s * fs), max(1, int(step_s * fs))
    frames = []
    for i, begin in enumerate(range(0, len(signal) - size + 1, step)):
        frame = dict(compute(signal[begin: begin + size], fs))
        frame["t"] = (start + timedelta(seconds=i * step_s)).isoformat().replace("+00:00", "Z")
        frame["source"] = "replay"
        frames.append(frame)
    return frames
