"""Health, config files, protocols and the event log."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import alerts, db, store
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


@router.get("/pvt-norms")
def pvt_norms() -> dict:
    """Reaction-test reference group (CSA PRET v4.0, data/pvt_norms.json, built by scripts/pret_pvt_stats.py)."""
    return store.load("pvt_norms.json")


@router.get("/crew-reference")
def crew_reference() -> dict:
    """Real crew blood values (NASA OSDR OSD-575, Inspiration4), reference only (data/crew_reference_osd575.json)."""
    return store.load("crew_reference_osd575.json")


@router.get("/sources")
def sources() -> dict:
    """Data sources for the /sources page (data/sources.json)."""
    return store.load("sources.json")


@router.get("/references")
def references() -> dict:
    """The medical lead's Scientific References (data/references.json, from scripts/import_medical.py)."""
    return store.load("references.json")


@router.get("/indicators")
def indicators() -> dict:
    """Master Health Indicator Catalog for the Learn pop-up (data/indicators.json, from scripts/import_medical.py)."""
    return store.load("indicators.json")


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


CV_ALERT_LINK = "/emergency?protocol=unresponsive&trigger=cv&preanswer=responsive:no"


@router.post("/events")
def post_event(event: UnresponsiveEvent, persona: str | None = None, env: str = "iss") -> dict:
    data = event.model_dump(exclude_none=True, by_alias=True)
    db.insert("events", persona=persona, t=data["t"], type=data["type"], data=data)
    alert = None
    # Unresponsive detection raised the crew alarm: also a backend alert (Act now, heart, source cv), so it shows in
    # the alerts list and the messages drawer (with a drafted message), and every screen on /ws/alerts hears it.
    # Only the detector's own alarm: the crew alarm screen and the emergency log also post "alarm" events.
    if event.type == "alarm" and event.signals.source == "cv":
        reason = event.signals.reason or "no response to the check-in"
        alert = alerts.create(persona or "A", "red", f"Crew member not responding (unresponsive detection: {reason})", "cv",
                              region="heart", link=CV_ALERT_LINK)
        if alert:
            alerts.draft_for_alert(alert, None, env)
    return {"ok": True, "alert_id": alert["id"] if alert else None}


@router.get("/events")
def get_events(persona: str | None = None, limit: int = 500) -> list:
    sql = "SELECT data FROM events" + (" WHERE persona = ?" if persona else "") + " ORDER BY id LIMIT ?"
    return [row["data"] for row in db.query(sql, ((persona, limit) if persona else (limit,)))]
