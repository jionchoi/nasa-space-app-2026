"""WebSockets.

/ws/vitals   Live vitals for the app. Sends sensor frames ("source": "sensor") while a sensor frame arrived in
             the last 3 s; otherwise replays the persona stream ("source": "replay") with fresh timestamps.
             On each switch it sends {"type": "source_changed", "source": "sensor" | "replay"} (frames never have
             a "type" field). One replay clock per persona is shared by all connections.
             ?speed=2 doubles the replay pace, ?start=170 jumps the clock. A client may send
             {"posture": "stand"} / {"posture": "sit"}: the replay then adds the persona's usual heart-rate rise
             on standing (simulation for the demo only; a real sensor needs no hint).
/ws/sensor   Input from Jian's ESP32 or a bridge script: VitalsFrames or {"samples": [...], "fs": 100}.
/ws/alerts   New alerts pushed as {"type": "alert" | "ack" | "update", "alert": {...}}; a snapshot on connect.
"""
from __future__ import annotations

import asyncio
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from . import alerts, sensor, store

router = APIRouter()
log = logging.getLogger("copilot")

IDLE_RESET_S = 30
STAND_RAMP_S = 12
SENSOR_POLL_S = 0.2


class Clock:
    def __init__(self) -> None:
        self.offset = 0.0
        self.t0 = time.monotonic()
        self.speed = 1.0
        self.clients = 0
        self.idle_since: float | None = None

    def position(self) -> float:
        return self.offset + (time.monotonic() - self.t0) * self.speed

    def jump(self, seconds: float) -> None:
        self.offset, self.t0 = seconds, time.monotonic()

    def set_speed(self, speed: float) -> None:
        self.jump(self.position())
        self.speed = min(20.0, max(0.25, speed))


clocks: dict[str, Clock] = {}


def get_clock(pid: str, speed: float | None, start: float | None) -> Clock:
    clock = clocks.setdefault(pid, Clock())
    idle = clock.idle_since is not None and time.monotonic() - clock.idle_since > IDLE_RESET_S
    if clock.clients == 0 and idle:
        clock.jump(0)
    if speed is not None:
        clock.set_speed(speed)
    if start is not None:
        clock.jump(max(0.0, start))
    clock.clients += 1
    clock.idle_since = None
    return clock


@router.websocket("/ws/vitals")
async def vitals(ws: WebSocket, persona: str = "A", speed: float | None = None, start: float | None = None):
    await ws.accept()
    data = store.persona(persona)
    stream = data["stream"]
    stand_rise = float(data["daily"][-1].get("stand_hr_rise") or 0)
    clock = get_clock(data["id"], speed, start)
    posture = {"value": "sit", "since": time.monotonic()}

    async def listen() -> None:
        try:
            while True:
                message = await ws.receive_json()
                if isinstance(message, dict) and message.get("posture") in ("sit", "stand"):
                    posture.update(value=message["posture"], since=time.monotonic())
        except Exception:  # disconnect or bad message: the sender loop notices and stops
            pass

    listener = asyncio.create_task(listen())
    mode: str | None = None
    sent_seq = -1
    try:
        while True:
            if sensor.hub.fresh():
                source, frame = "sensor", None
                if sensor.hub.seq != sent_seq:
                    frame, sent_seq = dict(sensor.hub.latest), sensor.hub.seq
            else:
                source = "replay"
                frame = dict(stream[int(clock.position()) % len(stream)])
                if posture["value"] == "stand":
                    ramp = min(1.0, (time.monotonic() - posture["since"]) / STAND_RAMP_S)
                    frame["hr"] = round(frame["hr"] + stand_rise * ramp)
            if source != mode:
                await ws.send_json({"type": "source_changed", "source": source})
                if mode is not None:
                    log.info("vitals source for %s: %s -> %s", data["id"], mode, source)
                mode = source
            if frame is not None:
                frame["t"] = sensor.now_iso()
                frame["source"] = source
                await ws.send_json(frame)
                sensor.last_frames[data["id"]] = frame
                alerts.check_frame(data["id"], frame)
            await asyncio.sleep(SENSOR_POLL_S if source == "sensor" else 1 / clock.speed)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        listener.cancel()
        clock.clients -= 1
        if clock.clients == 0:
            clock.idle_since = time.monotonic()


@router.websocket("/ws/sensor")
async def sensor_input(ws: WebSocket):
    await ws.accept()
    buffer = sensor.RawBuffer()
    log.info("sensor connected")
    try:
        while True:
            message = await ws.receive_json()
            _, error = sensor.handle_message(message, buffer)
            if error:
                await ws.send_json({"ok": False, "error": error})
    except (WebSocketDisconnect, RuntimeError, ValueError):
        log.info("sensor disconnected")


@router.websocket("/ws/alerts")
async def alerts_feed(ws: WebSocket, persona: str | None = None):
    await ws.accept()
    queue = alerts.subscribe()

    async def watch_close() -> None:
        try:
            while True:
                await ws.receive_text()
        except Exception:
            pass

    closed = asyncio.create_task(watch_close())
    try:
        await ws.send_json({"type": "snapshot", "alerts": alerts.list_alerts(persona)})
        while not closed.done():
            try:
                message = await asyncio.wait_for(queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            if persona and message["alert"].get("persona") not in (persona, None):
                continue
            await ws.send_json(message)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        closed.cancel()
        alerts.unsubscribe(queue)
