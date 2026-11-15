"""Health, config files, protocols and the event log."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import db, store
from ..models import Environment, Guidance, Labels, Measurements, Protocol, UnresponsiveEvent

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict:
    return {"ok": True}


@router.get("/environments", response_model=list[Environment], response_model_exclude_none=True)
def environments() -> list:
    return store.environments()


@router.get("/thresholds")
def thresholds() -> dict:
    return store.thresholds()


@router.get("/regions")
def regions() -> dict:
    return store.regions()


@router.get("/escalation")
def escalation() -> dict:
    return store.escalation()


@router.get("/environments/{env}")
def environment(env: str) -> dict:
    """One location, resolved: "rover:mars" gives the rover with the Mars delay and advice note."""
    data = store.environment(env)
    if data is None:
        raise HTTPException(404, f"No environment '{env}'")
    return data


@router.get("/guidance")
def guidance() -> dict:
    """What to do per region and status, and how to stay healthy (guidance.json, DRAFT)."""
    data = store.guidance()
    Guidance.model_validate(data)
    return data


@router.get("/measurements")
def measurements() -> dict:
    """How to measure, why we check and the equipment, per metric (measurements.json, DRAFT)."""
    data = store.measurements()
    Measurements.model_validate(data)
    return data


@router.get("/questionnaire")
def questionnaire() -> dict:
    return store.questionnaire()


@router.get("/cpr")
def cpr() -> dict:
    return store.load("cpr.json")


@router.get("/protocols/{protocol_id}", response_model=Protocol)
def protocol(protocol_id: str) -> dict:
    data = store.protocol(protocol_id)
    if data is None:
        raise HTTPException(404, f"No protocol '{protocol_id}'")
    return data


@router.get("/labels", response_model=Labels)
def labels() -> dict:
    return store.labels()


@router.post("/events")
def post_event(event: UnresponsiveEvent, persona: str | None = None) -> dict:
    data = event.model_dump(exclude_none=True)
    db.insert("events", persona=persona, t=data["t"], type=data["type"], data=data)
    return {"ok": True}


@router.get("/events")
def get_events(persona: str | None = None, limit: int = 500) -> list:
    sql = "SELECT data FROM events" + (" WHERE persona = ?" if persona else "") + " ORDER BY id LIMIT ?"
    return [row["data"] for row in db.query(sql, ((persona, limit) if persona else (limit,)))]
