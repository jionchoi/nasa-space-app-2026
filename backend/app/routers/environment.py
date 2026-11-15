"""Radiation (location dose feed plus the DONKI solar-event replay) and the cabin environment."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import cabin, radiation
from ..models import ReplayRequest

router = APIRouter(prefix="/api")


@router.get("/radiation")
def get_radiation(persona: str = "A", env: str = "iss") -> dict:
    """Daily dose, mission total, limit and the active solar event (if the replay is running)."""
    return radiation.summary(persona, env)


@router.post("/radiation/replay")
def replay(body: ReplayRequest) -> dict:
    """Demo control: start or stop the replay of the real DONKI event (dose simulated)."""
    if body.action == "stop":
        radiation.stop()
        return {"ok": True, "event": None}
    try:
        event = radiation.start(body.minutes)
    except FileNotFoundError as exc:
        raise HTTPException(409, str(exc)) from exc
    return {"ok": True, "event": event}


@router.get("/cabin")
def get_cabin() -> dict:
    """Current cabin CO2, temperature, humidity (real ISS telemetry replay; simulated profile as fallback), last 24 h."""
    data = cabin.summary()
    if data is None:
        raise HTTPException(404, "No data/cabin.json or cabin_simulated.json. Run scripts/import_nasa_env.py or scripts/make_cabin.py.")
    return data
