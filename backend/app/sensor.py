"""Live sensor input (WebSocket /ws/sensor) and the switch between live sensor and persona replay.

The ESP32 (or a bridge script) sends either ready VitalsFrames or raw PPG samples. Raw samples are buffered in
10 s windows and passed to Jian's compute_vitals(signal, fs). /ws/vitals serves sensor frames while one arrived
in the last FRESH_S seconds, and falls back to the persona replay otherwise.
"""
from __future__ import annotations

import logging
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any, Iterator

from pydantic import ValidationError

from . import ppg, store
from .models import VitalsFrame

log = logging.getLogger("copilot")

FRESH_S = 3.0  # a sensor frame newer than this wins over the replay
WINDOW_S = 10  # raw samples per compute_vitals() call
STEP_S = 1  # how often a new window is computed


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class Hub:
    """Latest frame from any connected sensor."""

    def __init__(self) -> None:
        self.latest: dict | None = None
        self.at: float | None = None
        self.seq = 0

    def push(self, frame: dict) -> dict:
        data = {"t": now_iso(), **frame, "source": "sensor"}
        valid = VitalsFrame.model_validate(data).model_dump(exclude_none=True)
        self.latest, self.at = valid, time.monotonic()
        self.seq += 1
        return valid

    def fresh(self) -> bool:
        return self.at is not None and time.monotonic() - self.at <= FRESH_S

    def reset(self) -> None:
        self.__init__()
        last_frames.clear()


hub = Hub()
# Latest frame sent to the app per persona (sensor or replay), quoted in flight-surgeon message drafts.
last_frames: dict[str, dict] = {}
_warned_not_implemented = False


class RawBuffer:
    """Per-connection buffer for raw samples; emits a frame every STEP_S once WINDOW_S of signal is in."""

    def __init__(self) -> None:
        self.fs: float | None = None
        self.samples: deque[float] = deque()

    def add(self, samples: list[float], fs: float) -> list[dict]:
        global _warned_not_implemented
        if self.fs != fs:
            self.fs, self.samples = fs, deque()
        self.samples.extend(float(s) for s in samples)
        size, step = int(WINDOW_S * fs), max(1, int(STEP_S * fs))
        frames = []
        while len(self.samples) >= size:
            window = list(self.samples)[:size]
            for _ in range(step):
                self.samples.popleft()
            try:
                frames.append(ppg.compute_vitals(window, fs))
            except NotImplementedError:
                if not _warned_not_implemented:
                    log.warning("Raw samples received but compute_vitals() is not implemented yet; ignoring them")
                    _warned_not_implemented = True
        return frames


def handle_message(message: Any, buffer: RawBuffer) -> tuple[int, str | None]:
    """Process one /ws/sensor message. Returns (frames accepted, error or None)."""
    if not isinstance(message, dict):
        return 0, "expected a JSON object"
    try:
        if "samples" in message:
            fs = float(message.get("fs") or 0)
            if fs <= 0:
                return 0, "raw samples need 'fs' (samples per second)"
            frames = buffer.add(message["samples"], fs)
            for frame in frames:
                hub.push(frame)
            return len(frames), None
        hub.push(message)
        return 1, None
    except (ValidationError, TypeError, ValueError) as exc:
        return 0, f"invalid frame: {exc}".splitlines()[0]


def persona_frames(pid: str = "A", start: int = 0) -> Iterator[dict]:
    """Endless frames from a persona's stream, as a fake sensor would send them (no t/source)."""
    stream = store.persona(pid, original=True)["stream"]
    i = start
    while True:
        frame = dict(stream[i % len(stream)])
        frame.pop("t", None)
        frame.pop("source", None)
        yield frame
        i += 1
