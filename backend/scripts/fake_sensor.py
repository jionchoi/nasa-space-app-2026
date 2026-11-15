"""Pretend to be Jian's sensor: send frames from a persona file to /ws/sensor.

Run from backend/ while the backend is running:
    python scripts/fake_sensor.py --persona C --start 170
    python scripts/fake_sensor.py --persona A --seconds 20     # stop after 20 s to see the app fall back to replay

The app shows "Live sensor" while frames arrive and switches back to "Replay" 3 s after they stop.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import websockets  # noqa: E402  (installed with uvicorn[standard])

from app.sensor import persona_frames  # noqa: E402


async def run(url: str, persona: str, start: int, rate: float, seconds: float | None) -> None:
    frames = persona_frames(persona, start)
    sent = 0
    async with websockets.connect(url) as ws:
        print(f"connected to {url}, sending persona {persona} from {start} s at {rate} Hz (Ctrl+C to stop)")
        while seconds is None or sent < seconds * rate:
            frame = next(frames)
            await ws.send(json.dumps(frame))
            sent += 1
            if sent % 10 == 0:
                print(f"sent {sent} frames, last HR {frame['hr']} bpm, SpO2 {frame['spo2']} %")
            try:  # the backend only answers on errors
                reply = await asyncio.wait_for(ws.recv(), timeout=1 / rate)
                print("backend:", reply)
            except asyncio.TimeoutError:
                pass
    print(f"done after {sent} frames; the app falls back to replay in about 3 s")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default="ws://localhost:8000/ws/sensor")
    parser.add_argument("--persona", default="A")
    parser.add_argument("--start", type=int, default=0, help="second of the persona stream to start from")
    parser.add_argument("--rate", type=float, default=1.0, help="frames per second")
    parser.add_argument("--seconds", type=float, default=None, help="stop after this many seconds")
    args = parser.parse_args()
    try:
        asyncio.run(run(args.url, args.persona, args.start, args.rate, args.seconds))
    except KeyboardInterrupt:
        print("stopped")


if __name__ == "__main__":
    main()
